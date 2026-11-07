(function(P){
  'use strict';
  P.isTrx=c=>!!c&&['RF Transceiver','TRX','Trx'].includes(c.type);
  P.isRfSignal=c=>!!c&&(P.isTrx(c)||['PA','LNA','RF Switch','Balun','Filter','Duplexer','Antenna','GNSS Antenna'].includes(c.type));
  P.isRfPair=(source,target)=>P.isRfSignal(P.component(source.componentId))&&P.isRfSignal(P.component(target.componentId));
  P.rfConnectionCandidates=()=>P.state.connections.filter(e=>e.interfaceType==='Digital'&&!e.source.portId&&!e.target.portId&&P.isRfPair(e.source,e.target));
  P.rfFields=c=>P.isTrx(c)?[
    ['txChannels','Tx 路數',1,4,1],['rxChannels','Rx 路數',1,4,1],
    ['txPower','Tx DA Power (dBm)',-100,100,.1],['rxGain','Rx LNA Gain (dB)',-100,100,.1],['rxNf','Rx LNA NF (dB)',0,100,.1]
  ]:c.type==='PA'?[['rfGain','Gain (dB)',-100,100,.1],['p1db','Output P1dB (dBm)',-100,100,.1]]:
    c.type==='LNA'?[['rfGain','Gain (dB)',-100,100,.1],['rfNf','NF (dB)',0,100,.1]]:
    c.type==='RF Switch'?[['rfPortCount','RF 分支 Port 數量',1,32,1]]:['Filter','Duplexer','Balun'].includes(c.type)?[['rfLoss','Loss (dB)',0,100,.1],['maxInput','Max Input Level (dBm)',-100,100,.1]]:[];
  P.rfDefaults=c=>Object.fromEntries(P.rfFields(c).map(([k])=>[k,k==='rfPortCount'?2:['txChannels','rxChannels'].includes(k)?1:null]));
  P.validRf=(c,changes)=>P.rfFields(c).every(([k,,min,max,step])=>!(k in changes)||(changes[k]===null&&step!==1)||(Number.isFinite(changes[k])&&changes[k]>=min&&changes[k]<=max&&(step!==1||Number.isInteger(changes[k]))));
  P.validRfPort=p=>(p.signalMode===undefined||['single','differential'].includes(p.signalMode))&&['loss','maxLevel'].every(k=>p[k]===undefined||p[k]===null||Number.isFinite(p[k])&&p[k]>=(k==='loss'?0:-100)&&p[k]<=100);
  P.rfSpecs=c=>P.isTrx(c)?[...Array.from({length:c.txChannels},(_,i)=>({key:'tx:'+(i+1),name:'TX'+(i+1),side:'right',direction:'output'})),...Array.from({length:c.rxChannels},(_,i)=>({key:'rx:'+(i+1),name:'RX'+(i+1),side:'right',direction:'input'}))]:c.type==='RF Switch'?[...Array.from({length:c.rfPortCount},(_,i)=>({key:'rf:'+(i+1),name:'RF'+(i+1),side:'left',direction:'bidirectional'})),{key:'rfc',name:'RFC',side:'right',direction:'bidirectional'}]:c.type==='Balun'?[{key:'balanced',name:'BAL +/−',side:'left',direction:'bidirectional',signalMode:'differential'},{key:'unbalanced',name:'UNBAL',side:'right',direction:'bidirectional',signalMode:'single'}]:[];
  P.canSyncRfPorts=(c,state=P.state)=>{
    const keys=new Set(P.rfSpecs(c).map(s=>s.key));
    return !state.ports.some(p=>p.componentId===c.id&&p.rfKey&&!keys.has(p.rfKey)&&state.connections.some(e=>e.source.portId===p.id||e.target.portId===p.id));
  };
  P.syncRfPorts=(c,state=P.state)=>{
    const specs=P.rfSpecs(c);if(!specs.length)return;
    if(!P.canSyncRfPorts(c,state))throw new Error('減少路數前，請先移除超出範圍 RF port 的連線。');
    const existing=state.ports.filter(p=>p.componentId===c.id&&p.type==='RF'),used=new Set();
    if(c.type==='RF Switch'&&c.rfPortLayout!=='common-v1'){
      // Adopt the previous right-hand RF port as the common port without
      // breaking its UUID, connected edges, or user-entered RF values.
      const previous=existing.filter(p=>p.rfKey?.startsWith('rf:')&&p.side==='right').at(-1);
      if(previous&&!existing.some(p=>p.rfKey==='rfc'))previous.rfKey='rfc';
      c.rfPortLayout='common-v1';
    }

    for(const spec of specs){
      let port=existing.find(p=>p.rfKey===spec.key);
      if(!port)port=existing.find(p=>!p.rfKey&&!used.has(p.id)&&(spec.direction==='bidirectional'||p.direction===spec.direction));
      if(!port){port={id:P.uuid(),componentId:c.id,maxConnections:1,type:'RF',...spec};delete port.key;state.ports.push(port);}
      used.add(port.id);port.rfKey=spec.key;port.name=spec.name;port.direction=spec.direction;
      port.side=spec.side;port.signalMode=spec.signalMode||port.signalMode||'single';
      for(const e of state.connections)for(const end of [e.source,e.target])if(end.portId===port.id)end.anchor=port.side;
      if(c.type==='RF Switch'){port.loss=port.loss??null;port.maxLevel=port.maxLevel??null;}
    }
    const wanted=new Set(specs.map(s=>s.key));state.ports=state.ports.filter(p=>p.componentId!==c.id||!p.rfKey||wanted.has(p.rfKey));
    const count=side=>state.ports.filter(p=>p.componentId===c.id&&p.side===side).reduce((n,p)=>n+(p.signalMode==='differential'?2:1),0);
    c.width=Math.max(c.width,(Math.max(count('top'),count('bottom'))+2)*24);c.height=Math.max(c.height,(Math.max(count('left'),count('right'))+2)*24);
  };
  P.rfEndpointMode=end=>P.port(end.portId)?.signalMode||'single';
  P.rfDifferential=e=>e.interfaceType==='RF'&&!e.source.polarity&&!e.target.polarity&&[e.source,e.target].some(end=>P.rfEndpointMode(end)==='differential');
  P.rfPair=e=>{
    if(e.interfaceType!=='RF'||![e.source,e.target].some(end=>P.rfEndpointMode(end)==='differential'))return null;
    if([e.source,e.target].some(end=>P.rfEndpointMode(end)!=='differential'))return {error:'單端／差分模式不匹配，請使用 Balun'};
    const sign=end=>end.polarity||'+';
    if(sign(e.source)!==sign(e.target))return {error:'差分極性錯接，請將 + 接 +、− 接 −'};
    const same=(a,b)=>a.componentId===b.componentId&&a.portId===b.portId;
    const other=P.state.connections.find(x=>x.id!==e.id&&x.interfaceType==='RF'&&same(x.source,e.source)&&same(x.target,e.target)&&sign(x.source)!==sign(e.source)&&sign(x.target)!==sign(e.target));
    if(!other)return {error:'差分配對未完整：請同時連接 + 與 − 端點'};
    if(other.loss!==e.loss||other.rfMode!==e.rfMode)return {other,error:'差分兩線的 Loss／RF 路徑方向須一致；目前未模型化不平衡損耗'};
    return {other};
  };
  P.rfPairRepresentative=e=>{const pair=P.rfPair(e);return !pair?.other||(e.source.polarity||'+')==='+';};
  P.rfLane=(e,kind,trx)=>{
    const end=e.source.componentId===trx.id?e.source:e.target,port=P.port(end.portId);
    if(port?.rfKey&&P.isTrx(trx)){const [role,n]=port.rfKey.split(':');return role===kind?Number(n):0;}
    return e[kind==='tx'?'txChannel':'rxChannel'];
  };
  P.validRfEdge=e=>Number.isFinite(e.loss)&&e.loss>=0&&e.loss<=100&&['auto','tx','rx','both'].includes(e.rfMode)&&['txChannel','rxChannel'].every(k=>Number.isInteger(e[k])&&e[k]>=1&&e[k]<=4);
})(window.Planner);
