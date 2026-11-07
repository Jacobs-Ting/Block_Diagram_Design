(function(P){
  'use strict';
  const passive=['Filter','RF Switch','Duplexer','Balun'],antenna=c=>c?.type==='Antenna'||c?.type==='GNSS Antenna';
  const db=x=>10*Math.log10(x),lin=x=>10**(x/10);
  function routes(trx,kind,channel){
    const results=[],rf=P.state.connections.filter(e=>e.interfaceType==='RF'&&P.rfPairRepresentative(e)&&(e.rfMode==='auto'||e.rfMode==='both'||e.rfMode===kind));
    function neighbors(id){const out=[];for(const e of rf){const forward=kind==='tx'?e.source:e.target,back=kind==='tx'?e.target:e.source;
      if(forward.componentId===id)out.push({edge:e,next:back.componentId});
      else if(e.rfMode==='both'&&back.componentId===id)out.push({edge:e,next:forward.componentId});
    }return out;}
    const starters=neighbors(trx.id).filter(n=>P.rfLane(n.edge,kind,trx)===channel);
    let truncated=false,visits=0;
    function walk(id,nodes,edges,seen,warnings){
      if(results.length>=64||++visits>2000){truncated=true;return;}
      const c=P.component(id);
      if(antenna(c)){results.push({nodes,edges,warnings,complete:true});return;}
      if(!c||P.isTrx(c)&&id!==trx.id){results.push({nodes,edges,warnings:[...warnings,'路徑終止於另一顆 TRX'],complete:false});return;}
      let next=neighbors(id).filter(n=>!edges.includes(n.edge));
      if(c.type==='RF Switch'&&edges.length){
        const at=e=>P.port((e.source.componentId===id?e.source:e.target).portId),entry=at(edges.at(-1));
        if(entry?.rfKey)next=next.filter(n=>{const exit=at(n.edge);return !exit?.rfKey||(entry.rfKey==='rfc')!==(exit.rfKey==='rfc');});
      }

      if(!next.length){const blocked=P.rfConnectionCandidates().filter(e=>e.source.componentId===id||e.target.componentId===id).map(e=>`${P.component(e.source.componentId).name} → ${P.component(e.target.componentId).name}：Digital 線未納入計算，請設為 RF`);results.push({nodes,edges,warnings:[...warnings,'路徑未接到 Antenna',...blocked],complete:false});return;}
      const branched=next.length>1?[...warnings,'RF 分支：未模型化分配器／開關狀態，數值僅代表單一路徑切換使用']:warnings;
      for(const n of next){if(seen.has(n.next)){results.push({nodes,edges,warnings:[...branched,'偵測到迴路，停止計算'],complete:false});continue;}
        walk(n.next,[...nodes,n.next],[...edges,n.edge],new Set([...seen,n.next]),branched);
      }
    }
    for(const s of starters)walk(s.next,[trx.id,s.next],[s.edge],new Set([trx.id,s.next]),starters.length>1?['同一通道有多個 RF 入口／出口，請核對通道或開關狀態']:[]);
    if(!results.length){
      const candidates=P.rfConnectionCandidates().filter(e=>e.source.componentId===trx.id||e.target.componentId===trx.id);
      const diagnostics=candidates.map(e=>`${P.component(e.source.componentId).name} → ${P.component(e.target.componentId).name}：連線類型為 Digital，請設為 RF`);
      results.push({nodes:[trx.id],edges:[],warnings:['此通道尚未連接 RF 路徑',...diagnostics],complete:false});
    }
    if(truncated)for(const r of results){r.warnings.push('路徑過多（最多 64 條／2000 次搜尋），結果不完整');r.complete=false;}
    return results;
  }
  function calculate(trx,kind,channel,route,settings){
    let warnings=[...route.warnings],valid=route.complete;
    const requireValue=(c,key)=>{const v=c[key];if(!Number.isFinite(v)){warnings.push(`${c.name}：缺少 ${key}`);valid=false;return NaN;}return v;};
    const nodes=kind==='tx'?route.nodes:[...route.nodes].reverse(),edges=kind==='tx'?route.edges:[...route.edges].reverse(),stages=[];
    const add=(name,gain,nf,cap=null,ref=null)=>stages.push({name,gain,nf,cap,ref});
    if(kind==='tx')add(`${trx.name} Tx DA`,0,null,requireValue(trx,'txPower'),'output');
    for(let i=0;i<nodes.length;i++){
      const c=P.component(nodes[i]);if(!c)continue;
      if(i>0){const e=edges[i-1];add(`線路 ${e.label||e.id.slice(0,8)}`,-e.loss,kind==='rx'?e.loss:null);}
      if(i>0){const e=edges[i-1],pair=P.rfPair(e);if(pair?.error){warnings.push(pair.error);valid=false;}if(P.rfEndpointMode(e.source)!==P.rfEndpointMode(e.target)){warnings.push(`線路 ${e.label||e.id.slice(0,8)}：單端／差分模式不匹配，請使用 Balun 轉換`);valid=false;}}
      if(c.type==='Balun'){
        const ends=[edges[i-1],edges[i]].filter(Boolean).map(e=>P.port((e.source.componentId===c.id?e.source:e.target).portId));
        if(ends.length!==2||!ends.some(p=>p?.rfKey==='balanced')||!ends.some(p=>p?.rfKey==='unbalanced')){warnings.push(`${c.name}：請從 BAL 差分端連至 UNBAL 單端（或反向）`);valid=false;}
      }
      if(antenna(c))continue;
      if(P.isTrx(c)){if(kind==='rx')add(`${c.name} Rx LNA`,requireValue(c,'rxGain'),requireValue(c,'rxNf'));continue;}
      if(c.type==='RF Switch'){
        const connected=[edges[i-1],edges[i]].filter(Boolean).map(e=>{const end=e.source.componentId===c.id?e.source:e.target;return P.port(end.portId);});
        if(connected.length!==2||connected.some(p=>!p||p.componentId!==c.id||p.type!=='RF')){
          if(connected.every(p=>!p)&&Number.isFinite(c.rfLoss)&&Number.isFinite(c.maxInput)){warnings.push(`${c.name}：舊版元件總 Loss 模型；請改接 RF ports 並填入各 port 參數`);add(c.name,-c.rfLoss,kind==='rx'?c.rfLoss:null,kind==='tx'?c.maxInput:null,'input');}
          else {warnings.push(`${c.name}：請將兩端 RF 線連到不同 RF ports，並填入每個 port 的 Loss／Max Level`);valid=false;}
        }else if(connected[0].id===connected[1].id){warnings.push(`${c.name}：入口與出口不能使用同一 RF port`);valid=false;}
        else if((connected[0].rfKey==='rfc')===(connected[1].rfKey==='rfc')){warnings.push(`${c.name}：RF Switch 路徑必須連接 RF 分支與 RFC 共用端`);valid=false;}
        else for(const port of connected){
          const label={...port,name:`${c.name} / ${port.name}`},loss=requireValue(label,'loss'),limit=kind==='tx'?requireValue(label,'maxLevel'):port.maxLevel;
          add(label.name,-loss,kind==='rx'?loss:null,kind==='tx'?limit:null,'input');
        }
      }
      else if(passive.includes(c.type)){const loss=requireValue(c,'rfLoss');const limit=kind==='tx'?requireValue(c,'maxInput'):c.maxInput;add(c.name,-loss,kind==='rx'?loss:null,kind==='tx'?limit:null,'input');}
      else if(c.type==='PA'&&kind==='tx')add(c.name,requireValue(c,'rfGain'),null,requireValue(c,'p1db'),'output');
      else if(c.type==='LNA'){add(c.name,requireValue(c,'rfGain'),kind==='rx'?requireValue(c,'rfNf'):null);if(kind==='tx')warnings.push(`${c.name}：Tx 計入線性 Gain，但未提供壓縮／最大輸出模型`);}
      else {warnings.push(`${c.name} (${c.type})：沒有此方向的 RF 模型`);valid=false;}
    }
    let gain=0,noise=1,product=1,drive=Infinity,limiter='';
    for(const s of stages){s.gainBefore=gain;
      if(kind==='tx'&&s.cap!==null){const cap=s.cap-gain-(s.ref==='output'?s.gain:0);if(cap<drive){drive=cap;limiter=s.name+' '+(s.ref==='input'?'Max Input':'輸出限制');}}
      if(kind==='rx'){noise+=(lin(s.nf)-1)/product;product*=lin(s.gain);}
      gain+=s.gain;s.cumulativeGain=gain;
      if(kind==='rx')s.cumulativeNf=db(noise);
    }
    const nf=kind==='rx'?db(noise):null,value=kind==='tx'?drive+gain:-174+10*Math.log10(settings.bandwidthMHz*1e6)+nf+settings.snrDb;
    if(valid&&(!Number.isFinite(value)||kind==='rx'&&(!Number.isFinite(noise)||noise<1))){valid=false;warnings.push('計算超出數值範圍');}
    for(const s of stages)if(kind==='tx')s.power=valid?drive+s.cumulativeGain:null;
    return {trxId:trx.id,trx:trx.name,kind,channel,path:nodes.map(id=>P.component(id)?.name||'?').join(' → '),nodeIds:nodes,edgeIds:[...new Set(edges.flatMap(e=>[e.id,...(P.rfPair(e)?.other?[P.rfPair(e).other.id]:[])]))],valid,value:valid?value:null,gain:valid?gain:null,nf:valid?nf:null,limiter:kind==='tx'?limiter:'',drive:valid&&kind==='tx'?drive:null,stages,warnings:[...new Set(warnings)]};
  }
  function evaluate(settings=P.state.linkBudget){
    const rows=[];
    for(const trx of P.state.components.filter(P.isTrx))for(const kind of ['tx','rx']){
      const count=trx[kind==='tx'?'txChannels':'rxChannels'];
      for(let channel=1;channel<=count;channel++)for(const route of routes(trx,kind,channel))rows.push(calculate(trx,kind,channel,route,settings));
      for(const e of P.state.connections.filter(e=>e.interfaceType==='RF'&&(e.source.componentId===trx.id||e.target.componentId===trx.id))){const c=P.rfLane(e,kind,trx);if(c>count)for(const row of rows.filter(r=>r.trxId===trx.id&&r.kind===kind))row.warnings.push(`${e.label||e.id.slice(0,8)} 的 ${kind.toUpperCase()} 通道 ${c} 超出 TRX 路數 ${count}`);}
    }
    return rows;
  }
  P.linkBudget={evaluate,routes};
})(window.Planner);
