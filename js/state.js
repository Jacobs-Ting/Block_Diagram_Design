(function (P) {
  'use strict';
  P.uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  P.sides = ['top','right','bottom','left'];
  P.interfaces = ['Digital','PCIe','USB','SPI','I2C','UART','GPIO','MIPI','SerDes','Ethernet','RF','Clock','Power','Ground','Analog'];
  P.fonts = ['Segoe UI','Arial','Verdana','Tahoma','Trebuchet MS','Georgia','Times New Roman','Courier New','Consolas'];
  P.shapes = ['rectangle','circle','triangle','diamond'];
  P.interfaceColors = {Digital:'#96adca',PCIe:'#83acff',USB:'#af9dfa',SPI:'#78c6dc',I2C:'#78c6dc',UART:'#98b8cc',GPIO:'#98b8cc',MIPI:'#d1a5ef',SerDes:'#83acff',Ethernet:'#79d4ca',RF:'#61d3b3',Clock:'#e6c57d',Power:'#ed9b79',Ground:'#9da8b4',Analog:'#d996bd'};
  P.state = {project:{id:P.uuid(),name:'5G UAV Communication Platform',version:3},appearance:{theme:'dark'},workspace:{width:1400,height:850},board:{width:160,height:100,thickness:1.6,unit:'mm'},linkBudget:{bandwidthMHz:20,snrDb:10,frequencyMHz:null},prd:{txAntennaGainDbi:0,rxAntennaGainDbi:0,fadeMarginDb:10},components:[],ports:[],connections:[],textBoxes:[],placements:[],zones:[],rules:{rfPa:50,paAntenna:50,cpuDdr:40,pcie:100,clock:80,power:60,antennaRadius:30}};
  P.ui = {tab:'architecture',selected:null,selectedKind:null,snap:true,mode:'select'};
  const listeners = new Set();
  P.subscribe = fn => {listeners.add(fn);return()=>listeners.delete(fn);};
  P.notify = (type,id) => listeners.forEach(fn=>fn({type,id}));
  P.warn = message => {P.ui.warning=message;P.notify('warning');return null;};
  P.component = id => P.state.components.find(c=>c.id===id);
  P.port = id => P.state.ports.find(p=>p.id===id);
  P.connection = id => P.state.connections.find(c=>c.id===id);
  P.componentPorts = id => P.state.ports.filter(p=>p.componentId===id);
  P.minimumSize = id => {
    const c=P.component(id),ports=P.componentPorts(id);
    const count=side=>ports.filter(p=>p.side===side).reduce((n,p)=>n+(p.signalMode==='differential'?2:1),0);
    return {width:Math.max(c?.minWidth||180,(Math.max(count('top'),count('bottom'))+2)*24),height:Math.max(c?.minHeight||112,(Math.max(count('left'),count('right'))+2)*24)};
  };
  P.addComponent = (name,x=70,y=100,extra={},createPorts=true) => {
    const template=P.library.find(c=>c.name===name)||{name,category:'Other'};
    const c={name:template.name,type:template.name,category:template.category,shape:'rectangle',vendor:'',partNumber:'',description:'',voltage:'',frequency:'',power:'',notes:'',renderColor:'#1c2938',textColor:'#dce5ee',fontFamily:'Segoe UI',fontSize:15,x,y,width:200,height:112,rotation:0,icWidth:12,icHeight:12,icThickness:1.5,icPackage:'QFN',icPinCount:6,minWidth:180,minHeight:112,packageSpec:'',componentValue:'',...(P.isPassive({type:name})?{icPackage:'0402',...P.imperialPackages['0402'],icThickness:0.5}:template.category==='Connector'?{icPackage:'Custom'}:{}),...P.componentExtraDefaults,...P.rfDefaults({type:template.name}),...extra,id:P.uuid()};
    P.state.components.push(c);if(createPorts)P.syncRfPorts(c);P.notify('add',c.id);return c;
  };
  P.ui.selection=[];
  P.isSelected = (id,kind) => P.ui.selection.some(item=>item.id===id&&item.kind===kind);
  P.selectMany = items => {
    const unique=new Map();
    for(const item of items){const exists=item.kind==='component'?P.component(item.id):item.kind==='connection'?P.connection(item.id):item.kind==='line'?P.line(item.id):item.kind==='text'?P.textBox(item.id):null;if(exists)unique.set(item.kind+item.id,{id:item.id,kind:item.kind});}
    P.ui.selection=[...unique.values()];const only=P.ui.selection.length===1?P.ui.selection[0]:null;
    P.ui.selected=only?.id||null;P.ui.selectedKind=only?.kind||(P.ui.selection.length?'multiple':null);
    P.notify('selection',P.ui.selected);
  };
  P.select = (id,kind='component') => P.selectMany(id?[{id,kind}]:[]);
  P.setMode = mode => {P.ui.mode=['connect','line','text','pan'].includes(mode)?mode:'select';P.notify('mode');};
  P.setTheme = theme => {P.state.appearance.theme=theme==='light'?'light':'dark';P.notify('theme');};
  P.resizeWorkspace = (width,height) => {
    width=Math.round(Number(width));height=Math.round(Number(height));
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<400||height<300||width>10000||height>10000)return P.warn('工作區寬度須為 400–10000，高度須為 300–10000。');
    P.state.workspace={width,height};P.ui.warning='';P.notify('workspace-resize');return true;
  };
  // Free drawing objects have canvas coordinates and no electrical endpoints.
  P.state.lines=[];
  P.line = id => P.state.lines.find(line=>line.id===id);
  function validLine(line){return ['x1','y1','x2','y2'].every(key=>Number.isFinite(line[key]))&&Math.hypot(line.x2-line.x1,line.y2-line.y1)>=4&&['none','start','end','both'].includes(line.arrows);}
  P.addLine = (coordinates,options={}) => {
    const line={x1:coordinates.x1,y1:coordinates.y1,x2:coordinates.x2,y2:coordinates.y2,id:P.uuid(),label:options.label||'',arrows:options.arrows||'end'};
    if(!validLine(line))return null;
    P.state.lines.push(line);P.notify('line-add',line.id);return line;
  };
  P.updateLine = (id,changes) => {
    const line=P.line(id);if(!line)return false;
    const next={...line};for(const key of ['x1','y1','x2','y2','arrows','label'])if(key in changes)next[key]=changes[key];
    if(!validLine(next))return false;Object.assign(line,next);P.notify('line-update',id);return true;
  };
  P.removeLine = id => {P.state.lines=P.state.lines.filter(line=>line.id!==id);if(P.ui.selected===id){P.ui.selected=null;P.ui.selectedKind=null;}P.notify('line-remove',id);};
  P.textBox = id => P.state.textBoxes.find(box=>box.id===id);
  P.addTextBox = (geometry,options={}) => {
    const box={id:P.uuid(),x:geometry.x,y:geometry.y,width:Math.max(80,geometry.width||240),height:Math.max(40,geometry.height||100),text:options.text||'輸入文字',fontSize:options.fontSize||18,fontFamily:options.fontFamily||'Segoe UI',textColor:options.textColor||'#dce5ee',backgroundColor:options.backgroundColor||'#1c2938',borderColor:options.borderColor||'#60778b'};
    P.state.textBoxes.push(box);P.notify('text-add',box.id);return box;
  };
  P.updateTextBox = (id,changes) => {
    const box=P.textBox(id);if(!box)return false;const next={...box,...changes};
    if(!['x','y','width','height','fontSize'].every(key=>Number.isFinite(next[key]))||next.width<80||next.height<40||next.fontSize<8||next.fontSize>96||!P.fonts.includes(next.fontFamily)||![next.textColor,next.backgroundColor,next.borderColor].every(color=>/^#[0-9a-f]{6}$/i.test(color)))return false;
    Object.assign(box,next);P.notify('text-update',id);return true;
  };
  P.removeTextBox = id => {P.state.textBoxes=P.state.textBoxes.filter(box=>box.id!==id);if(P.ui.selected===id)P.select(null);P.notify('text-remove',id);};
  P.update = (id,changes,type='update') => {
    const c=P.component(id);if(!c)return false;
    const next={...changes};
    if('icPackage' in next&&P.imperialPackages[next.icPackage])Object.assign(next,P.imperialPackages[next.icPackage]);
    else if(P.imperialPackages[c.icPackage]&&['icWidth','icHeight'].some(key=>key in next&&next[key]!==c[key]))next.icPackage='Custom';
    if(next.icPackage==='TQFP'&&c.icPackage!=='TQFP'&&!('icPinCount' in next))next.icPinCount=32;
    if(c.icPackage==='TQFP'&&next.icPackage&&next.icPackage!=='TQFP'&&!('icPinCount' in next)&&c.icPinCount>64)next.icPinCount=6;
    if(!P.validPackage({...c,...next}))return false;
    if('componentValue' in next&&(typeof next.componentValue!=='string'||next.componentValue.length>120))return false;
    if(!P.validRf(c,next)||!P.validComponentExtras({...c,...next}))return false;
    if(!P.canSyncRfPorts({...c,...next}))return P.warn('減少路數前，請先移除超出範圍 RF port 的連線。')||false;
    for(const key of ['x','y','width','height','rotation'])if(key in next&&!Number.isFinite(next[key]))return false;
    if('renderColor' in next&&!/^#[0-9a-f]{6}$/i.test(next.renderColor))return false;
    if('textColor' in next&&!/^#[0-9a-f]{6}$/i.test(next.textColor))return false;
    if('fontFamily' in next&&!P.fonts.includes(next.fontFamily))return false;
    if('fontSize' in next&&(!Number.isFinite(next.fontSize)||next.fontSize<8||next.fontSize>48))return false;
    if('shape' in next&&!P.shapes.includes(next.shape))return false;
    for(const key of ['icWidth','icHeight'])if(key in next&&(!Number.isFinite(next[key])||next[key]<0.01||next[key]>1000))return false;

    const pins=next.icPinCount??c.icPinCount, pkg=next.icPackage??c.icPackage;
    if(!Number.isInteger(pins)||(pkg==='TQFP'?(pins<4||pins>256||pins%4!==0):(pins<2||pins>64||pins%2!==0)))return false;
    if('icThickness' in next&&(!Number.isFinite(next.icThickness)||next.icThickness<0.1||next.icThickness>1000))return false;
    let proposedPlacement=null;
    const placement=P.state.placements.find(p=>p.componentId===id);
    if(placement&&('icWidth' in next||'icHeight' in next)){
      const width=next.icWidth??c.icWidth,height=next.icHeight??c.icHeight;
      const w=placement.rotation%180?height:width,h=placement.rotation%180?width:height;
      if(w>P.state.board.width||h>P.state.board.height)return false;
      proposedPlacement={...placement,width,height,x:Math.max(0,Math.min(placement.x,P.state.board.width-w)),y:Math.max(0,Math.min(placement.y,P.state.board.height-h))};
    }
    if(placement){const state={...P.state,components:P.state.components.map(c=>c.id===id?{...c,...next}:c),placements:P.state.placements.map(p=>p===placement?(proposedPlacement||p):p)};const error=P.boardRules.conflict(proposedPlacement||placement,state);if(error)return P.warn(error)||false;}
    if(proposedPlacement)Object.assign(placement,proposedPlacement);
    const min=P.minimumSize(id);
    if('width' in next)next.width=Math.max(min.width,next.width);
    if('height' in next)next.height=Math.max(min.height,next.height);
    if('rotation' in next)next.rotation=((next.rotation%360)+360)%360;
    delete next.id;Object.assign(c,next);if(['txChannels','rxChannels','rfPortCount'].some(k=>k in next)){P.syncRfPorts(c);P.notify('ports',id);}P.notify(type,id);return true;
  };
  P.portUsage = (id,polarity) => P.state.connections.filter(e=>[e.source,e.target].some(end=>end.portId===id&&(!polarity||(end.polarity||'+')===polarity))).length;
  function validPort(p){return P.validRfPort(p)&&P.sides.includes(p.side)&&P.interfaces.includes(p.type)&&['input','output','bidirectional'].includes(p.direction)&&(p.maxConnections===null||(Number.isInteger(p.maxConnections)&&p.maxConnections>=1));}
  P.addPort = (componentId,options={}) => {
    if(!P.component(componentId))return null;
    const p={name:'New port',type:'Digital',side:'right',direction:'bidirectional',maxConnections:null,...options,id:P.uuid(),componentId};
    if(!validPort(p))return P.warn('Invalid port settings. Use a positive connection limit or Unlimited.');
    P.state.ports.push(p);const min=P.minimumSize(componentId),c=P.component(componentId);c.width=Math.max(c.width,min.width);c.height=Math.max(c.height,min.height);P.notify('ports',componentId);return p;
  };
  P.updatePort = (id,changes) => {
    const p=P.port(id);if(!p)return false;
    const next={...p,...changes,id:p.id,componentId:p.componentId};if(!validPort(next))return false;
    if(p.rfKey){if(P.component(p.componentId)?.type==='Balun'&&next.signalMode!==p.signalMode)return false;for(const key of ['type','direction','rfKey','name','side'])if(next[key]!==p[key])return false;}
    if(p.signalMode==='differential'&&next.signalMode!=='differential'&&P.portUsage(id,'-'))return P.warn('切換單端前，請先移除 − 端點連線。')||false;
    Object.assign(p,next);
    if(p.signalMode!=='differential')for(const e of P.state.connections)for(const end of [e.source,e.target])if(end.portId===id)delete end.polarity;const c=P.component(p.componentId),min=P.minimumSize(c.id);c.width=Math.max(c.width,min.width);c.height=Math.max(c.height,min.height);
    P.state.connections.forEach(e=>[e.source,e.target].forEach(end=>{if(end.portId===id)end.anchor=p.side;}));
    P.notify('ports',c.id);
    if(p.maxConnections!==null&&P.portUsage(id)>p.maxConnections*(p.signalMode==='differential'?2:1))P.warn(`${p.name}: ${P.portUsage(id)} connections exceed the limit ${p.maxConnections}. Remove excess connections or increase the limit.`);
    return true;
  };
  P.removePort = id => {
    const p=P.port(id);if(!p)return;if(p.rfKey)return P.warn('此 RF port 由元件路數管理，請調整 Tx／Rx 或 RF Port 數量。');
    P.state.connections=P.state.connections.filter(e=>e.source.portId!==id&&e.target.portId!==id);
    P.state.ports=P.state.ports.filter(port=>port.id!==id);P.notify('ports',p.componentId);
  };
  function normalizeEndpoint(end){
    if(!end||!P.component(end.componentId))return null;
    const port=end.portId?P.port(end.portId):null;
    if(end.portId&&(!port||port.componentId!==end.componentId))return null;
    const anchor=port?.side||end.anchor;if(!P.sides.includes(anchor))return null;
    if(end.polarity!==undefined&&(!['+','-'].includes(end.polarity)||port?.signalMode!=='differential'))return null;
    return {componentId:end.componentId,portId:port?.id||null,anchor,...(port?.signalMode==='differential'?{polarity:end.polarity||'+'}:{})};
  }
  P.addConnection = (source,target,options={}) => {
    source=normalizeEndpoint(source);target=normalizeEndpoint(target);
    if(!source||!target)return P.warn('Connection endpoint is no longer available.');
    if(source.componentId===target.componentId)return P.warn('Choose a different target component.');
    for(const end of [source,target]){const port=P.port(end.portId);if(port&&port.maxConnections!==null&&P.portUsage(port.id,port.signalMode==='differential'?(end.polarity||'+'):undefined)>=port.maxConnections)return P.warn(`${P.component(end.componentId).name} / ${port.name}: connection limit (${port.maxConnections}) reached.`);}
    const interfaceType=options.interfaceType||P.port(source.portId)?.type||P.port(target.portId)?.type||(P.isRfPair(source,target)?'RF':'Digital');
    if(!P.interfaces.includes(interfaceType))return P.warn('Unknown interface type.');
    const edge={id:P.uuid(),source,target,interfaceType,label:options.label||'',description:options.description||'',routingStyle:options.routingStyle==='straight'?'straight':'orthogonal',loss:options.loss??0,rfMode:options.rfMode??'auto',txChannel:options.txChannel??1,rxChannel:options.rxChannel??1};
    if(interfaceType==='RF'){for(const end of [source,target]){const port=P.port(end.portId);if(port?.rfKey&&P.isTrx(P.component(end.componentId))){const [role,n]=port.rfKey.split(':');edge[role==='tx'?'txChannel':'rxChannel']=Number(n);}}}
    if(!P.validRfEdge(edge))return P.warn('Loss 須為 0–100 dB；RF 通道路數須為 1–4。');
    P.state.connections.push(edge);P.ui.warning='';P.notify('connection-add',edge.id);return edge;
  };
  P.updateConnection = (id,changes) => {
    const edge=P.connection(id);if(!edge)return false;
    if(!P.validRfEdge({...edge,...changes}))return false;
    if(changes.interfaceType&&!P.interfaces.includes(changes.interfaceType))return false;
    if(changes.routingStyle&&!['straight','orthogonal'].includes(changes.routingStyle))return false;
    for(const key of ['interfaceType','label','description','routingStyle','loss','rfMode','txChannel','rxChannel'])if(key in changes)edge[key]=changes[key];
    P.notify('connection-update',id);return true;
  };
  P.removeConnection = id => {P.state.connections=P.state.connections.filter(e=>e.id!==id);if(P.ui.selectedKind==='connection'&&P.ui.selected===id){P.ui.selected=null;P.ui.selectedKind=null;}P.notify('connection-remove',id);};
  P.removeSelected = () => {
    const items=[...P.ui.selection];if(!items.length)return;
    P.setMode('select');P.select(null);
    for(const {id,kind} of items){
      if(kind==='line'){P.removeLine(id);continue;}
      if(kind==='text'){P.removeTextBox(id);continue;}
      if(kind==='connection'){P.removeConnection(id);continue;}
      P.state.components=P.state.components.filter(c=>c.id!==id);
      P.state.ports=P.state.ports.filter(p=>p.componentId!==id);
      P.state.connections=P.state.connections.filter(e=>e.source.componentId!==id&&e.target.componentId!==id);
      P.state.placements=P.state.placements.filter(p=>p.componentId!==id);
      P.notify('remove',id);
    }
  };
  P.clearCanvas = () => {
    // Cancel active gestures before discarding data so previews cannot commit
    // stale objects after clearing. Keep project, board and rule settings.
    P.setMode('select');
    for(const key of ['components','ports','connections','lines','textBoxes','placements','zones'])P.state[key]=[];
    P.ui.selected=null;P.ui.selectedKind=null;P.ui.selection=[];P.ui.warning='';
    P.notify('clear');
  };
  P.subscribe(({type})=>{
    if(!['remove','line-remove','connection-remove','ports'].includes(type))return;
    const valid=P.ui.selection.filter(s=>s.kind==='component'?P.component(s.id):s.kind==='line'?P.line(s.id):s.kind==='text'?P.textBox(s.id):P.connection(s.id));
    if(valid.length!==P.ui.selection.length)P.selectMany(valid);
  });
})(window.Planner);
