(function(P){
  'use strict';
  const storageKey='stratum.project.v1',clone=value=>JSON.parse(JSON.stringify(value));
  function validate(raw){
    if(!raw||typeof raw!=='object')throw new Error('專案根節點格式錯誤。');
    raw.textBoxes=Array.isArray(raw.textBoxes)?raw.textBoxes:[];
    raw.appearance=raw.appearance&&typeof raw.appearance==='object'?raw.appearance:{theme:'dark'};
    if(!['dark','light'].includes(raw.appearance.theme))raw.appearance.theme='dark';
    const required=['components','ports','connections','lines','placements','zones'];
    if(!required.every(key=>Array.isArray(raw[key])))throw new Error('專案缺少必要的資料陣列。');
    const workspace=raw.workspace;
    if(!workspace||!Number.isFinite(workspace.width)||!Number.isFinite(workspace.height)||workspace.width<400||workspace.height<300||workspace.width>10000||workspace.height>10000)throw new Error('工作區尺寸無效。');
    const ids=new Set(),claim=item=>{if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))throw new Error('專案包含遺失或重複的 UUID。');ids.add(item.id);};
    raw.components.forEach(c=>{claim(c);if(typeof c.name!=='string'||!['x','y','width','height','rotation'].every(key=>Number.isFinite(c[key]))||c.width<1||c.height<1)throw new Error('方塊資料無效。');c.shape=c.shape||'rectangle';c.renderColor=c.renderColor||'#1c2938';c.textColor=c.textColor||'#dce5ee';c.fontFamily=c.fontFamily||'Segoe UI';c.fontSize=c.fontSize||15;if(!P.shapes.includes(c.shape)||![c.renderColor,c.textColor].every(color=>/^#[0-9a-f]{6}$/i.test(color))||!P.fonts.includes(c.fontFamily)||!Number.isFinite(c.fontSize)||c.fontSize<8||c.fontSize>48)throw new Error('方塊文字、形狀或顏色格式無效。');});
    raw.linkBudget=raw.linkBudget??{bandwidthMHz:20,snrDb:10};
    // Working frequency lives with the link budget; older PRD drafts stored it under prd.
    raw.linkBudget.frequencyMHz=raw.linkBudget.frequencyMHz??raw.prd?.frequencyMHz??null;if(raw.prd&&typeof raw.prd==='object')delete raw.prd.frequencyMHz;
    if(raw.linkBudget.frequencyMHz!==null&&!(Number.isFinite(raw.linkBudget.frequencyMHz)&&raw.linkBudget.frequencyMHz>=0.001&&raw.linkBudget.frequencyMHz<=1e6))throw new Error('Link Budget 工作頻率須為 0.001–1,000,000 MHz。');
    if(!Number.isFinite(raw.linkBudget.bandwidthMHz)||raw.linkBudget.bandwidthMHz<=0||raw.linkBudget.bandwidthMHz>100000||!Number.isFinite(raw.linkBudget.snrDb)||raw.linkBudget.snrDb< -100||raw.linkBudget.snrDb>100)throw new Error('Link Budget 頻寬或 SNR 無效。');
    raw.prd={txAntennaGainDbi:0,rxAntennaGainDbi:0,fadeMarginDb:10,...(raw.prd&&typeof raw.prd==='object'?raw.prd:{})};
    if(P.validPrd&&!P.validPrd(raw.prd))throw new Error('PRD 天線增益或 Fade margin 無效。');
    raw.components.forEach(c=>{for(const [k,v] of Object.entries(P.rfDefaults(c)))if(c[k]===undefined)c[k]=v;if(!P.validRf(c,c))throw new Error('RF 元件參數無效。');});
    raw.components.forEach(c=>{for(const [key,value] of Object.entries(P.componentExtraDefaults))if(c[key]===undefined)c[key]=value;if(!P.validComponentExtras(c))throw new Error('Keep Out、CPU 或記憶體規格無效。');});
    const componentIds=new Set(raw.components.map(c=>c.id));
    raw.ports.forEach(port=>{claim(port);if(!P.validRfPort(port))throw new Error('RF Port Loss／Max Level 無效。');if(!componentIds.has(port.componentId)||!P.sides.includes(port.side)||!P.interfaces.includes(port.type))throw new Error('Port 參照或類型無效。');});
    const portMap=new Map(raw.ports.map(port=>[port.id,port]));
    raw.connections.forEach(edge=>{edge.loss=edge.loss??0;edge.rfMode=edge.rfMode??'auto';edge.txChannel=edge.txChannel??1;edge.rxChannel=edge.rxChannel??1;if(!P.validRfEdge(edge))throw new Error('連線 Loss 或 RF 路徑設定無效。');claim(edge);for(const end of [edge.source,edge.target]){if(!end||!componentIds.has(end.componentId)||!P.sides.includes(end.anchor))throw new Error('連線端點無效。');if(end.polarity!==undefined&&!['+','-'].includes(end.polarity))throw new Error('差分端點極性無效。');if(end.portId&&portMap.get(end.portId)?.componentId!==end.componentId)throw new Error('連線的 Port 參照無效。');}if(!P.interfaces.includes(edge.interfaceType)||!['straight','orthogonal'].includes(edge.routingStyle))throw new Error('連線設定無效。');});
    raw.lines.forEach(line=>{claim(line);if(!['x1','y1','x2','y2'].every(key=>Number.isFinite(line[key]))||!['none','start','end','both'].includes(line.arrows))throw new Error('直線物件無效。');});
    raw.textBoxes.forEach(box=>{claim(box);box.textColor=box.textColor||'#dce5ee';box.backgroundColor=box.backgroundColor||'#172331';box.borderColor=box.borderColor||'#60778b';box.fontFamily=box.fontFamily||'Segoe UI';box.fontSize=box.fontSize||16;if(typeof box.text!=='string'||!['x','y','width','height','fontSize'].every(key=>Number.isFinite(box[key]))||box.width<80||box.height<40||box.fontSize<8||box.fontSize>96||!P.fonts.includes(box.fontFamily)||![box.textColor,box.backgroundColor,box.borderColor].every(color=>/^#[0-9a-f]{6}$/i.test(color)))throw new Error('文字框資料無效。');});
    if(!raw.board||!['width','height'].every(k=>Number.isFinite(raw.board[k])&&raw.board[k]>=10&&raw.board[k]<=1000))throw new Error('PCB 尺寸無效。');
    raw.board.thickness=raw.board.thickness??1.6;
    if(!Number.isFinite(raw.board.thickness)||raw.board.thickness<0.1||raw.board.thickness>100)throw new Error('PCB 板厚須為 0.1–100 mm。');
    // Migrate existing projects: use the old placement dimensions when no IC dimensions were stored.
    raw.components.forEach(c=>{c.icPackage=c.icPackage??'QFN';c.icPinCount=c.icPinCount??6;if(!P.validPackage(c)||!Number.isInteger(c.icPinCount)||(c.icPackage==='TQFP'?(c.icPinCount<4||c.icPinCount>256||c.icPinCount%4!==0):(c.icPinCount<2||c.icPinCount>64||c.icPinCount%2!==0)))throw new Error('封裝規格無效；SOT 腳數須為 2–64 的偶數，TQFP 腳數須為 4–256 的四倍數。');const p=raw.placements.find(p=>p.componentId===c.id);c.icThickness=c.icThickness??1.5;if(!Number.isFinite(c.icThickness)||c.icThickness<0.1||c.icThickness>1000)throw new Error('IC 高度須為 0.1–1000 mm。');c.icWidth=c.icWidth??p?.width??12;c.icHeight=c.icHeight??p?.height??12;if(!['icWidth','icHeight'].every(k=>Number.isFinite(c[k])&&c[k]>=0.01&&c[k]<=1000))throw new Error('IC 尺寸須為 0.01–1000 mm。');});
    const placed=new Set();
    raw.placements.forEach(p=>{p.side=p.side??'top';if(!['top','bottom'].includes(p.side))throw new Error('擺放面須為 Top 或 Bottom。');claim(p);if(!componentIds.has(p.componentId)||placed.has(p.componentId)||!['x','y','width','height','rotation'].every(k=>Number.isFinite(p[k]))||p.width<0.01||p.height<0.01||![0,90,180,270].includes(p.rotation))throw new Error('虛擬 IC 擺件資料無效。');const w=p.rotation%180?p.height:p.width,h=p.rotation%180?p.width:p.height;if(p.x<0||p.y<0||p.x+w>raw.board.width||p.y+h>raw.board.height)throw new Error('虛擬 IC 超出電路板範圍。');placed.add(p.componentId);});
    raw.placements.forEach(p=>{const c=raw.components.find(c=>c.id===p.componentId);p.width=c.icWidth;p.height=c.icHeight;const w=p.rotation%180?p.height:p.width,h=p.rotation%180?p.width:p.height;if(w>raw.board.width||h>raw.board.height)throw new Error('IC 尺寸超出電路板範圍。');p.x=Math.max(0,Math.min(p.x,raw.board.width-w));p.y=Math.max(0,Math.min(p.y,raw.board.height-h));});
    raw.components.forEach(c=>P.syncRfPorts(c,raw));
    const clearanceError=P.boardRules.all(raw);if(clearanceError)throw new Error(clearanceError);
    return clone(raw);
  }
  function load(raw){
    const data=validate(clone(raw));P.setMode('select');P.select(null);
    for(const key of ['project','workspace','appearance','board','linkBudget','prd','components','ports','connections','lines','textBoxes','placements','zones','rules'])P.state[key]=data[key]??P.state[key];
    P.ui.warning='';P.notify('project-load');return true;
  }
  function filename(extension){const safe=(P.state.project.name||'stratum-project').replace(/[\\/:*?"<>|]+/g,'-').trim()||'stratum-project';return `${safe}.${extension}`;}
  function download(blob,name){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
  P.saveProject=()=>{try{localStorage.setItem(storageKey,JSON.stringify(P.state));P.notify('project-save');return true;}catch(error){P.warn('無法存檔：'+error.message);return false;}};
  P.loadSavedProject=()=>{try{const value=localStorage.getItem(storageKey);if(!value)return P.warn('目前沒有本機存檔。');load(JSON.parse(value));P.notify('project-saved-load');return true;}catch(error){P.warn('無法載入存檔：'+error.message);return false;}};
  P.exportProject=()=>{download(new Blob([JSON.stringify(P.state,null,2)],{type:'application/json'}),filename('json'));P.notify('project-export');};
  P.importProjectText=text=>{try{load(JSON.parse(text));P.notify('project-import');return true;}catch(error){P.warn('匯入失敗：'+error.message);return false;}};
  // Browsers block reading stylesheet rules when index.html is opened from file://, so exported
  // SVG cannot rely on an embedded <style>. Copy the resolved paint/text styles of every live
  // element onto its clone instead (walk both trees in parallel right after cloneNode).
  const exportStyleProps=['display','visibility','opacity','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','paint-order','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','letter-spacing','white-space','color','background-color','border','border-radius','padding','line-height','text-align','overflow-wrap','word-break','box-sizing'];
  P.inlineSvgStyles=(source,copy)=>{
    const a=[source,...source.querySelectorAll('*')],b=[copy,...copy.querySelectorAll('*')];
    if(a.length!==b.length)return copy;
    // Export without selection highlight: drop .selected while styles are resolved, then restore.
    const selected=a.filter(n=>n.classList?.contains('selected'));selected.forEach(n=>n.classList.remove('selected'));
    try{for(let i=0;i<a.length;i++){
      const tag=a[i].localName;if(['defs','style','title','desc','marker','pattern','clipPath','linearGradient','radialGradient','stop'].includes(tag)&&i)continue;
      const computed=getComputedStyle(a[i]);let text=b[i].getAttribute('style')||'';
      for(const prop of exportStyleProps){const value=computed.getPropertyValue(prop);if(value)text+=`;${prop}:${value}`;}
      b[i].setAttribute('style',text.replace(/^;/,''));
    }}finally{selected.forEach(n=>n.classList.add('selected'));}
    return copy;
  };
  P.buildExportSvg=(box)=>{
    // Optional box {x,y,width,height} crops the export (used by the PPT report); default is the full workspace.
    const source=document.getElementById('canvas'),copy=P.inlineSvgStyles(source,source.cloneNode(true)),{x=0,y=0,width,height}=box||P.state.workspace;
    copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('viewBox',`${x} ${y} ${width} ${height}`);copy.setAttribute('width',width);copy.setAttribute('height',height);
    copy.querySelectorAll('.selection-box,#connection-preview,.free-line-preview,.resize-handles,.rotation-controls,.text-handles,.connection-point,.edge-hit,.edge-halo,.free-line-hit,.free-line-halo,.line-handle').forEach(node=>node.remove());
    copy.querySelectorAll('.selected').forEach(node=>node.classList.remove('selected'));
    let css='';for(const sheet of document.styleSheets){try{css+=[...sheet.cssRules].map(rule=>rule.cssText).join('\n');}catch{}}
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=css;copy.querySelector('defs').append(style);
    const background=document.createElementNS('http://www.w3.org/2000/svg','rect');background.setAttribute('x',x);background.setAttribute('y',y);background.setAttribute('width',width);background.setAttribute('height',height);background.setAttribute('fill',P.state.appearance?.theme==='light'?'#f4f7fa':'#111923');copy.insertBefore(background,copy.querySelector('#canvas-background'));
    return new XMLSerializer().serializeToString(copy);
  };
  P.exportPNG=()=>new Promise((resolve,reject)=>{
    try{
      const svg=P.buildExportSvg(),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),image=new Image();
      image.onload=()=>{try{const max=8192,scale=Math.min(1,max/Math.max(P.state.workspace.width,P.state.workspace.height)),canvas=document.createElement('canvas');canvas.width=Math.round(P.state.workspace.width*scale);canvas.height=Math.round(P.state.workspace.height*scale);const context=canvas.getContext('2d');context.fillStyle=P.state.appearance?.theme==='light'?'#f4f7fa':'#111923';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(output=>{if(!output){reject(new Error('PNG 編碼失敗。'));return;}download(output,filename('png'));P.notify('png-export');resolve(true);},'image/png');}catch(error){URL.revokeObjectURL(url);reject(error);}};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('SVG 圖像無法渲染。'));};image.src=url;
    }catch(error){reject(error);}
  }).catch(error=>{P.warn('PNG 匯出失敗：'+error.message);return false;});
  P.storage={validate,load,key:storageKey};
})(window.Planner);
