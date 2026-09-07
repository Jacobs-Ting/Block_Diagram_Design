(function(P){
  'use strict';
  // An application clipboard works on file:// without browser permissions.
  let clipboard=null,pasteCount=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  P.hasClipboard=()=>!!clipboard;
  P.copySelection=()=>{
    if(!P.ui.selection.length)return false;
    const ids=new Set(P.ui.selection.filter(s=>s.kind==='component').map(s=>s.id));
    const edgeIds=new Set(P.ui.selection.filter(s=>s.kind==='connection').map(s=>s.id));
    const lineIds=new Set(P.ui.selection.filter(s=>s.kind==='line').map(s=>s.id));
    const textIds=new Set(P.ui.selection.filter(s=>s.kind==='text').map(s=>s.id));
    clipboard=clone({components:P.state.components.filter(c=>ids.has(c.id)),ports:P.state.ports.filter(p=>ids.has(p.componentId)),connections:P.state.connections.filter(e=>edgeIds.has(e.id)||(ids.has(e.source.componentId)&&ids.has(e.target.componentId))),lines:P.state.lines.filter(l=>lineIds.has(l.id)),textBoxes:P.state.textBoxes.filter(box=>textIds.has(box.id))});
    pasteCount=0;P.notify('copy');return true;
  };
  P.pasteSelection=()=>{
    if(!clipboard)return false;
    P.setMode('select');const data=clone(clipboard),offset=40*(++pasteCount),components=new Map(),ports=new Map(),selected=[];
    for(const c of data.components){const added=P.addComponent(c.type,c.x+offset,c.y+offset,{...c,x:c.x+offset,y:c.y+offset});components.set(c.id,added.id);selected.push({id:added.id,kind:'component'});}
    for(const port of data.ports){const added=P.addPort(components.get(port.componentId),port);ports.set(port.id,added.id);}
    const endpoint=end=>({...end,componentId:components.get(end.componentId)||end.componentId,portId:ports.get(end.portId)||end.portId});
    let skipped=0;
    for(const e of data.connections){const added=P.addConnection(endpoint(e.source),endpoint(e.target),e);if(added)selected.push({id:added.id,kind:'connection'});else skipped++;}
    for(const l of data.lines){const added=P.addLine({x1:l.x1+offset,y1:l.y1+offset,x2:l.x2+offset,y2:l.y2+offset},l);selected.push({id:added.id,kind:'line'});}
    for(const box of data.textBoxes||[]){const added=P.addTextBox({x:box.x+offset,y:box.y+offset,width:box.width,height:box.height},box);selected.push({id:added.id,kind:'text'});}
    P.selectMany(selected);P.notify('paste');
    if(skipped)P.warn(`已貼上可用物件；${skipped} 條連線因原端點不存在或 Port 已達上限而略過。`);
    return true;
  };
})(window.Planner);
