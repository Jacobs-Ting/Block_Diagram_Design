const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
function editor(){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),{runScripts:'outside-only',virtualConsole,url:'http://localhost/'});
  const w=dom.window,d=w.document;w.addEventListener('error',e=>errors.push(e.error));
  w.ResizeObserver=class{observe(){} disconnect(){}};
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
  assert.equal(d.querySelectorAll('.component-item').length,40);
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
  d.querySelector('[data-tab="placement"]').click();assert.equal(P.connectionUI.isPending(),false);assert.equal(d.querySelectorAll('.inventory-card').length,initial+1);
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
  d.querySelector('[data-tab="placement"]').click();assert.equal(d.querySelectorAll('.inventory-card').length,0);
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
  assert.equal(P.state.components.length,4);assert.equal(P.state.ports.length,4);assert.equal(P.state.connections.length,2);assert.equal(P.state.lines.length,2);
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


