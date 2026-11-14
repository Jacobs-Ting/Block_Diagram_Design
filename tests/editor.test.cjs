const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
function editor(){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),{runScripts:'outside-only',virtualConsole,url:'http://localhost/'});
  const w=dom.window,d=w.document;w.addEventListener('error',e=>errors.push(e.error));
  w.TextEncoder=TextEncoder;w.ResizeObserver=class{observe(){} disconnect(){}};
  w.URL.createObjectURL=()=>`blob:test-${Math.random()}`;w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  const svg=d.querySelector('#canvas');
  // jsdom has no layout engine. Use a 1:1 screen-to-canvas transform to test
  // application event handling, not browser hit-testing or CSS rendering.
  svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return{x:this.x,y:this.y};}});
  svg.getScreenCTM=()=>({inverse(){return{};}});svg.setPointerCapture=()=>{};
  svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:1400,height:850,right:1400,bottom:850});
  let hit=null;d.elementFromPoint=()=>hit;
  for(const script of d.querySelectorAll('script[src]'))w.eval(fs.readFileSync(path.join(__dirname,'..',script.getAttribute('src')),'utf8'));
  const P=w.Planner;
  function pointer(node,type,x=0,y=0,options={}){node.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,...options}));}
  function input(node,value,event='input'){node.value=value;node.dispatchEvent(new w.Event(event,{bubbles:true}));}
  function field(label){return [...d.querySelectorAll('#properties-content label')].find(l=>l.firstChild?.textContent===label)?.querySelector('input,select,textarea');}
  function key(node,key,options={}){node.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));}
  return {P,w,d,svg,pointer,input,field,key,hit:node=>hit=node,clean(){assert.deepEqual(errors,[]);dom.window.close();}};
}
test('Page loads with demo, selection/property editing and tabs preserve the graph without console errors',()=>{
  const E=editor(),{P,d,svg,pointer,input,field,key}=E;
  assert.equal(d.querySelectorAll('.block').length,15);assert.equal(d.querySelectorAll('.connection').length,20);
  assert.equal(d.querySelectorAll('.component-item').length,45);
  const sdr=P.state.components.find(c=>c.type==='SDR'),trx=P.state.components.find(c=>c.type==='RF Transceiver');
  assert.equal(d.querySelectorAll(`[data-id="${sdr.id}"] .connected[data-side="right"]`).length,4);
  assert.equal(d.querySelectorAll(`[data-id="${trx.id}"] .connected[data-side="left"]`).length,4);
  const cpu=P.state.components.find(c=>c.name==='CPU'),block=d.querySelector(`[data-id="${cpu.id}"]`);
  pointer(block.querySelector('.body'),'pointerdown',cpu.x+20,cpu.y+20);pointer(svg,'pointerup',cpu.x+20,cpu.y+20);
  assert.equal(P.ui.selected,cpu.id);assert.ok(block.classList.contains('selected'));assert.equal(block.querySelectorAll('.resize-handle').length,8);
  input(field('Name'),'Renamed CPU');input(field('Vendor'),'Test vendor');input(field('Part Number'),'TEST-42');input(field('Category'),'Other');
  assert.equal(cpu.name,'Renamed CPU');assert.equal(block.querySelector('.name').textContent,'Renamed CPU');assert.equal(cpu.vendor,'Test vendor');assert.equal(cpu.category,'Other');
  key(field('Name'),'Delete');assert.ok(P.component(cpu.id));
  const before=JSON.stringify(P.state);
  d.querySelector('[data-tab="placement"]').click();assert.equal(d.querySelector('#placement-view').hidden,false);assert.match(d.querySelector('#inventory').textContent,/Renamed CPU/);
  d.querySelector('[data-tab="checks"]').click();assert.equal(d.querySelector('#checks-view').hidden,false);
  d.querySelector('[data-tab="architecture"]').click();assert.equal(d.querySelector('#architecture-view').hidden,false);assert.equal(JSON.stringify(P.state),before);
  E.clean();
});
test('Shape toolbar creates circle, triangle and diamond blocks and inspector can change shape',()=>{
  const E=editor(),{P,d,input,field}=E;P.clearCanvas();
  for(const [id,shape,tag] of [['add-circle','circle','ellipse'],['add-triangle','triangle','polygon'],['add-diamond','diamond','polygon']]){
    d.querySelector('#'+id).click();const c=P.component(P.ui.selected),body=d.querySelector(`[data-id="${c.id}"] .body`);
    assert.equal(c.shape,shape);assert.equal(body.tagName.toLowerCase(),tag);
    for(const side of P.sides){const point=P.geometry.anchorLocal({componentId:c.id,portId:null,anchor:side});assert.ok(point.x>=0&&point.x<=c.width);assert.ok(point.y>=0&&point.y<=c.height);}
  }
  input(field('形狀'),'rectangle');const selected=P.component(P.ui.selected);
  assert.equal(selected.shape,'rectangle');assert.equal(d.querySelector(`[data-id="${selected.id}"] .body`).tagName.toLowerCase(),'rect');
  E.clean();
});
test('Selected shapes rotate from the canvas handle and attached connections update immediately',()=>{
  const E=editor(),{P,d,svg,pointer,field}=E;
  const cpu=P.state.components.find(c=>c.name==='CPU'),block=d.querySelector(`[data-id="${cpu.id}"]`),edge=P.state.connections.find(e=>e.source.componentId===cpu.id||e.target.componentId===cpu.id),path=d.querySelector(`[data-edge-id="${edge.id}"] .edge-line`);
  P.select(cpu.id);const before=path.getAttribute('d'),center={x:cpu.x+cpu.width/2,y:cpu.y+cpu.height/2},handle=block.querySelector('.rotation-handle');
  pointer(handle,'pointerdown',center.x,center.y-52);pointer(svg,'pointermove',center.x+52,center.y);pointer(svg,'pointerup',center.x+52,center.y);
  assert.equal(cpu.rotation,90);assert.equal(field('旋轉角度').value,'90');assert.notEqual(path.getAttribute('d'),before);
  P.ui.snap=false;pointer(handle,'pointerdown',center.x+52,center.y);pointer(svg,'pointermove',center.x+48,center.y+20);pointer(svg,'pointerup',center.x+48,center.y+20);assert.notEqual(cpu.rotation%15,0);
  E.clean();
});
test('Actual pointer handlers move and resize existing SVG nodes and live size fields',()=>{
  const E=editor(),{P,d,svg,pointer,input,field}=E;
  const cpu=P.state.components.find(c=>c.name==='CPU'),block=d.querySelector(`[data-id="${cpu.id}"]`),edge=P.state.connections.find(e=>e.source.componentId===cpu.id),line=d.querySelector(`[data-edge-id="${edge.id}"] .edge-line`),before=line.getAttribute('d');
  pointer(block.querySelector('.body'),'pointerdown',cpu.x+20,cpu.y+20);pointer(svg,'pointermove',cpu.x+80,cpu.y+60);pointer(svg,'pointerup');
  assert.equal(cpu.x,120);assert.equal(cpu.y,200);assert.notEqual(line.getAttribute('d'),before);
  assert.equal(d.querySelector(`[data-id="${cpu.id}"]`),block);assert.equal(d.querySelector(`[data-edge-id="${edge.id}"] .edge-line`),line);
  for(const handle of ['nw','n','ne','e','se','s','sw','w']){
    P.update(cpu.id,{width:300,height:200,x:200,y:200});
    pointer(block.querySelector(`[data-handle="${handle}"]`),'pointerdown',200,200);pointer(svg,'pointermove',240,240);pointer(svg,'pointerup',240,240);
    assert.equal(Number(block.querySelector('.body').getAttribute('width')),cpu.width);assert.equal(Number(block.querySelector('.body').getAttribute('height')),cpu.height);
    assert.equal(Number(field('Width').value),cpu.width);assert.equal(Number(field('Height').value),cpu.height);
  }
  input(field('Width'),'600');assert.equal(cpu.width,600);assert.equal(block.querySelector('.body').getAttribute('width'),'600');
  input(field('Height'),'300');assert.equal(cpu.height,300);
  input(field('Width'),'1');assert.equal(cpu.width,600);assert.equal(field('Width').checkValidity(),false);
  field('Width').dispatchEvent(new E.w.FocusEvent('blur'));assert.equal(field('Width').value,'600');
  E.clean();
});
test('Click-to-connect, drag-to-block, edge selection/properties/deletion and Escape cancellation',()=>{
  const E=editor(),{P,d,svg,pointer,input,field,key}=E;
  const cpu=P.state.components.find(c=>c.name==='CPU'),ddr=P.state.components.find(c=>c.name==='DDR');
  const point=(id,side)=>d.querySelector(`[data-id="${id}"] .general[data-side="${side}"]`);
  d.querySelector('#connect-mode').click();assert.equal(P.ui.mode,'connect');
  const initial=P.state.connections.length;
  pointer(point(cpu.id,'right'),'pointerdown',260,216);pointer(svg,'pointerup',260,216);
  assert.ok(P.connectionUI.isPending());
  pointer(point(ddr.id,'right'),'pointerdown',260,416);pointer(svg,'pointerup',260,416);
  assert.equal(P.state.connections.length,initial+1);assert.equal(P.ui.selectedKind,'connection');
  const edge=P.connection(P.ui.selected);input(field('Label'),'CPU test edge');input(field('Interface Type'),'SPI');input(field('Description'),'Edited description');input(field('Line Style'),'straight');
  assert.equal(edge.label,'CPU test edge');assert.equal(edge.interfaceType,'SPI');assert.equal(edge.routingStyle,'straight');assert.equal(d.querySelector(`[data-edge-id="${edge.id}"] .edge-label`).textContent,'CPU test edge');
  assert.ok(field('Source').readOnly);assert.match(field('Source').value,/CPU/);
  key(field('Label'),'Delete');assert.ok(P.connection(edge.id));
  d.querySelector('#select-mode').click();pointer(d.querySelector(`[data-edge-id="${edge.id}"] .edge-hit`),'pointerdown');
  assert.equal(P.ui.selected,edge.id);key(svg,'Delete');assert.equal(P.connection(edge.id),undefined);assert.equal(P.state.connections.length,initial);
  // Drag from a general point and release over the target body.
  pointer(point(cpu.id,'bottom'),'pointerdown',160,272);pointer(svg,'pointermove',170,400);
  E.hit(d.querySelector(`[data-id="${ddr.id}"] .body`));pointer(svg,'pointerup',170,400);
  assert.equal(P.state.connections.length,initial+1);
  pointer(point(cpu.id,'top'),'pointerdown',160,160);pointer(svg,'pointerup',160,160);assert.ok(P.connectionUI.isPending());key(svg,'Escape');assert.equal(P.connectionUI.isPending(),false);assert.equal(d.querySelector('#connection-preview').getAttribute('d'),'');
  E.clean();
});
test('Port configuration, capacity warning, removal cleanup, and toolbar deletion update DOM',()=>{
  const E=editor(),{P,d,svg,pointer,input,field}=E;
  const cpu=P.state.components.find(c=>c.name==='CPU'),sdr=P.state.components.find(c=>c.name==='SDR');P.select(cpu.id);
  const add=[...d.querySelectorAll('button')].find(b=>b.textContent==='＋ Add engineering port');add.click();assert.equal(P.componentPorts(cpu.id).length,2);
  const card=d.querySelectorAll('.port-card')[1],newId=card.dataset.portId;
  const name=card.querySelector('input');name.focus();input(name,'Debug USB','change');assert.equal(P.port(newId).name,'Debug USB');assert.equal(d.querySelector(`[data-port-id="${newId}"].port-card`),card);
  const limit=card.querySelector('input[type="number"]');limit.focus();input(limit,'1','change');assert.equal(P.port(newId).maxConnections,1);
  const cpuPort=P.componentPorts(cpu.id).find(p=>p.type==='PCIe');
  const source=d.querySelector(`[data-id="${cpu.id}"] .connection-point[data-port-id="${cpuPort.id}"]`),target=d.querySelector(`[data-id="${sdr.id}"] .general[data-side="top"]`);
  const initial=P.state.connections.length;pointer(source,'pointerdown');pointer(svg,'pointerup');pointer(target,'pointerdown');pointer(svg,'pointerup');
  assert.equal(P.state.connections.length,initial);assert.equal(d.querySelector('#graph-warning').hidden,false);assert.match(d.querySelector('#graph-warning').textContent,/limit/);
  P.select(cpu.id);d.querySelector('#delete').click();assert.equal(d.querySelector(`[data-id="${cpu.id}"]`),null);assert.ok(P.state.connections.every(e=>e.source.componentId!==cpu.id&&e.target.componentId!==cpu.id));assert.equal(d.querySelectorAll('.connection').length,P.state.connections.length);
  E.clean();
});
test('Library HTML drop adds a block and pending connections cancel on tab changes',()=>{
  const E=editor(),{P,d,svg,pointer}=E;const initial=P.state.components.length;
  const drop=new E.w.MouseEvent('drop',{bubbles:true,cancelable:true,clientX:800,clientY:750});Object.defineProperty(drop,'dataTransfer',{value:{getData:()=> 'USB Hub'}});svg.dispatchEvent(drop);
  assert.equal(P.state.components.length,initial+1);assert.equal(P.component(P.ui.selected).name,'USB Hub');
  const source=d.querySelector(`[data-id="${P.ui.selected}"] .general`);pointer(source,'pointerdown');pointer(svg,'pointerup');assert.ok(P.connectionUI.isPending());
  d.querySelector('[data-tab="placement"]').click();assert.equal(P.connectionUI.isPending(),false);assert.equal(d.querySelectorAll('#inventory tbody tr').length,initial+1);
  E.clean();
});
test('Add parallel connection creates independent selectable edges and respects port limits',()=>{
  const E=editor(),{P,d,input,field,pointer}=E;
  const edge=P.state.connections.find(e=>P.component(e.source.componentId).name==='SDR'&&P.component(e.target.componentId).name==='RF Transceiver');
  const initial=P.state.connections.length;P.select(edge.id,'connection');
  function add(){[...d.querySelectorAll('button')].find(b=>b.textContent==='＋ Add parallel connection').click();}
  add();const second=P.connection(P.ui.selected);input(field('Label'),'SPI control');add();const third=P.connection(P.ui.selected);
  assert.equal(P.state.connections.length,initial+2);assert.notEqual(second.id,third.id);
  const paths=[edge,second,third].map(e=>d.querySelector(`[data-edge-id="${e.id}"] .edge-line`).getAttribute('d'));assert.equal(new Set(paths).size,3);
  pointer(d.querySelector(`[data-edge-id="${second.id}"] .edge-hit`),'pointerdown');assert.equal(field('Label').value,'SPI control');
  d.querySelector('#delete').click();assert.ok(P.connection(edge.id));assert.ok(P.connection(third.id));assert.equal(P.connection(second.id),undefined);
  const limited=P.state.connections.find(e=>e.interfaceType==='PCIe');P.select(limited.id,'connection');const count=P.state.connections.length;add();assert.equal(P.state.connections.length,count);assert.equal(d.querySelector('#graph-warning').hidden,false);
  E.clean();
});
test('Free lines draw, move, resize endpoints, change arrow direction and delete independently',()=>{
  const E=editor(),{P,d,svg,pointer,input,field,key}=E;
  const count=P.state.connections.length;
  d.querySelector('#line-mode').click();
  pointer(svg,'pointerdown',400,740);pointer(svg,'pointermove',700,740);pointer(svg,'pointerup',700,740);
  assert.equal(P.state.lines.length,1);assert.equal(P.ui.selectedKind,'line');assert.equal(P.ui.mode,'select');
  const line=P.line(P.ui.selected),node=d.querySelector(`[data-line-id="${line.id}"]`);
  for(const arrows of ['none','start','end','both']){
    input(field('Arrow Direction'),arrows);const stroke=node.querySelector('.free-line-stroke');
    assert.equal(stroke.getAttribute('marker-start'),['start','both'].includes(arrows)?'url(#arrow)':'none');
    assert.equal(stroke.getAttribute('marker-end'),['end','both'].includes(arrows)?'url(#arrow)':'none');
  }
  input(field('Label'),'Control signal');assert.equal(node.querySelector('text').textContent,'Control signal');
  pointer(node.querySelector('.free-line-hit'),'pointerdown',500,740);pointer(svg,'pointermove',540,700);pointer(svg,'pointerup',540,700);
  assert.equal(line.x1,440);assert.equal(line.x2,740);assert.equal(line.y1,700);assert.equal(line.y2,700);
  pointer(node.querySelector('[data-line-end="end"]'),'pointerdown',740,700);pointer(svg,'pointermove',800,760);pointer(svg,'pointerup',800,760);
  assert.equal(line.x1,440);assert.equal(line.x2,800);assert.equal(line.y2,760);assert.equal(field('End X').value,'800');
  assert.equal(d.querySelector(`[data-line-id="${line.id}"]`),node);
  const before=JSON.stringify(line);P.update(P.state.components[0].id,{x:300});assert.equal(JSON.stringify(line),before);
  d.querySelector('[data-tab="placement"]').click();d.querySelector('[data-tab="architecture"]').click();assert.equal(JSON.stringify(line),before);
  key(field('Label'),'Delete');assert.ok(P.line(line.id));key(svg,'Delete');assert.equal(P.state.lines.length,0);assert.equal(P.state.connections.length,count);assert.equal(d.querySelector('.free-line'),null);
  E.clean();
});
test('Free line click-click creation, tiny-line rejection and Escape cancellation',()=>{
  const E=editor(),{P,d,svg,pointer,key}=E;
  d.querySelector('#line-mode').click();pointer(svg,'pointerdown',400,740);pointer(svg,'pointerup',400,740);assert.equal(P.state.lines.length,0);
  pointer(svg,'pointerdown',700,780);pointer(svg,'pointerup',700,780);assert.equal(P.state.lines.length,1);
  d.querySelector('#line-mode').click();pointer(svg,'pointerdown',400,740);pointer(svg,'pointermove',700,740);key(svg,'Escape');pointer(svg,'pointerup',700,740);assert.equal(P.state.lines.length,1);
  assert.equal(d.querySelector('.free-line-preview').getAttribute('d'),'');
  assert.equal(P.addLine({x1:0,y1:0,x2:0,y2:0}),null);
  const line=P.state.lines[0];assert.equal(P.updateLine(line.id,{arrows:'invalid'}),false);assert.equal(P.updateLine(line.id,{x1:NaN}),false);
  assert.equal(JSON.parse(JSON.stringify(P.state)).lines.length,1);
  E.clean();
});
test('Clear canvas cancels safely or clears all objects and previews; editing works afterward',()=>{
  const E=editor(),{P,d,w,svg,pointer}=E;
  P.addLine({x1:100,y1:720,x2:300,y2:720});P.state.placements.push({componentId:P.state.components[0].id});P.state.zones.push({id:'test-zone'});
  const before=JSON.stringify(P.state);w.confirm=()=>false;
  d.querySelector('#clear-canvas').click();assert.equal(JSON.stringify(P.state),before);
  const settings=JSON.stringify({project:P.state.project,board:P.state.board,rules:P.state.rules});
  d.querySelector('#line-mode').click();pointer(svg,'pointerdown',400,740);pointer(svg,'pointermove',700,740);
  w.confirm=()=>true;d.querySelector('#clear-canvas').click();pointer(svg,'pointerup',700,740);
  for(const key of ['components','ports','connections','lines','placements','zones'])assert.equal(P.state[key].length,0,key);
  assert.equal(d.querySelectorAll('.block,.connection,.free-line').length,0);assert.equal(P.ui.selected,null);assert.equal(P.ui.mode,'select');
  assert.equal(d.querySelector('.free-line-preview').getAttribute('d'),'');assert.equal(d.querySelector('#connection-preview').getAttribute('d'),'');
  assert.equal(d.querySelector('#clear-canvas').disabled,true);assert.equal(d.querySelector('#delete').disabled,true);
  assert.equal(JSON.stringify({project:P.state.project,board:P.state.board,rules:P.state.rules}),settings);
  d.querySelector('[data-tab="placement"]').click();assert.equal(d.querySelectorAll('#inventory tbody tr').length,0);
  d.querySelector('[data-tab="architecture"]').click();d.querySelector('#add-block').click();assert.equal(P.state.components.length,1);assert.equal(d.querySelectorAll('.block').length,1);
  const a=P.state.components[0],b=P.addComponent('SDR',800,500);const edge=P.addConnection({componentId:a.id,portId:null,anchor:'right'},{componentId:b.id,portId:null,anchor:'left'});assert.ok(edge);assert.equal(d.querySelectorAll('.connection').length,1);
  const point=d.querySelector(`[data-id="${a.id}"] .general`);pointer(point,'pointerdown');pointer(svg,'pointerup');assert.equal(P.connectionUI.isPending(),true);
  d.querySelector('#clear-canvas').click();assert.equal(P.connectionUI.isPending(),false);assert.equal(P.state.connections.length,0);
  const line=P.addLine({x1:50,y1:50,x2:200,y2:100});assert.ok(d.querySelector(`[data-line-id="${line.id}"]`));
  E.clean();
});


test('Marquee selects blocks, internal edges and lines; group move and paste remap all UUID references',()=>{
  const E=editor(),{P,d,svg,pointer,key}=E;P.clearCanvas();
  const a=P.addComponent('SDR',100,100),b=P.addComponent('RF Transceiver',400,100);
  const pa=P.addPort(a.id,{side:'right',type:'SPI',maxConnections:1}),pb=P.addPort(b.id,{side:'left',type:'SPI',maxConnections:1});
  const edge=P.addConnection({componentId:a.id,portId:pa.id,anchor:'right'},{componentId:b.id,portId:pb.id,anchor:'left'},{label:'Control'});
  P.addLine({x1:120,y1:230,x2:550,y2:230},{arrows:'both',label:'Annotation'});
  pointer(svg,'pointerdown',80,80);pointer(svg,'pointermove',650,260);pointer(svg,'pointerup',650,260);
  assert.equal(P.ui.selection.length,4);assert.equal(d.querySelectorAll('.block.selected').length,2);assert.equal(d.querySelectorAll('.connection.selected').length,1);assert.equal(d.querySelectorAll('.free-line.selected').length,1);
  assert.equal(d.querySelector('#selection-badge').textContent,'MULTI SELECT');
  const body=d.querySelector(`[data-id="${a.id}"] .body`);
  pointer(body,'pointerdown',120,120);pointer(svg,'pointermove',160,140);pointer(svg,'pointerup',160,140);
  assert.equal(a.x,140);assert.equal(b.x,440);assert.equal(P.state.lines[0].x1,160);assert.equal(P.state.lines[0].y1,250);
  key(svg,'c',{ctrlKey:true});P.update(a.id,{name:'Changed original'});
  key(svg,'v',{ctrlKey:true});
  assert.equal(P.state.components.length,4);assert.equal(P.state.ports.length,8);assert.equal(P.state.connections.length,2);assert.equal(P.state.lines.length,2);
  const copied=P.ui.selection.filter(s=>s.kind==='component').map(s=>P.component(s.id)),copiedIds=new Set(copied.map(c=>c.id));
  const copiedEdge=P.state.connections.find(e=>e.id!==edge.id);assert.ok(copiedIds.has(copiedEdge.source.componentId));assert.ok(copiedIds.has(copiedEdge.target.componentId));
  assert.notEqual(copiedEdge.source.portId,pa.id);assert.equal(P.port(copiedEdge.source.portId).componentId,copiedEdge.source.componentId);
  assert.equal(copied.find(c=>c.type==='SDR').name,'SDR');assert.equal(copied.find(c=>c.type==='SDR').x,180);
  assert.equal(P.state.lines[1].arrows,'both');assert.equal(P.state.lines[1].label,'Annotation');
  key(svg,'v',{ctrlKey:true});assert.equal(P.state.components.length,6);assert.equal(P.state.components.at(-2).x,220);
  const ids=[...P.state.components,...P.state.ports,...P.state.connections,...P.state.lines].map(o=>o.id);assert.equal(new Set(ids).size,ids.length);
  key(svg,'Delete');assert.equal(P.state.components.length,4);assert.equal(P.state.connections.length,2);assert.equal(P.state.lines.length,2);
  assert.equal(P.ui.selection.length,0);E.clean();
});
test('Shift selection toggles, Ctrl+A selects all, inputs retain native shortcuts, and copy survives clear',()=>{
  const E=editor(),{P,d,svg,pointer,key,field}=E;P.clearCanvas();
  const a=P.addComponent('CPU',100,100),b=P.addComponent('DDR',400,100);
  P.select(a.id);const body=d.querySelector(`[data-id="${b.id}"] .body`);
  pointer(body,'pointerdown',420,120,{shiftKey:true});assert.equal(P.ui.selection.length,2);
  pointer(body,'pointerdown',420,120,{shiftKey:true});assert.equal(P.ui.selection.length,1);assert.equal(P.ui.selected,a.id);
  key(field('Name'),'c',{ctrlKey:true});assert.equal(P.hasClipboard(),false);
  key(svg,'a',{ctrlKey:true});assert.equal(P.ui.selection.length,2);
  d.querySelector('#copy-selection').click();P.clearCanvas();d.querySelector('#paste-selection').click();assert.equal(P.state.components.length,2);assert.equal(P.ui.selection.length,2);
  const copyIds=P.state.components.map(c=>c.id);assert.ok(!copyIds.includes(a.id));assert.ok(!copyIds.includes(b.id));
  E.clean();
});
test('Marquee uses rotated bounds and group drag cancellation restores positions',()=>{
  const E=editor(),{P,d,svg,pointer,key}=E;P.clearCanvas();
  const a=P.addComponent('CPU',100,100,{rotation:90}),line=P.addLine({x1:150,y1:70,x2:240,y2:230});
  pointer(svg,'pointerdown',260,260);pointer(svg,'pointermove',140,50);pointer(svg,'pointerup',140,50);assert.equal(P.ui.selection.length,2);
  pointer(d.querySelector(`[data-id="${a.id}"] .body`),'pointerdown',180,120);pointer(svg,'pointermove',220,160);assert.equal(a.x,140);
  key(svg,'Escape');assert.equal(a.x,100);assert.equal(line.x1,150);assert.equal(P.ui.selection.length,0);
  E.clean();
});
test('Copying nodes includes internal edges; isolated edges respect capacity and missing endpoints',()=>{
  const E=editor(),{P}=E;P.clearCanvas();
  const a=P.addComponent('CPU'),b=P.addComponent('SDR'),pa=P.addPort(a.id,{maxConnections:1}),pb=P.addPort(b.id,{side:'left',maxConnections:1});
  const edge=P.addConnection({componentId:a.id,portId:pa.id,anchor:'right'},{componentId:b.id,portId:pb.id,anchor:'left'});
  P.selectMany([{id:a.id,kind:'component'},{id:b.id,kind:'component'}]);P.copySelection();P.pasteSelection();assert.equal(P.state.connections.length,2);
  P.select(edge.id,'connection');P.copySelection();P.pasteSelection();assert.equal(P.state.connections.length,2);assert.match(P.ui.warning,/略過/);
  P.select(a.id);P.removeSelected();P.pasteSelection();assert.equal(P.state.connections.length,1);
  assert.ok(P.state.connections.every(e=>P.component(e.source.componentId)&&P.component(e.target.componentId)));
  E.clean();
});
test('Workspace dimensions, zoom, fit and pan change the visible range without moving objects',()=>{
  const E=editor(),{P,d,svg,pointer,input}=E;
  const component=P.state.components[0],original={x:component.x,y:component.y};
  input(d.querySelector('#workspace-width'),'2400');input(d.querySelector('#workspace-height'),'1600');d.querySelector('#apply-workspace').click();
  assert.equal(P.state.workspace.width,2400);assert.equal(P.state.workspace.height,1600);assert.equal(svg.getAttribute('viewBox'),'0 0 2400 1600');
  assert.equal(d.querySelector('#canvas-background').getAttribute('width'),'2400');assert.equal(d.querySelector('#canvas-background').getAttribute('height'),'1600');
  d.querySelector('#zoom-in').click();const zoomed=svg.getAttribute('viewBox').split(' ').map(Number);assert.ok(zoomed[2]<2400);assert.match(d.querySelector('#zoom-status').textContent,/125%/);
  d.querySelector('#fit-view').click();assert.equal(svg.getAttribute('viewBox'),'0 0 2400 1600');
  d.querySelector('#pan-mode').click();pointer(svg,'pointerdown',700,425);pointer(svg,'pointermove',560,340);pointer(svg,'pointerup',560,340);
  const panned=svg.getAttribute('viewBox').split(' ').map(Number);assert.equal(panned[0],240);assert.equal(panned[1],160);assert.equal(component.x,original.x);assert.equal(component.y,original.y);
  d.querySelector('#fit-view').click();assert.equal(svg.getAttribute('viewBox'),'0 0 2400 1600');
  input(d.querySelector('#workspace-width'),'399');d.querySelector('#apply-workspace').click();assert.equal(P.state.workspace.width,2400);assert.equal(d.querySelector('#graph-warning').hidden,false);
  input(d.querySelector('#workspace-width'),'10000');input(d.querySelector('#workspace-height'),'10000');d.querySelector('#apply-workspace').click();assert.equal(svg.getAttribute('viewBox'),'0 0 10000 10000');
  E.clean();
});
test('Block colors render immediately, copy with components and restore from local save',()=>{
  const E=editor(),{P,d,pointer,input,field,svg}=E;
  const cpu=P.state.components.find(c=>c.type==='CPU'),body=d.querySelector(`[data-id="${cpu.id}"] .body`);
  pointer(body,'pointerdown',cpu.x+10,cpu.y+10);pointer(svg,'pointerup');
  input(field('Block Color'),'#a13f6b');assert.equal(cpu.renderColor,'#a13f6b');assert.equal(body.getAttribute('fill'),'#a13f6b');assert.match(body.style.fill,/161, 63, 107/);
  P.copySelection();P.pasteSelection();const copy=P.component(P.ui.selection.find(s=>s.kind==='component').id);assert.equal(copy.renderColor,'#a13f6b');
  assert.equal(P.saveProject(),true);const savedCount=P.state.components.length;
  P.update(cpu.id,{name:'Mutated',renderColor:'#ffffff'});P.clearCanvas();assert.equal(P.state.components.length,0);
  assert.equal(P.loadSavedProject(),true);assert.equal(P.state.components.length,savedCount);
  const restored=P.component(cpu.id);assert.equal(restored.name,'CPU');assert.equal(restored.renderColor,'#a13f6b');
  assert.equal(d.querySelector(`[data-id="${cpu.id}"] .body`).getAttribute('fill'),'#a13f6b');assert.match(d.querySelector(`[data-id="${cpu.id}"] .body`).style.fill,/161, 63, 107/);
  assert.equal(d.querySelectorAll('.block').length,savedCount);assert.equal(d.querySelectorAll('.connection').length,P.state.connections.length);
  E.clean();
});
test('JSON import validates graph references and export SVG is a clean full-workspace image',()=>{
  const E=editor(),{P,d}=E,original=JSON.stringify(P.state),data=JSON.parse(original);
  data.project.name='Imported Project';data.workspace={width:2200,height:1200};data.components[0].renderColor='#336699';
  assert.equal(P.importProjectText(JSON.stringify(data)),true);assert.equal(P.state.project.name,'Imported Project');assert.equal(P.state.workspace.width,2200);
  const svg=P.buildExportSvg();assert.match(svg,/viewBox="0 0 2200 1200"/);assert.match(svg,/fill="#336699"/);assert.doesNotMatch(svg,/selection-box|connection-preview|resize-handle|connection-point|edge-hit|line-handle/);
  const snapshot=JSON.stringify(P.state),broken=JSON.parse(snapshot);broken.connections[0].source.componentId='missing';
  assert.equal(P.importProjectText(JSON.stringify(broken)),false);assert.equal(JSON.stringify(P.state),snapshot);assert.match(P.ui.warning,/匯入失敗/);
  const duplicate=JSON.parse(snapshot);duplicate.lines.push({...duplicate.lines[0],id:duplicate.components[0].id});
  if(!duplicate.lines[0])duplicate.lines.push({id:duplicate.components[0].id,x1:0,y1:0,x2:10,y2:10,label:'',arrows:'end'});
  assert.equal(P.importProjectText(JSON.stringify(duplicate)),false);assert.equal(JSON.stringify(P.state),snapshot);
  assert.equal(P.importProjectText('{bad json'),false);assert.equal(JSON.stringify(P.state),snapshot);
  E.clean();
});
test('JSON and PNG exports produce downloads; PNG scales very large workspaces safely',async()=>{
  const E=editor(),{P,w,d}=E,downloads=[];
  w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  P.exportProject();assert.ok(downloads[0].endsWith('.json'));
  let drawn=false,canvasSize;
  w.Image=class{set src(value){this._src=value;queueMicrotask(()=>this.onload());}};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillStyle:'',fillRect(){},drawImage(){drawn=true;}});
  w.HTMLCanvasElement.prototype.toBlob=function(callback){canvasSize=[this.width,this.height];callback(new w.Blob(['png'],{type:'image/png'}));};
  P.resizeWorkspace(10000,6000);assert.equal(await P.exportPNG(),true);assert.equal(drawn,true);assert.ok(downloads[1].endsWith('.png'));
  assert.deepEqual(canvasSize,[8192,4915]);
  const canvas=d.querySelector('canvas');assert.equal(canvas,null);
  E.clean();
});

test('Theme toggle persists in project state and block typography renders immediately',()=>{
  const E=editor(),{P,d,svg,pointer,input,field}=E;
  assert.equal(d.documentElement.dataset.theme,'dark');d.querySelector('#theme-toggle').click();assert.equal(P.state.appearance.theme,'light');assert.equal(d.documentElement.dataset.theme,'light');assert.match(d.querySelector('#theme-toggle').textContent,/深色/);
  const cpu=P.state.components.find(c=>c.type==='CPU'),node=d.querySelector(`[data-id="${cpu.id}"]`);pointer(node.querySelector('.body'),'pointerdown',cpu.x+10,cpu.y+10);pointer(svg,'pointerup');
  input(field('Font'),'Consolas');input(field('Font Size'),'22');input(field('Text Color'),'#cc3366');
  assert.equal(cpu.fontFamily,'Consolas');assert.equal(cpu.fontSize,22);assert.equal(cpu.textColor,'#cc3366');assert.equal(node.querySelector('.name').style.fontFamily,'Consolas');assert.equal(node.querySelector('.name').style.fontSize,'22px');assert.match(node.querySelector('.name').style.fill,/204, 51, 102/);
  const exported=P.buildExportSvg();assert.match(exported,/fill="#f4f7fa"/);P.saveProject();d.querySelector('#theme-toggle').click();P.loadSavedProject();assert.equal(d.documentElement.dataset.theme,'light');E.clean();
});

test('Text boxes create, edit, move, resize, copy, save and clear as first-class objects',()=>{
  const E=editor(),{P,d,svg,pointer,input,field,key}=E;P.clearCanvas();d.querySelector('#text-mode').click();assert.equal(P.ui.mode,'text');
  pointer(svg,'pointerdown',100,120);pointer(svg,'pointermove',380,260);pointer(svg,'pointerup',380,260);assert.equal(P.state.textBoxes.length,1);assert.equal(P.ui.selectedKind,'text');assert.equal(P.ui.mode,'select');
  const box=P.state.textBoxes[0],node=d.querySelector(`[data-text-id="${box.id}"]`);assert.ok(node);assert.equal(node.querySelectorAll('.text-resize-handle').length,8);
  input(field('Text'),'RF signal chain\nPrototype annotation');input(field('Font'),'Georgia');input(field('Font Size'),'24');input(field('Text Color'),'#112233');input(field('Background Color'),'#ddeeff');input(field('Border Color'),'#445566');
  assert.equal(box.text,'RF signal chain\nPrototype annotation');assert.equal(box.fontFamily,'Georgia');assert.equal(box.fontSize,24);assert.match(node.querySelector('.text-box-content').textContent,/Prototypeannotation/);assert.match(node.querySelector('.text-box-body').style.fill,/221, 238, 255/);
  pointer(node.querySelector('.text-box-body'),'pointerdown',120,140);pointer(svg,'pointermove',180,200);pointer(svg,'pointerup',180,200);assert.equal(box.x,160);assert.equal(box.y,180);
  pointer(node.querySelector('[data-text-handle="se"]'),'pointerdown',440,320);pointer(svg,'pointermove',520,380);pointer(svg,'pointerup',520,380);assert.equal(box.width,360);assert.equal(box.height,200);
  key(svg,'c',{ctrlKey:true});key(svg,'v',{ctrlKey:true});assert.equal(P.state.textBoxes.length,2);assert.equal(P.ui.selectedKind,'text');assert.notEqual(P.ui.selected,box.id);
  P.saveProject();P.clearCanvas();assert.equal(d.querySelectorAll('.text-box').length,0);P.loadSavedProject();assert.equal(P.state.textBoxes.length,2);assert.equal(d.querySelectorAll('.text-box').length,2);
  P.addComponent('CPU');const saved=JSON.parse(JSON.stringify(P.state));delete saved.appearance;delete saved.textBoxes;saved.components.forEach(c=>{delete c.fontFamily;delete c.fontSize;delete c.textColor;});assert.equal(P.importProjectText(JSON.stringify(saved)),true);assert.equal(P.state.appearance.theme,'dark');assert.equal(P.state.textBoxes.length,0);assert.equal(P.state.components[0].fontFamily,'Segoe UI');E.clean();
});



test('Virtual IC placement preserves architecture, clamps geometry and round trips project data',()=>{
  const E=editor(),{P,d,input}=E;
  const original=JSON.stringify(P.state.components);
  d.querySelector('[data-tab="placement"]').click();
  d.querySelector('#place-all').click();
  assert.equal(P.state.placements.length,P.state.components.length);
  d.querySelector('#place-all').click();
  assert.equal(P.state.placements.length,P.state.components.length);
  assert.equal(d.querySelectorAll('.pcb-chip').length,P.state.components.length);
  assert.ok(d.querySelectorAll('#pcb-nets line').length>0);
  const p=P.state.placements.at(-1);
  input(d.querySelector('#placement-editor input'),'999','change');
  assert.equal(p.x,P.state.board.width-p.width);
  const rotate=[...d.querySelectorAll('#placement-editor button')].find(b=>b.textContent==='旋轉 90°');rotate.click();
  assert.equal(p.rotation,90);
  const pcb=d.querySelector('#pcb-canvas');
  pcb.getBoundingClientRect=()=>({left:0,top:0,width:170,height:110});
  pcb.setPointerCapture=()=>{};
  E.pointer(d.querySelector(`#pcb-canvas [data-component="${p.componentId}"]`),'pointerdown',p.x+7,p.y+7);
  E.pointer(pcb,'pointermove',25,35);E.pointer(pcb,'pointerup',25,35);
  assert.equal(p.x,18);assert.equal(p.y,28);
  input(d.querySelector('#board-width'),'20','input');
  input(d.querySelector('#board-height'),'20','input');d.querySelector('#apply-board').click();
  assert.equal(P.state.board.width,20);
  assert.ok(P.state.placements.every(p=>p.x+P.placement.size(p).w<=20&&p.y+P.placement.size(p).h<=20));
  assert.match(d.querySelector('#placement-message').textContent,/重疊/);
  assert.equal(JSON.stringify(P.state.components),original);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);
  assert.equal(JSON.stringify(P.state),saved);
  const invalid=JSON.parse(saved);invalid.placements[0].width=-1;
  assert.equal(P.importProjectText(JSON.stringify(invalid)),false);
  assert.equal(JSON.stringify(P.state),saved);
  P.select(P.state.placements[0].componentId);P.removeSelected();
  assert.equal(P.state.placements.length,P.state.components.length);
  P.clearCanvas();assert.equal(d.querySelectorAll('.pcb-chip').length,0);
  E.clean();
});
test('Architecture IC dimensions drive placement, area, copy and legacy migration',()=>{
  const E=editor(),{P,d,input,field}=E;
  const c=P.state.components[0];P.select(c.id);
  input(field('IC 長 (mm)'),'18.5','change');input(field('IC 寬 (mm)'),'9.2','change');
  assert.equal(c.icWidth,18.5);assert.equal(c.icHeight,9.2);
  assert.equal(field('IC 面積 (mm²)').value,'170.2');
  P.placement.place(c.id);const p=P.state.placements[0];
  assert.equal(p.width,18.5);assert.equal(p.height,9.2);
  p.rotation=90;p.x=150;
  input(field('IC 寬 (mm)'),'20','change');
  assert.equal(p.height,20);assert.equal(p.x,140);
  assert.equal(P.update(c.id,{icWidth:101},'ic-size'),false);
  assert.equal(c.icWidth,18.5);assert.equal(p.width,18.5);
  assert.equal(P.update(c.id,{icWidth:NaN},'ic-size'),false);
  P.copySelection();P.pasteSelection();assert.equal(P.component(P.ui.selected).icHeight,20);
  d.querySelector('[data-tab="placement"]').click();
  d.querySelector('#inventory button').click();
  const fields=[...d.querySelectorAll('#placement-editor input')];
  assert.equal(fields[2].readOnly,true);assert.equal(fields[2].value,'18.5');
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);
  assert.equal(JSON.stringify(P.state),saved);
  const legacy=JSON.parse(saved);for(const c of legacy.components){delete c.icWidth;delete c.icHeight;}
  assert.equal(P.importProjectText(JSON.stringify(legacy)),true);
  assert.equal(P.component(c.id).icWidth,18.5);assert.equal(P.component(c.id).icHeight,20);
  E.clean();
});
test('3D IC height, board thickness, camera controls and old project defaults',()=>{
  const E=editor(),{P,d,input,field,pointer,key}=E;const c=P.state.components[0];P.select(c.id);
  input(field('IC 長 (mm)'),'20','change');input(field('IC 寬 (mm)'),'10','change');input(field('IC 高 (mm)'),'7.5','change');
  assert.equal(c.icThickness,7.5);assert.equal(field('IC 面積 (mm²)').value,'200');
  assert.equal(P.update(c.id,{icThickness:-1}),false);
  d.querySelector('[data-tab="placement"]').click();P.placement.place(c.id);
  const svg=d.querySelector('#pcb-3d');assert.equal(svg.hasAttribute('hidden'),false);
  assert.equal(svg.querySelectorAll('polygon').length,24);
  assert.match(d.querySelector('#height-summary').textContent,/9.1 mm/);
  input(d.querySelector('#board-thickness'),'2.4');d.querySelector('#apply-board').click();
  assert.equal(P.state.board.thickness,2.4);assert.match(d.querySelector('#height-summary').textContent,/9.9 mm/);
  const before=svg.querySelector('polygon').getAttribute('points'),state=JSON.stringify(P.state);
  svg.setPointerCapture=()=>{};pointer(svg,'pointerdown',10,10);pointer(svg,'pointermove',60,40);pointer(svg,'pointerup',60,40);
  assert.notEqual(svg.querySelector('polygon').getAttribute('points'),before);assert.equal(JSON.stringify(P.state),state);
  const bounds=svg.getAttribute('viewBox');key(svg,'+');assert.notEqual(svg.getAttribute('viewBox'),bounds);
  d.querySelector('#view-top').click();assert.equal(svg.hasAttribute('hidden'),true);assert.equal(d.querySelector('#pcb-canvas').hasAttribute('hidden'),false);
  d.querySelector('#view-3d').click();assert.equal(svg.hasAttribute('hidden'),false);
  const saved=JSON.stringify(P.state);P.clearCanvas();assert.equal(P.importProjectText(saved),true);
  assert.equal(P.component(c.id).icThickness,7.5);assert.equal(P.state.board.thickness,2.4);
  const legacy=JSON.parse(saved);delete legacy.board.thickness;for(const c of legacy.components)delete c.icThickness;
  assert.equal(P.importProjectText(JSON.stringify(legacy)),true);assert.equal(P.state.board.thickness,1.6);assert.equal(P.component(c.id).icThickness,1.5);
  const invalid=JSON.parse(saved);invalid.board.thickness=-2;assert.equal(P.importProjectText(JSON.stringify(invalid)),false);
  E.clean();
});
test('3D board never paints over IC top surfaces at different board positions and camera angles',()=>{
  const E=editor(),{P,d,pointer}=E;P.clearCanvas();
  const c=P.addComponent('CPU');P.placement.place(c.id);
  d.querySelector('[data-tab="placement"]').click();
  d.querySelector('#show-ratsnest').checked=false;
  const svg=d.querySelector('#pcb-3d');svg.setPointerCapture=()=>{};
  const placement=P.state.placements[0];
  function contains(poly,point){
    const ps=poly.getAttribute('points').split(' ').map(p=>p.split(',').map(Number));let inside=false;
    for(let i=0,j=ps.length-1;i<ps.length;j=i++){
      const [x,y]=ps[i],[X,Y]=ps[j];
      if((y>point.y)!==(Y>point.y)&&point.x<(X-x)*(point.y-y)/(Y-y)+x)inside=!inside;
    }
    return inside;
  }
  for(const [x,y] of [[4,4],[140,4],[4,80],[140,80]]){
    placement.x=x;placement.y=y;
    for(const yaw of [-2.5,-1,0,1,2.5])for(const tilt of [-1.3,-.4,.4,1.3]){
      d.querySelector('#reset-3d').click();
      pointer(svg,'pointerdown',0,0);pointer(svg,'pointermove',(yaw+.55)*100,(tilt-1.05)*100);pointer(svg,'pointerup',(yaw+.55)*100,(tilt-1.05)*100);
      const center=P.pcb3d.project(x+6,y+6,P.state.board.thickness+c.icThickness);
      const covering=[...svg.querySelectorAll('polygon')].filter(poly=>contains(poly,center));
      assert.ok(covering.length>0);
      assert.equal(covering.at(-1).closest('[data-component]')?.dataset.component,c.id,`IC at ${x},${y}, yaw ${yaw}, tilt ${tilt} must remain visible`);
      assert.equal(svg.firstElementChild.dataset.layer,'board');
    }
  }
  E.clean();
});
test('IC packages persist and SOT pins are even, symmetric and rotate with the body',()=>{
  const E=editor(),{P,d,input,field}=E;const c=P.state.components[0];P.select(c.id);
  assert.equal(c.icPackage,'QFN');
  input(field('IC 封裝'),'SOT','change');assert.equal(c.icPackage,'SOT');
  input(field('SOT 總 PIN 腳數'),'10','change');assert.equal(c.icPinCount,10);
  assert.match(d.querySelector('#properties-content').textContent,/左側 5 腳 · 右側 5 腳/);
  input(field('SOT 總 PIN 腳數'),'7','change');assert.equal(c.icPinCount,10);
  assert.equal(field('SOT 總 PIN 腳數').checkValidity(),false);
  for(const n of [0,3,65,4.5,NaN])assert.equal(P.update(c.id,{icPinCount:n}),false);
  assert.equal(P.update(c.id,{icPackage:'UNKNOWN'}),false);
  const {pads}=P.icGeometry(c);assert.equal(pads.length,10);
  for(let i=0;i<pads.length;i+=2){assert.equal(pads[i].y,pads[i+1].y);assert.ok(Math.abs(pads[i].x+pads[i+1].x+pads[i].w-c.icWidth)<1e-9);}
  for(const rotation of [0,90,180,270])for(const pad of pads){const r=P.icRect(pad,c,rotation),w=rotation%180?c.icHeight:c.icWidth,h=rotation%180?c.icWidth:c.icHeight;assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=w+1e-9&&r.y+r.h<=h+1e-9);}
  d.querySelector('[data-tab="placement"]').click();P.placement.place(c.id);
  assert.equal(d.querySelectorAll('#pcb-canvas .pcb-lead').length,10);
  assert.equal(d.querySelectorAll('#pcb-3d .pcb-lead').length,60);
  P.copySelection();P.pasteSelection();assert.equal(P.component(P.ui.selected).icPackage,'SOT');assert.equal(P.component(P.ui.selected).icPinCount,10);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  const invalid=JSON.parse(saved);invalid.components[0].icPinCount=9;assert.equal(P.importProjectText(JSON.stringify(invalid)),false);
  const legacy=JSON.parse(saved);for(const c of legacy.components){delete c.icPackage;delete c.icPinCount;}
  assert.equal(P.importProjectText(JSON.stringify(legacy)),true);assert.equal(P.component(c.id).icPackage,'QFN');
  P.select(c.id);input(field('IC 封裝'),'BGA','change');assert.equal(c.icPackage,'SOT');assert.equal(P.component(c.id).icPackage,'BGA');assert.equal(field('SOT 總 PIN 腳數'),undefined);
  E.clean();
});
test('PCB resize preserves input drafts and applies board area with bounded placements',()=>{
  const E=editor(),{P,d,input}=E;P.clearCanvas();const c=P.addComponent('CPU');
  d.querySelector('[data-tab="placement"]').click();P.placement.place(c.id);
  const p=P.state.placements[0];p.x=140;p.y=80;
  input(d.querySelector('#board-width'),'50');input(d.querySelector('#board-height'),'50');
  P.notify('selection');assert.equal(d.querySelector('#board-width').value,'50');assert.equal(d.querySelector('#board-height').value,'50');
  d.querySelector('#apply-board').click();
  assert.equal(P.state.board.width,50);assert.equal(P.state.board.height,50);
  assert.equal(d.querySelector('#pcb-board').getAttribute('width'),'50');
  assert.equal(p.x,38);assert.equal(p.y,38);assert.match(d.querySelector('#board-message').textContent,/2500 mm²/);
  input(d.querySelector('#board-width'),'10');d.querySelector('#apply-board').click();
  assert.equal(P.state.board.width,50);assert.match(d.querySelector('#board-message').textContent,/容納/);
  assert.equal(d.querySelector('#board-width').value,'10');
  E.clean();
});
test('Bottom placements filter by face, avoid cross-face collisions and render below the PCB',()=>{
  const E=editor(),{P,d,input}=E;P.clearCanvas();
  const top=P.addComponent('CPU',0,0,{icThickness:4}),bottom=P.addComponent('DDR',0,0,{icThickness:3});
  d.querySelector('[data-tab="placement"]').click();P.placement.place(top.id);
  input(d.querySelector('#placement-side'),'bottom','change');P.placement.place(bottom.id);
  const a=P.state.placements[0],b=P.state.placements[1];Object.assign(a,{x:10,y:10});Object.assign(b,{x:10,y:10});P.notify('placement-update');
  assert.equal(b.side,'bottom');assert.equal(d.querySelectorAll('#pcb-canvas .pcb-chip').length,1);
  assert.equal(d.querySelector('#pcb-canvas .pcb-chip').dataset.component,bottom.id);
  assert.match(d.querySelector('#placement-message').textContent,/無元件重疊/);
  assert.match(d.querySelector('#height-summary').textContent,/8.6 mm/);
  const svg=d.querySelector('#pcb-3d');
  assert.equal(svg.firstElementChild.querySelector('[data-component]').dataset.component,bottom.id);
  d.querySelector('#look-bottom').click();
  assert.equal(svg.lastElementChild.querySelector('[data-component]').dataset.component,bottom.id);
  assert.equal(svg.firstElementChild.querySelector('[data-component]').dataset.component,top.id);
  assert.ok([...svg.lastElementChild.querySelectorAll('text')].some(n=>n.textContent==='DDR'));
  d.querySelector('#reset-3d').click();assert.equal(svg.lastElementChild.querySelector('[data-component]').dataset.component,top.id);
  input(d.querySelector('#selected-placement-side'),'top','change');assert.equal(b.side,'top');
  assert.match(d.querySelector('#placement-message').textContent,/2 顆元件重疊/);
  input(d.querySelector('#selected-placement-side'),'bottom','change');
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  const invalid=JSON.parse(saved);invalid.placements[0].side='invalid';assert.equal(P.importProjectText(JSON.stringify(invalid)),false);
  const legacy=JSON.parse(saved);legacy.placements.forEach(p=>delete p.side);assert.equal(P.importProjectText(JSON.stringify(legacy)),true);assert.ok(P.state.placements.every(p=>p.side==='top'));
  E.clean();
});
test('Per-component TOP/Bottom actions place or move exactly one IC and reveal its face',()=>{
  const E=editor(),{P,d}=E;P.clearCanvas();const a=P.addComponent('CPU'),b=P.addComponent('DDR');
  d.querySelector('[data-tab="placement"]').click();
  const row=id=>[...d.querySelectorAll('#inventory tbody tr')].find(r=>r.dataset.componentId===id);
  assert.equal(d.querySelectorAll('#inventory tbody tr').length,2);assert.equal(P.state.placements.length,0);
  assert.equal(row(a.id).querySelector('.placement-side-status').textContent,'未擺放');
  row(a.id).querySelector('[data-place-side="bottom"]').click();
  const p=P.state.placements[0];assert.equal(p.componentId,a.id);assert.equal(p.side,'bottom');assert.equal(d.querySelector('#placement-side').value,'bottom');
  assert.equal(d.querySelector('#pcb-canvas').hasAttribute('hidden'),false);assert.equal(d.querySelectorAll('#pcb-canvas .pcb-chip').length,1);
  row(b.id).querySelector('[data-place-side="top"]').click();assert.equal(P.state.placements.length,2);assert.equal(P.state.placements[1].side,'top');
  Object.assign(p,{x:20,y:25,rotation:90});const id=p.id;
  row(a.id).querySelector('[data-place-side="top"]').click();
  assert.equal(P.state.placements.length,2);assert.equal(p.id,id);assert.equal(p.x,20);assert.equal(p.y,25);assert.equal(p.rotation,90);assert.equal(p.side,'top');
  assert.equal(row(a.id).querySelector('[data-place-side="top"]').getAttribute('aria-pressed'),'true');
  assert.equal(d.querySelectorAll('#pcb-canvas .pcb-chip').length,2);
  row(a.id).querySelector('[data-place-side="top"]').click();assert.equal(P.state.placements.length,2);
  const huge=P.addComponent('FPGA',0,0,{icWidth:200});row(huge.id).querySelector('[data-place-side="bottom"]').click();assert.equal(P.state.placements.length,2);assert.match(d.querySelector('#placement-message').textContent,/超出/);
  assert.ok(d.querySelector('#inventory').compareDocumentPosition(d.querySelector('.pcb-wrap'))&E.w.Node.DOCUMENT_POSITION_FOLLOWING);
  E.clean();
});
test('Link Budget properties, fourth page, settings persistence and Excel export integrate with the editor',()=>{
  const E=editor(),{P,d,input,field}=E;P.clearCanvas();
  const trx=P.addComponent('RF Transceiver'),pa=P.addComponent('PA'),ant=P.addComponent('Antenna');
  P.select(trx.id);input(field('Tx 路數'),'2','change');input(field('Tx DA Power (dBm)'),'1.5','change');input(field('Rx LNA Gain (dB)'),'10','change');input(field('Rx LNA NF (dB)'),'4','change');
  assert.equal(trx.txChannels,2);assert.equal(trx.txPower,1.5);
  P.select(pa.id);input(field('Gain (dB)'),'20','change');input(field('Output P1dB (dBm)'),'18','change');
  const end=c=>({componentId:c.id,portId:null,anchor:'right'}),edge=P.addConnection(end(trx),end(pa),{interfaceType:'RF'});P.addConnection(end(pa),end(ant),{interfaceType:'RF'});
  P.select(edge.id,'connection');input(field('Loss (dB)'),'1','change');input(field('Tx 通道'),'2','change');
  d.querySelector('[data-tab="budget"]').click();assert.equal(d.querySelector('#budget-view').hidden,false);assert.equal(d.querySelector('#architecture-view').hidden,true);assert.match(d.querySelector('#budget-results').textContent,/18.00/);assert.match(d.querySelector('#budget-results').textContent,/尚未連接/);
  input(d.querySelector('#budget-bandwidth'),'40','change');input(d.querySelector('#budget-snr'),'8.5','change');assert.equal(P.state.linkBudget.bandwidthMHz,40);assert.equal(P.state.linkBudget.snrDb,8.5);
  input(d.querySelector('#budget-frequency'),'3500','change');assert.equal(P.state.linkBudget.frequencyMHz,3500);assert.equal(P.state.linkBudget.bandwidthMHz,40);assert.match(d.querySelector('#budget-summary').textContent,/3500 MHz/);
  d.querySelector('[data-tab="checks"]').click();assert.equal(d.querySelector('#prd-frequencyMHz').value,'3500');input(d.querySelector('#prd-frequencyMHz'),'5800','change');assert.equal(P.state.linkBudget.frequencyMHz,5800);d.querySelector('[data-tab="budget"]').click();assert.equal(d.querySelector('#budget-frequency').value,'5800');
  input(d.querySelector('#budget-frequency'),'-1','change');assert.equal(P.state.linkBudget.frequencyMHz,5800);input(d.querySelector('#budget-frequency'),'','change');assert.equal(P.state.linkBudget.frequencyMHz,null);
  {const legacy=JSON.parse(JSON.stringify(P.state));delete legacy.linkBudget.frequencyMHz;legacy.prd.frequencyMHz=2400;assert.equal(P.importProjectText(JSON.stringify(legacy)),true);assert.equal(P.state.linkBudget.frequencyMHz,2400);assert.equal('frequencyMHz' in P.state.prd,false);P.state.linkBudget.frequencyMHz=null;}
  assert.equal(P.budgetUI.exportExcel(),true);assert.match(d.querySelector('#budget-status').textContent,/Excel 匯出完成/);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  const bad=JSON.parse(saved);bad.components[0].txChannels=6;assert.equal(P.importProjectText(JSON.stringify(bad)),false);
  const old=JSON.parse(saved);delete old.linkBudget;for(const c of old.components)for(const [key] of P.rfFields(c))delete c[key];for(const e of old.connections){delete e.loss;delete e.rfMode;delete e.txChannel;delete e.rxChannel;}
  assert.equal(P.importProjectText(JSON.stringify(old)),true);assert.equal(P.state.linkBudget.bandwidthMHz,20);assert.equal(P.component(trx.id).txChannels,1);assert.equal(P.component(trx.id).txPower,null);assert.equal(P.connection(edge.id).loss,0);
  E.clean();
});
test('RF inspector fields appear first and selection resets scroll; SDR explains where to edit RF',()=>{
  const E=editor(),{P,d}=E,panel=d.querySelector('#properties-content');
  const sdr=P.state.components.find(c=>c.type==='SDR'),pa=P.state.components.find(c=>c.type==='PA'),trx=P.state.components.find(c=>c.type==='RF Transceiver');
  P.select(sdr.id);assert.match(panel.textContent,/SDR 為基頻/);
  panel.scrollTop=500;P.select(pa.id);assert.equal(panel.scrollTop,0);
  assert.equal(panel.querySelector('input').name,'rfGain');assert.ok(panel.querySelector('[name="p1db"]'));
  panel.scrollTop=400;P.select(trx.id);assert.equal(panel.scrollTop,0);assert.equal(panel.querySelector('input').name,'txChannels');
  assert.ok(panel.querySelector('[name="txPower"]'));assert.ok(panel.querySelector('[name="rxNf"]'));
  const count=P.state.components.length;P.select(sdr.id);[...panel.querySelectorAll('button')].find(b=>b.textContent.includes('新增 RF Transceiver')).click();
  assert.equal(P.state.components.length,count+1);assert.equal(P.component(P.ui.selected).type,'RF Transceiver');assert.ok(P.component(sdr.id));assert.equal(panel.scrollTop,0);
  assert.match(d.querySelector('[data-name="RF Transceiver"]').textContent,/TRX/);
  E.clean();
});
test('RF general Connect infers RF, preserves explicit interfaces, and repairs legacy Digital paths on request',()=>{
  const E=editor(),{P,d}=E;P.clearCanvas();
  const trx=P.addComponent('RF Transceiver',0,0,{txPower:0}),pa=P.addComponent('PA',0,0,{rfGain:20,p1db:25}),sw=P.addComponent('RF Switch',0,0,{rfLoss:1,maxInput:30}),filter=P.addComponent('Filter',0,0,{rfLoss:2,maxInput:30}),ant=P.addComponent('Antenna');
  const end=c=>({componentId:c.id,portId:null,anchor:'right'});
  const auto=P.addConnection(end(trx),end(pa));assert.equal(auto.interfaceType,'RF');P.removeConnection(auto.id);
  const edges=[];for(const [a,b] of [[trx,pa],[pa,sw],[sw,filter],[filter,ant]])edges.push(P.addConnection(end(a),end(b),{interfaceType:'Digital'}));
  const cpu=P.addComponent('CPU');const control=P.addConnection(end(cpu),end(trx));assert.equal(control.interfaceType,'Digital');
  const clock=P.addPort(trx.id,{name:'CLK',type:'Clock',side:'top'});const clk=P.addConnection({...end(trx),portId:clock.id},end(pa));assert.equal(clk.interfaceType,'Clock');
  d.querySelector('[data-tab="budget"]').click();
  assert.match(d.querySelector('#budget-rf-diagnostic').textContent,/4 條/);assert.match(d.querySelector('#budget-results').textContent,/連線類型為 Digital/);
  assert.equal(P.linkBudget.evaluate()[0].valid,false);
  d.querySelector('#budget-convert-rf').click();
  assert.ok(edges.every(e=>e.interfaceType==='RF'));assert.equal(control.interfaceType,'Digital');assert.equal(clk.interfaceType,'Clock');
  assert.equal(d.querySelector('#budget-rf-diagnostic'),null);
  const tx=P.linkBudget.evaluate().find(r=>r.kind==='tx');assert.equal(tx.valid,true);assert.equal(tx.value,17);assert.match(tx.path,/PA → RF Switch → Filter → Antenna/);
  assert.equal(P.linkBudget.evaluate().find(r=>r.kind==='rx').valid,false);
  E.clean();
});
test('RF port editors rebuild with counts and preserve UUIDs, per-port values and copied lane connections',()=>{
  const E=editor(),{P,d,input,field}=E;P.clearCanvas();
  const trx=P.addComponent('RF Transceiver'),sw=P.addComponent('RF Switch');P.select(trx.id);
  input(field('Tx 路數'),'4','change');input(field('Rx 路數'),'2','change');
  assert.equal(d.querySelectorAll('#properties-content .port-card').length,6);assert.equal(d.querySelectorAll(`[data-id="${trx.id}"] .rf-port-label`).length,6);
  const tx=P.componentPorts(trx.id).find(p=>p.rfKey==='tx:3');
  P.select(sw.id);input(field('RF 分支 Port 數量'),'3','change');assert.equal(d.querySelectorAll('#properties-content .port-card').length,4);
  const p=P.componentPorts(sw.id)[0],card=d.querySelector(`.port-card[data-port-id="${p.id}"]`);
  input(card.querySelector('[name="loss"]'),'0.7','change');input(card.querySelector('[name="maxLevel"]'),'24','change');assert.equal(p.loss,.7);assert.equal(p.maxLevel,24);
  const edge=P.addConnection({componentId:trx.id,portId:tx.id,anchor:'right'},{componentId:sw.id,portId:p.id,anchor:'left'});assert.equal(edge.txChannel,3);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  P.selectMany([{id:trx.id,kind:'component'},{id:sw.id,kind:'component'}]);P.copySelection();P.pasteSelection();
  const copied=P.ui.selection.filter(s=>s.kind==='component').map(s=>P.component(s.id)),copyTrx=copied.find(c=>P.isTrx(c)),copySw=copied.find(c=>c.type==='RF Switch');
  assert.equal(P.componentPorts(copyTrx.id).filter(p=>p.type==='RF').length,6);assert.equal(P.componentPorts(copySw.id).filter(p=>p.type==='RF').length,4);assert.equal(P.componentPorts(copySw.id)[0].loss,.7);
  const old=JSON.parse(saved);const oldTx=old.ports.find(p=>p.id===tx.id);delete oldTx.rfKey;oldTx.name='RF_OUT';
  assert.equal(P.importProjectText(JSON.stringify(old)),true);assert.ok(P.port(tx.id));assert.equal(P.connection(edge.id).source.portId,tx.id);
  E.clean();
});
test('Fixed RF layout uses right TRX ports, left switch branches and one persistent RFC including legacy migration',()=>{
  const E=editor(),{P}=E;P.clearCanvas();
  const trx=P.addComponent('RF Transceiver',0,0,{txChannels:2,rxChannels:2}),sw=P.addComponent('RF Switch');
  const rf=P.componentPorts(trx.id);assert.ok(rf.every(p=>p.side==='right'));assert.equal(rf.length,4);
  const common=P.componentPorts(sw.id).find(p=>p.rfKey==='rfc');assert.equal(common.name,'RFC');assert.equal(common.side,'right');
  assert.ok(P.componentPorts(sw.id).filter(p=>p.rfKey.startsWith('rf:')).every(p=>p.side==='left'));
  P.updatePort(common.id,{loss:.8,maxLevel:25});const rx=rf.find(p=>p.rfKey==='rx:2');
  const e=P.addConnection({componentId:sw.id,portId:common.id,anchor:'right'},{componentId:trx.id,portId:rx.id,anchor:'right'});assert.ok(e);
  assert.equal(P.updatePort(rx.id,{side:'left'}),false);
  P.update(sw.id,{rfPortCount:4});assert.equal(P.componentPorts(sw.id).filter(p=>p.rfKey==='rfc').length,1);assert.equal(P.port(common.id).loss,.8);
  P.update(sw.id,{rfPortCount:2});assert.equal(P.port(common.id).maxLevel,25);assert.equal(P.connection(e.id).source.portId,common.id);
  const old=JSON.parse(JSON.stringify(P.state));const oldSw=old.components.find(c=>c.id===sw.id);delete oldSw.rfPortLayout;
  old.ports=old.ports.filter(p=>!(p.componentId===sw.id&&p.rfKey==='rf:2'));
  const oldCommon=old.ports.find(p=>p.id===common.id);oldCommon.rfKey='rf:2';oldCommon.name='RF2';
  const oldRx=old.ports.find(p=>p.id===rx.id);oldRx.side='left';old.connections[0].target.anchor='left';
  assert.equal(P.importProjectText(JSON.stringify(old)),true);assert.equal(P.port(common.id).name,'RFC');assert.equal(P.port(common.id).loss,.8);assert.equal(P.port(rx.id).side,'right');assert.equal(P.connection(e.id).target.anchor,'right');
  assert.equal(P.componentPorts(sw.id).filter(p=>p.side==='right').length,1);assert.equal(P.componentPorts(sw.id).filter(p=>p.side==='left').length,2);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  E.clean();
});
test('TRX signal-mode controls update differential wiring and persist through copy/load with Balun',()=>{
  const E=editor(),{P,d,input}=E;P.clearCanvas();const trx=P.addComponent('RF Transceiver'),balun=P.addComponent('Balun');P.select(trx.id);
  const tx=P.componentPorts(trx.id).find(p=>p.rfKey==='tx:1'),balanced=P.componentPorts(balun.id).find(p=>p.rfKey==='balanced');
  const selector=d.querySelector(`.port-card[data-port-id="${tx.id}"] [name="signalMode"]`);input(selector,'differential','change');assert.equal(tx.signalMode,'differential');
  const edge=P.addConnection({componentId:trx.id,portId:tx.id,anchor:'right'},{componentId:balun.id,portId:balanced.id,anchor:'left'});
  assert.equal(d.querySelector(`[data-edge-id="${edge.id}"]`).classList.contains('rf-differential'),false);
  assert.match(d.querySelector(`[data-id="${trx.id}"] [data-port-id="${tx.id}"] .rf-port-label`).textContent,/\+/);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  P.selectMany([{id:trx.id,kind:'component'},{id:balun.id,kind:'component'}]);P.copySelection();P.pasteSelection();
  const copies=P.ui.selection.filter(s=>s.kind==='component').map(s=>P.component(s.id)),copy=copies.find(P.isTrx);
  assert.equal(P.componentPorts(copy.id).find(p=>p.rfKey==='tx:1').signalMode,'differential');
  assert.equal(P.componentPorts(copies.find(c=>c.type==='Balun').id).length,2);
  assert.ok(d.querySelector('[data-name="Balun"]'));
  E.clean();
});
test('Separate differential endpoints accept independent pointer connections and preserve polarity after save/copy',()=>{
  const E=editor(),{P,d,svg,pointer}=E;P.clearCanvas();const trx=P.addComponent('RF Transceiver',100,100),balun=P.addComponent('Balun',500,100);
  const tx=P.componentPorts(trx.id).find(p=>p.rfKey==='tx:1'),bal=P.componentPorts(balun.id).find(p=>p.rfKey==='balanced');P.updatePort(tx.id,{signalMode:'differential'});
  const point=(id,pol)=>d.querySelector(`.connection-point[data-port-id="${id}"][data-polarity="${pol}"]`);
  assert.ok(point(tx.id,'+'));assert.ok(point(tx.id,'-'));
  assert.equal(point(tx.id,'+').querySelector('.rf-port-label').textContent,'TX1+');assert.equal(point(tx.id,'-').querySelector('.rf-port-label').textContent,'TX1-');
  assert.notEqual(point(tx.id,'+').getAttribute('transform'),point(tx.id,'-').getAttribute('transform'));
  for(const pol of ['+','-']){pointer(point(tx.id,pol),'pointerdown',300,160);pointer(svg,'pointermove',500,160);E.hit(point(bal.id,pol));pointer(svg,'pointerup',500,160);}
  assert.equal(P.state.connections.length,2);assert.equal(P.state.connections[0].source.polarity,'+');assert.equal(P.state.connections[1].source.polarity,'-');
  assert.equal(P.portUsage(tx.id,'+'),1);assert.equal(P.portUsage(tx.id,'-'),1);
  assert.ok(P.state.connections.every(e=>!P.rfPair(e)?.error));
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  P.selectMany([{id:trx.id,kind:'component'},{id:balun.id,kind:'component'}]);P.copySelection();P.pasteSelection();
  assert.equal(P.state.connections.length,4);assert.equal(P.state.connections.filter(e=>e.source.polarity==='-').length,2);
  E.clean();
});
test('Keep Out blocks moves across both faces, updates rotated zones and rejects conflicting configuration',()=>{
  const E=editor(),{P,d,input,field}=E;P.clearCanvas();
  const a=P.addComponent('CPU',0,0,{icWidth:20,icHeight:10,keepOutSame:true,keepOutOpposite:true,keepOutMargin:3}),b=P.addComponent('DDR',0,0,{icWidth:8,icHeight:8});
  d.querySelector('[data-tab="placement"]').click();P.placement.place(a.id);P.placement.place(b.id);
  const p=P.state.placements.find(p=>p.componentId===a.id),q=P.state.placements.find(p=>p.componentId===b.id);
  assert.equal(P.boardRules.conflict(q),'');assert.ok(d.querySelector('#pcb-keepouts .same'));
  const original={...q};assert.equal(P.placement.commit(q,{x:p.x+20,y:p.y}),false);assert.equal(q.x,original.x);
  assert.equal(P.placement.commit(q,{x:p.x+23,y:p.y}),true);
  assert.equal(P.placement.commit(q,{side:'bottom',x:p.x,y:p.y}),false);
  assert.equal(P.placement.commit(q,{side:'bottom',x:p.x+20,y:p.y}),true);
  assert.equal(P.placement.commit(p,{rotation:90}),true);
  const areas=P.boardRules.zones(p,a);assert.equal(areas.find(a=>a.kind==='opposite').w,10);assert.equal(areas.find(a=>a.kind==='opposite').h,20);
  P.select(a.id);assert.equal(field('同面額外邊距 (mm／每側)').value,'3');
  assert.equal(P.update(a.id,{keepOutMargin:-1}),false);assert.equal(P.update(a.id,{keepOutSame:'yes'}),false);
  P.placement.commit(q,{side:'top',x:p.x+14,y:p.y});assert.equal(P.update(a.id,{keepOutMargin:20}),false);assert.equal(a.keepOutMargin,3);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  const invalid=JSON.parse(saved);invalid.components.find(c=>c.id===a.id).keepOutMargin=100;assert.equal(P.importProjectText(JSON.stringify(invalid)),false);
  E.clean();
});
test('CPU specifications, DDR/eMMC capacity and Keep Out persist in copied components and migrate old projects',()=>{
  const E=editor(),{P,d,input,field}=E;P.clearCanvas();
  const cpu=P.addComponent('CPU');P.select(cpu.id);input(field('CPU 核心數'),'8','change');input(field('CPU 時脈 (MHz)'),'2400.5','change');assert.equal(cpu.cpuCores,8);assert.equal(cpu.cpuClockMHz,2400.5);
  const ddr=P.addComponent('DDR');P.select(ddr.id);input(field('容量'),'16','change');input(field('容量單位'),'Gb','change');assert.equal(ddr.memoryCapacity,16);assert.equal(ddr.memoryUnit,'Gb');
  d.querySelector('[data-name="eMMC"]').click();const emmc=P.component(P.ui.selected);input(field('容量'),'128','change');assert.equal(emmc.memoryCapacity,128);assert.equal(emmc.memoryUnit,'GB');
  P.update(emmc.id,{keepOutSame:true,keepOutMargin:2,keepOutOpposite:true});P.copySelection();P.pasteSelection();const copy=P.component(P.ui.selected);assert.equal(copy.memoryCapacity,128);assert.equal(copy.keepOutMargin,2);assert.equal(copy.keepOutOpposite,true);
  assert.equal(P.update(cpu.id,{cpuCores:1.5}),false);assert.equal(P.update(ddr.id,{memoryCapacity:-1}),false);
  const saved=JSON.stringify(P.state);assert.equal(P.importProjectText(saved),true);assert.equal(JSON.stringify(P.state),saved);
  const old=JSON.parse(saved);for(const c of old.components)for(const k of Object.keys(P.componentExtraDefaults))delete c[k];assert.equal(P.importProjectText(JSON.stringify(old)),true);assert.equal(P.component(cpu.id).keepOutSame,false);assert.equal(P.component(cpu.id).cpuCores,null);
  E.clean();
});
test('Keep Out rejection is atomic for board resize, IC resize and per-IC face actions',()=>{
  const E=editor(),{P,d,input}=E;P.clearCanvas();const a=P.addComponent('CPU',0,0,{keepOutSame:true,keepOutMargin:2}),b=P.addComponent('DDR');
  d.querySelector('[data-tab="placement"]').click();P.placement.place(a.id);P.placement.place(b.id);
  const p=P.state.placements.find(p=>p.componentId===a.id),q=P.state.placements.find(p=>p.componentId===b.id);assert.equal(P.placement.commit(q,{x:30,y:4}),true);
  const before=JSON.stringify(P.state.placements);input(d.querySelector('#board-width'),'24');d.querySelector('#apply-board').click();assert.equal(P.state.board.width,160);assert.equal(JSON.stringify(P.state.placements),before);assert.match(d.querySelector('#board-message').textContent,/Keep Out/);
  assert.equal(P.update(a.id,{icWidth:40}),false);assert.equal(a.icWidth,12);assert.equal(JSON.stringify(P.state.placements),before);
  assert.equal(P.update(a.id,{keepOutOpposite:true}),true);assert.equal(P.placement.commit(q,{side:'bottom',x:p.x+20,y:p.y}),true);
  assert.equal(P.placement.commit(q,{x:p.x,y:p.y}),false);assert.equal(q.x,p.x+20);
  E.clean();
});

test('Passive packages and Connector support custom specifications and small placement round trips',()=>{
  const E=editor(),{P,d,input,field}=E;P.clearCanvas();
  for(const type of ['R','L','C']){
    d.querySelector('.component-item[data-name="'+type+'"]').click();
    const c=P.component(P.ui.selected);assert.equal(c.type,type);
    assert.equal(c.icPackage,'0402');
    assert.deepEqual([...field('英制封裝').options].map(o=>o.value),['0201','0402','0603','0804','1005','TQFP','Custom']);
    for(const code of ['0201','0402','0603','0804','1005']){
      input(field('英制封裝'),code,'change');assert.equal(c.icPackage,code);
      assert.equal(c.icWidth,Number((Number(code.slice(0,2))*.254).toFixed(3)));
    }
    input(field('英制封裝'),'0201','change');
    input(field('元件值 / 規格'),'10 kΩ');
    P.state.placements.push({id:P.uuid(),componentId:c.id,x:1,y:1,width:c.icWidth,height:c.icHeight,rotation:0,side:'top'});
    assert.equal(P.importProjectText(JSON.stringify(P.state)),true);
    P.select(c.id);input(field('IC 長 (mm)'),0.7,'change');
    assert.equal(P.component(c.id).icPackage,'Custom');
    input(field('自訂封裝規格'),'特殊封裝');
    assert.equal(P.state.placements.find(p=>p.componentId===c.id).width,0.7);
  }
  const connector=P.addComponent('Connector');P.select(connector.id);
  assert.equal(connector.category,'Connector');assert.equal(connector.icPackage,'Custom');
  input(field('自訂封裝規格'),'2.54 mm header');
  assert.equal(P.importProjectText(JSON.stringify(P.state)),true);
  assert.equal(P.component(connector.id).packageSpec,'2.54 mm header');
  assert.equal(P.state.components[0].componentValue,'10 kΩ');
  assert.equal(P.state.components[0].packageSpec,'特殊封裝');
  E.clean();
});
