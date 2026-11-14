(function(P){
  'use strict';
  // 03 / PRD analysis: reads the architecture graph and link budget, summarises processor / DDR /
  // storage specs, and estimates device-to-device range with the free-space path-loss model.
  const C=299792458;
  P.prdDefaults={txAntennaGainDbi:0,rxAntennaGainDbi:0,fadeMarginDb:10};
  P.validFrequency=f=>f===null||Number.isFinite(f)&&f>=0.001&&f<=1e6;
  P.validPrd=p=>!!p&&['txAntennaGainDbi','rxAntennaGainDbi'].every(k=>Number.isFinite(p[k])&&p[k]>=-50&&p[k]<=60)&&Number.isFinite(p.fadeMarginDb)&&p.fadeMarginDb>=0&&p.fadeMarginDb<=100;

  // ---------- Pure model ----------
  const fsplDb=(distanceKm,fMHz)=>20*Math.log10(distanceKm)+20*Math.log10(fMHz)+32.44;
  const distanceKm=(lossDb,fMHz)=>10**((lossDb-32.44-20*Math.log10(fMHz))/20);
  function parseFrequencyMHz(...texts){
    for(const t of texts){const m=String(t??'').match(/(\d+(?:\.\d+)?)\s*(GHz|MHz|kHz)\b/i);if(m){const v=Number(m[1]),u=m[2].toLowerCase();return u==='ghz'?v*1000:u==='khz'?v/1000:v;}}
    return null;
  }
  const componentFrequency=c=>c?parseFrequencyMHz(c.frequency,c.partNumber,c.description,c.notes,c.name):null;
  const isAntenna=c=>c?.type==='Antenna'||c?.type==='GNSS Antenna';
  const antennaOf=row=>{const id=row.kind==='tx'?row.nodeIds.at(-1):row.nodeIds[0];return isAntenna(P.component(id))?id:null;};
  const toGB={Mb:1/8192,Gb:1/8,MB:1/1024,GB:1,TB:1024};
  const capacityGB=c=>Number.isFinite(c.memoryCapacity)?c.memoryCapacity*(toGB[c.memoryUnit]??1):null;

  /** Link from device A (Tx path) to identical device B (Rx path) in free space. */
  function linkRange({txPowerDbm,rxSensitivityDbm,frequencyMHz,txAntennaGainDbi=0,rxAntennaGainDbi=0,fadeMarginDb=0}){
    const eirp=txPowerDbm+txAntennaGainDbi,mapl=eirp+rxAntennaGainDbi-rxSensitivityDbm,usable=mapl-fadeMarginDb;
    return {eirp,mapl,usable,rangeKm:distanceKm(usable,frequencyMHz),rangeNoMarginKm:distanceKm(mapl,frequencyMHz),lambdaM:C/(frequencyMHz*1e6)};
  }
  function pairs(rows){
    const out=[];
    for(const trxId of [...new Set(rows.map(r=>r.trxId))]){
      const tx=rows.filter(r=>r.trxId===trxId&&r.kind==='tx'&&r.valid),rx=rows.filter(r=>r.trxId===trxId&&r.kind==='rx'&&r.valid);
      if(!tx.length||!rx.length)continue;
      // Same device on both ends: pair Tx/Rx paths sharing an antenna (TDD through a switch); else same channel; else all.
      for(const t of tx){
        const shared=rx.filter(r=>antennaOf(r)&&antennaOf(r)===antennaOf(t)),sameCh=rx.filter(r=>r.channel===t.channel);
        const chosen=shared.length?shared:sameCh.length?sameCh:rx,rule=shared.length?'同一天線':sameCh.length?'同通道':'全部組合';
        for(const r of chosen)out.push({tx:t,rx:r,rule});
      }
    }
    return out;
  }
  /** Effective working frequency for one RF path: Link Budget setting, else parsed from its antenna / TRX. */
  function frequencyFor(row,state=P.state){
    const manual=state.linkBudget?.frequencyMHz??null;if(manual!==null)return {frequencyMHz:manual,source:'手動'};
    const ant=P.component(antennaOf(row)),trx=P.component(row.trxId),a=componentFrequency(ant),t=componentFrequency(trx);
    return a?{frequencyMHz:a,source:`自動（${ant.name}）`}:t?{frequencyMHz:t,source:`自動（${trx.name}）`}:{frequencyMHz:null,source:'未設定'};
  }
  function analyze(state=P.state,settings=state.prd||P.prdDefaults){
    const comps=state.components,missing=[];
    const need=(c,label,value)=>{if(value===null||value===undefined||value==='')missing.push(`${c.name}：缺少 ${label}`);return value;};
    const neighbours=c=>[...new Set(state.connections.flatMap(e=>e.source.componentId===c.id?[e.target.componentId]:e.target.componentId===c.id?[e.source.componentId]:[]))].map(id=>P.component(id)).filter(Boolean);
    const processors=comps.filter(c=>c.category==='Processor').map(c=>({c,cores:c.type==='CPU'?need(c,'CPU 核心數',c.cpuCores):c.cpuCores,clockMHz:c.type==='CPU'?need(c,'CPU 時脈',c.cpuClockMHz):c.cpuClockMHz,part:need(c,'Part number',c.partNumber),
      memory:neighbours(c).filter(n=>n.category==='Memory').map(n=>n.name)}));
    const memory=type=>comps.filter(c=>type(c)).map(c=>({c,gb:capacityGB(need(c,'容量',c.memoryCapacity)===null?{}:c),part:need(c,'Part number',c.partNumber),host:neighbours(c).filter(n=>n.category==='Processor').map(n=>n.name)}));
    const ddr=memory(c=>c.type==='DDR'),storage=memory(c=>c.category==='Memory'&&c.type!=='DDR');
    const rows=P.linkBudget.evaluate(state.linkBudget);
    for(const r of rows.filter(r=>!r.valid))missing.push(`${r.trx} ${r.kind.toUpperCase()}${r.channel}：Link Budget 未完成（${r.warnings[0]||'資料不足'}）`);
    const ranges=pairs(rows).map(p=>{
      const {frequencyMHz,source}=frequencyFor(p.tx,state);
      if(!frequencyMHz)return {...p,frequencyMHz:null,source};
      return {...p,frequencyMHz,source,...linkRange({...settings,txPowerDbm:p.tx.value,rxSensitivityDbm:p.rx.value,frequencyMHz})};
    });
    if(rows.some(r=>r.valid)&&ranges.some(r=>!r.frequencyMHz))missing.push('無法從天線／TRX 的 Frequency 欄位辨識工作頻率，請在第四頁 Link Budget（或本頁）填入工作頻率 (MHz)。');
    const byCategory={};for(const c of comps)(byCategory[c.category]??=[]).push(c.name);
    return {processors,ddr,storage,rows,ranges,byCategory,missing:[...new Set(missing)],settings,
      totals:{ddrGB:ddr.reduce((s,m)=>s+(m.gb??0),0),storageGB:storage.reduce((s,m)=>s+(m.gb??0),0),bestKm:Math.max(0,...ranges.filter(r=>Number.isFinite(r.rangeKm)).map(r=>r.rangeKm))}};
  }

  // ---------- UI ----------
  if(typeof document==='undefined'||!document.getElementById('checks-view')){P.prd={analyze,linkRange,fsplDb,distanceKm,parseFrequencyMHz,pairs,frequencyFor};return;}
  const $=id=>document.getElementById(id),view=$('checks-view');
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(className)n.className=className;return n;};
  const num=(v,d=2)=>Number.isFinite(v)?Number(v.toFixed(d)).toString():'—';
  const dist=km=>!Number.isFinite(km)?'—':km>=1?`${num(km,2)} km`:`${num(km*1000,km<0.01?2:0)} m`;
  const gb=v=>!Number.isFinite(v)?'—':v>=1?`${num(v,2)} GB`:`${num(v*1024,1)} MB`;
  const pending=v=>v===null||v===undefined||v===''?make('span','待補','prd-missing'):String(v);
  function table(headers,rows,empty){const wrap=make('div',undefined,'budget-table-wrap');if(!rows.length){wrap.append(make('p',empty,'prd-empty'));return wrap;}const t=make('table'),head=make('thead'),tr=make('tr');headers.forEach(h=>tr.append(make('th',h)));head.append(tr);t.append(head);const body=make('tbody');rows.forEach(row=>{const tr=make('tr');row.forEach(v=>{const td=make('td');if(v instanceof Node)td.append(v);else td.textContent=v??'—';tr.append(td);});body.append(tr);});t.append(body);wrap.append(t);return wrap;}
  function section(id,number,title,note){const s=make('section',undefined,'prd-section');s.id=id;const h=make('h2');h.append(make('span',number,'prd-num'),document.createTextNode(title));s.append(h);if(note)s.append(make('p',note,'prd-note'));return s;}

  view.replaceChildren();
  const heading=make('div',undefined,'stage-heading');heading.append(make('span','03 / PRD ANALYSIS','eyebrow'),make('h1','產品需求分析 · 由架構圖自動彙整'),make('p','自動讀取第一頁方塊的規格欄位（CPU、DDR、儲存記憶體）與第四頁 RF Link Budget 結果，並以自由空間路徑損耗估算兩台相同裝置對連的最大距離。修改方塊屬性後本頁即時更新；標示「待補」的欄位請在第一頁右側 Properties 填寫。'));
  const controls=make('div',undefined,'budget-controls prd-controls');
  const inputs={};
  for(const [key,label,attrs] of [['frequencyMHz','工作頻率 (MHz，與 Link Budget 共用)',{min:.001,max:1e6,step:'any',placeholder:'自動偵測'}],['txAntennaGainDbi','Tx 天線增益 (dBi)',{min:-50,max:60,step:.1}],['rxAntennaGainDbi','Rx 天線增益 (dBi)',{min:-50,max:60,step:.1}],['fadeMarginDb','衰落餘裕 Fade margin (dB)',{min:0,max:100,step:.5}]]){
    const l=make('label',label),i=make('input');i.type='number';i.id='prd-'+key;Object.assign(i,attrs);l.append(i);controls.append(l);inputs[key]=i;
    i.addEventListener('change',()=>{const raw=i.value.trim(),value=raw===''?(key==='frequencyMHz'?null:NaN):Number(raw);
      if(key==='frequencyMHz'){if(!P.validFrequency(value)){$('prd-status').textContent='工作頻率須為 0.001–1,000,000 MHz（空白＝自動偵測）。';render();return;}P.state.linkBudget={...P.state.linkBudget,frequencyMHz:value};$('prd-status').textContent='';P.notify('link-budget-update');return;}
      const next={...(P.state.prd||P.prdDefaults),[key]:value};
      if(!P.validPrd(next)){$('prd-status').textContent='請輸入有效數值：頻率 0.001–1,000,000 MHz（空白＝自動），天線增益 −50～60 dBi，Fade margin 0～100 dB。';render();return;}
      P.state.prd=next;$('prd-status').textContent='';P.notify('prd-update');});
  }
  const save=make('button','儲存專案');save.id='prd-save';save.onclick=()=>{if(P.saveProject())$('prd-status').textContent='專案與 PRD 設定已儲存。';};controls.append(save);
  const status=make('p',undefined,'prd-status');status.id='prd-status';status.setAttribute('role','status');
  const summary=make('div',undefined,'budget-summary');summary.id='prd-summary';
  const body=make('div',undefined,'prd-body');body.id='prd-body';
  view.append(heading,controls,status,summary,body);

  function render(){
    const s=P.state.prd||P.prdDefaults,a=analyze(P.state,s);
    for(const [key,input] of Object.entries(inputs))if(document.activeElement!==input)input.value=(key==='frequencyMHz'?P.state.linkBudget.frequencyMHz:s[key])??'';
    summary.replaceChildren();
    const okRows=a.rows.filter(r=>r.valid).length;
    for(const [label,value] of [['方塊總數',P.state.components.length],['處理器',a.processors.length],['DDR 總容量',a.ddr.length?gb(a.totals.ddrGB):'—'],['儲存記憶體',a.storage.length?gb(a.totals.storageGB):'—'],['RF 路徑完成',`${okRows} / ${a.rows.length}`],['最遠對連距離',a.ranges.length?dist(a.totals.bestKm):'—']]){const card=make('article');card.append(make('small',label),make('strong',value));summary.append(card);}
    body.replaceChildren();

    const sys=section('prd-system','1','系統組成','依方塊類別彙整第一頁架構圖。');
    sys.append(table(['類別','數量','方塊'],Object.entries(a.byCategory).map(([k,v])=>[k,v.length,v.join('、')]),'第一頁尚無方塊。'));body.append(sys);

    const cpu=section('prd-cpu','2','運算 · CPU / 處理器規格','CPU 核心數與時脈取自方塊的「CPU 規格」欄位；電壓、功耗取自 Voltage／Power 欄位。');
    cpu.append(table(['方塊','類型','Vendor','Part number','核心數','時脈','電壓','功耗','連接記憶體'],a.processors.map(p=>[p.c.name,p.c.type,p.c.vendor||'—',pending(p.c.partNumber),p.c.type==='CPU'?pending(p.cores):(p.cores??'—'),p.clockMHz?`${num(p.clockMHz)} MHz`:(p.c.type==='CPU'?pending(null):'—'),p.c.voltage||'—',p.c.power||'—',p.memory.join('、')||'—']),'架構圖中沒有 Processor 類別方塊（CPU／SoC／MCU／FPGA）。'));body.append(cpu);

    const memRows=list=>list.map(m=>[m.c.name,m.c.type,m.c.vendor||'—',pending(m.c.partNumber),Number.isFinite(m.c.memoryCapacity)?`${m.c.memoryCapacity} ${m.c.memoryUnit}`:pending(null),m.c.frequency||'—',m.c.voltage||'—',m.host.join('、')||'—']);
    const ddr=section('prd-ddr','3','DDR 規格','容量取自「記憶體 / 儲存容量」欄位，速率／頻率取自 Frequency 欄位；「連接處理器」依第一頁連線判斷。');
    ddr.append(table(['方塊','類型','Vendor','Part number','容量','速率 / 頻率','電壓','連接處理器'],memRows(a.ddr),'架構圖中沒有 DDR 方塊。'));body.append(ddr);
    const mem=section('prd-memory','4','記憶體 · 儲存規格（eMMC / Flash / EEPROM）');
    mem.append(table(['方塊','類型','Vendor','Part number','容量','速率 / 頻率','電壓','連接處理器'],memRows(a.storage),'架構圖中沒有 eMMC／Flash／EEPROM 方塊。'));body.append(mem);

    const lb=section('prd-link-budget','5','RF Link Budget 結果',`取自第四頁計算：Rx 雜訊頻寬 ${P.state.linkBudget.bandwidthMHz} MHz、所需 SNR ${P.state.linkBudget.snrDb} dB。Tx 為天線饋入端最大功率；Rx 為天線端輸入靈敏度。`);
    lb.append(table(['TRX / 通道','RF 路徑','Tx Max power (dBm)','Rx Sensitivity (dBm)','Cascade NF (dB)','狀態'],a.rows.map(r=>[`${r.trx} / ${r.kind.toUpperCase()} ${r.channel}`,r.path,r.kind==='tx'?num(r.value):'—',r.kind==='rx'?num(r.value):'—',r.kind==='rx'?num(r.nf):'—',make('span',r.valid?(r.warnings.length?'有條件估算':'估算完成'):'未完成',r.valid?'budget-valid':'budget-invalid')]),'尚無 RF Transceiver（TRX），沒有 Link Budget 結果。'));body.append(lb);

    const range=section('prd-range','6','連線距離預估 · 裝置對連（自由空間）','假設兩端為相同裝置：A 的 Tx 路徑 → B 的 Rx 路徑，視距 (LOS) 且無遮蔽、無多路徑。MAPL = P_tx + G_tx + G_rx − Sensitivity；可用路損 = MAPL − Fade margin；FSPL(dB) = 20·log₁₀(d_km) + 20·log₁₀(f_MHz) + 32.44。');
    range.append(table(['TRX · 配對','頻率','EIRP (dBm)','Sensitivity (dBm)','MAPL (dB)','預估距離（含 margin）','理論上限（0 dB margin）','A · Tx 路徑 → B · Rx 路徑'],a.ranges.map(r=>[`${r.tx.trx}\nTX${r.tx.channel} → RX${r.rx.channel} · ${r.rule}`,r.frequencyMHz?`${num(r.frequencyMHz)} MHz\n${r.source}`:pending(null),num(r.eirp),num(r.rx.value),num(r.mapl),Object.assign(make('strong',dist(r.rangeKm)),{className:'prd-range'}),dist(r.rangeNoMarginKm),`A：${r.tx.path}\nB：${r.rx.path}`]),a.rows.length?'需同一顆 TRX 至少各有一條「估算完成」的 Tx 與 Rx 路徑，才能估算對連距離。':'尚無 RF Transceiver（TRX）。'));
    range.append(make('p','說明：自由空間模型為最佳情況（上限），未計入大氣／雨衰、地面反射、Fresnel 區遮蔽、極化不匹配、纜線至天線外部損耗與調變 back-off。天線增益為本頁的全域假設值，未從方塊讀取。','prd-note'));body.append(range);

    const gaps=section('prd-gaps','7','待補資料 / Open items');
    if(a.missing.length){const ul=make('ul',undefined,'prd-gaps');a.missing.forEach(m=>ul.append(make('li',m)));gaps.append(ul);}else gaps.append(make('p','所有 PRD 欄位皆已填寫。','budget-valid'));
    body.append(gaps);
  }
  P.subscribe(({type})=>{if(P.ui.tab==='checks'&&!['selection','tab','warning','mode','move'].includes(type))render();else if(['project-load','prd-update','link-budget-update'].includes(type))render();});
  P.prd={analyze,linkRange,fsplDb,distanceKm,parseFrequencyMHz,pairs,frequencyFor};
  P.prdUI={render};
})(window.Planner);
