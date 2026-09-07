const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(demo=false){const context={window:{},crypto:require('node:crypto').webcrypto};vm.createContext(context);for(const file of ['component-library','state','geometry',...(demo?['demo']:[])])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context);return context.window.Planner;}
const end=(c,anchor='right',port=null)=>({componentId:c.id,portId:port?.id||null,anchor});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
test('Demo presents four distinct SDR-right to TRX-left signals within the inter-block gap',()=>{
  const P=setup(true),sdr=P.state.components.find(c=>c.type==='SDR'),trx=P.state.components.find(c=>c.type==='RF Transceiver');
  const edges=P.state.connections.filter(e=>e.source.componentId===sdr.id&&e.target.componentId===trx.id);
  assert.equal(edges.length,4);
  assert.equal(new Set(edges.map(e=>e.label)).size,4);
  const starts=edges.map(e=>P.geometry.route(e).points[0].y);assert.equal(new Set(starts).size,4);
  for(const edge of edges){
    assert.equal(edge.source.anchor,'right');assert.equal(edge.target.anchor,'left');
    const route=P.geometry.route(edge);
    for(const p of route.points){assert.ok(p.x>=sdr.x+sdr.width&&p.x<=trx.x);near(p.y,route.points[0].y);}
  }
  P.update(sdr.id,{height:320});P.update(trx.id,{y:200,height:280});
  for(const edge of edges){const route=P.geometry.route(edge);near(route.points[0].x,sdr.x+sdr.width);near(route.points.at(-1).x,trx.x);assert.ok(route.points.every(p=>p.x>=sdr.x+sdr.width&&p.x<=trx.x));}
});
test('Repeated links between the same two blocks have separate routes, including shared ports and reverse direction',()=>{
  for(const style of ['orthogonal','straight'])for(const engineering of [false,true]){
    const P=setup(),a=P.addComponent('SDR',100,100),b=P.addComponent('RF Transceiver',500,100);
    const pa=engineering?P.addPort(a.id,{side:'right'}):null,pb=engineering?P.addPort(b.id,{side:'left'}):null;
    const source=end(a,'right',pa),target=end(b,'left',pb);
    const edges=[P.addConnection(source,target,{routingStyle:style}),P.addConnection(source,target,{routingStyle:style}),P.addConnection(target,source,{routingStyle:style})];
    function verify(){
      const routes=edges.filter(e=>P.connection(e.id)).map(e=>P.geometry.route(e));
      assert.equal(new Set(routes.map(r=>r.d)).size,routes.length);
      assert.equal(new Set(routes.map(r=>`${r.label.x},${r.label.y}`)).size,routes.length);
      edges.filter(e=>P.connection(e.id)).forEach(e=>{const route=P.geometry.route(e),start=P.geometry.anchor(e.source,e.id),finish=P.geometry.anchor(e.target,e.id);near(route.points[0].x,start.x);near(route.points[0].y,start.y);near(route.points.at(-1).x,finish.x);near(route.points.at(-1).y,finish.y);});
    }
    verify();P.update(a.id,{x:160,width:280,height:200});verify();
    P.removeConnection(edges[1].id);assert.equal(P.state.connections.length,2);verify();
  }
});
test('Cases 1–4: CPU five-way fanout and clock shared-port fanout survive move and doubled size',()=>{
  const P=setup(),cpu=P.addComponent('CPU',100,100),targets=['DDR','FPGA','SDR','Ethernet PHY','USB Hub'].map((name,i)=>P.addComponent(name,600,50+i*140));
  const edges=targets.map(c=>P.addConnection(end(cpu),end(c,'left')));
  assert.equal(P.state.connections.length,5);
  assert.equal(new Set(edges.map(e=>P.geometry.anchor(e.source,e.id).y)).size,5);
  const before=edges.map(e=>P.geometry.route(e).points[0]);
  P.update(cpu.id,{x:140,y:180},'move');
  edges.forEach((edge,i)=>{const current=P.geometry.route(edge).points[0];near(current.x,before[i].x+40);near(current.y,before[i].y+80);});
  P.update(cpu.id,{width:400},'resize');
  edges.forEach(edge=>near(P.geometry.route(edge).points[0].x,540));
  assert.equal(cpu.name,'CPU');
  const clock=P.addComponent('Clock Generator'),port=P.addPort(clock.id,{type:'Clock',direction:'output',side:'right',maxConnections:null});
  for(const c of targets.slice(0,3))assert.ok(P.addConnection(end(clock,'right',port),end(c,'bottom')));
  assert.equal(P.portUsage(port.id),3);
  const clockEdges=P.state.connections.filter(e=>e.source.componentId===clock.id);
  const pin=P.geometry.anchor(clockEdges[0].source);
  clockEdges.forEach(e=>{near(P.geometry.route(e).points[0].x,pin.x);near(P.geometry.route(e).points[0].y,pin.y);});
});
test('Cases 5–6: deleting a single edge preserves peers; deleting node removes all references',()=>{
  const P=setup(true),cpu=P.state.components.find(c=>c.type==='CPU');
  const all=P.state.connections.map(e=>e.id),edge=P.state.connections.find(e=>e.source.componentId===cpu.id);
  P.select(edge.id,'connection');P.removeSelected();assert.equal(P.state.connections.length,all.length-1);
  assert.ok(all.filter(id=>id!==edge.id).every(id=>P.connection(id)));
  const unrelated=P.state.connections.filter(e=>e.source.componentId!==cpu.id&&e.target.componentId!==cpu.id).map(e=>e.id);
  P.state.placements.push({componentId:cpu.id});P.select(cpu.id);P.removeSelected();
  assert.equal(P.component(cpu.id),undefined);assert.equal(P.componentPorts(cpu.id).length,0);
  assert.equal(P.state.placements.length,0);assert.equal(P.state.connections.length,unrelated.length);
  assert.ok(unrelated.every(id=>P.connection(id)));assert.equal(P.ui.selected,null);
});
test('Port capacity checks both directions, warns, supports null, and reports reduced limits',()=>{
  const P=setup(),a=P.addComponent('CPU'),b=P.addComponent('SDR'),c=P.addComponent('FPGA');
  const source=P.addPort(a.id,{type:'PCIe',maxConnections:1}),target=P.addPort(b.id,{type:'PCIe',side:'left',maxConnections:1});
  assert.ok(P.addConnection(end(a,'right',source),end(b,'left',target)));
  assert.equal(P.addConnection(end(a,'right',source),end(c)),null);
  assert.match(P.ui.warning,/limit/);assert.equal(P.state.connections.length,1);
  assert.equal(P.addConnection(end(c),end(b,'left',target)),null);
  P.updatePort(source.id,{maxConnections:null});assert.ok(P.addConnection(end(a,'right',source),end(c)));
  P.updatePort(source.id,{maxConnections:1});assert.match(P.ui.warning,/exceed/);assert.equal(P.portUsage(source.id),2);
  assert.equal(P.updatePort(source.id,{maxConnections:0}),false);
  P.removePort(source.id);assert.equal(P.state.connections.length,0);assert.ok(P.port(target.id));
});
test('Eight resize handles preserve the opposite edge, clamp minimum size, and handle rotation',()=>{
  const P=setup(),c=P.addComponent('CPU',100,100,{width:300,height:200});
  for(const rotation of [0,90,180,270])for(const handle of ['n','ne','e','se','s','sw','w','nw']){
    c.rotation=rotation;
    const fixed={x:handle.includes('w')?c.width:handle.includes('e')?0:c.width/2,y:handle.includes('n')?c.height:handle.includes('s')?0:c.height/2};
    const originalPoint=P.geometry.world(c,fixed);
    const resized={...c,...P.geometry.resize(c,handle,{x:70,y:50},false,P.minimumSize(c.id))};
    const newFixed={x:handle.includes('w')?resized.width:handle.includes('e')?0:resized.width/2,y:handle.includes('n')?resized.height:handle.includes('s')?0:resized.height/2};
    const fixedPoint=P.geometry.world(resized,newFixed);near(fixedPoint.x,originalPoint.x);near(fixedPoint.y,originalPoint.y);
    assert.ok(resized.width>=180&&resized.height>=112);
  }
  const tiny=P.geometry.resize({...c,rotation:0},'nw',{x:9999,y:9999},false,P.minimumSize(c.id));assert.equal(tiny.width,180);assert.equal(tiny.height,112);
  P.update(c.id,{width:1,height:1});assert.equal(c.width,180);assert.equal(c.height,112);
  assert.equal(P.update(c.id,{width:NaN}),false);
});
test('Ports distribute along resized boundary and follow side changes and rotation',()=>{
  const P=setup(),c=P.addComponent('CPU',100,100),target=P.addComponent('SDR',700,200);
  const ports=['PCIe','USB','SPI','Ethernet'].map(type=>P.addPort(c.id,{type,side:'right'}));
  const endpoints=ports.map(port=>end(c,'right',port));
  P.update(c.id,{width:400,height:300});
  const coordinates=endpoints.map(e=>P.geometry.anchor(e));
  coordinates.forEach((point,i)=>{near(point.x,500);if(i)near(point.y-coordinates[i-1].y,50);});
  const edge=P.addConnection(endpoints[0],end(target,'left'));
  P.updatePort(ports[0].id,{side:'top'});assert.equal(edge.source.anchor,'top');near(P.geometry.anchor(edge.source).y,100);
  P.update(c.id,{rotation:90});const local=P.geometry.anchorLocal(edge.source),world=P.geometry.world(c,local),anchor=P.geometry.anchor(edge.source);near(world.x,anchor.x);near(world.y,anchor.y);
});
test('Both routing styles, all side pairs and rotations have valid attached endpoints',()=>{
  const P=setup(),a=P.addComponent('CPU',100,100),b=P.addComponent('SDR',650,440);
  for(const rotation of [0,90,180,270])for(const sideA of P.sides)for(const sideB of P.sides){
    P.update(a.id,{rotation});const edge=P.addConnection(end(a,sideA),end(b,sideB));
    const route=P.geometry.route(edge),start=P.geometry.anchor(edge.source,edge.id),finish=P.geometry.anchor(edge.target,edge.id);
    near(route.points[0].x,start.x);near(route.points.at(-1).y,finish.y);
    route.points.slice(1).forEach((p,i)=>assert.ok(Math.abs(p.x-route.points[i].x)<1e-7||Math.abs(p.y-route.points[i].y)<1e-7));
    P.updateConnection(edge.id,{routingStyle:'straight',label:'New label',interfaceType:'SPI',description:'Test'});
    assert.equal(P.geometry.route(edge).points.length,2);assert.equal(edge.label,'New label');
    P.removeConnection(edge.id);
  }
});
test('Demo is an independently serialized graph, with CPU five neighbors and clock three targets',()=>{
  const P=setup(true),cpu=P.state.components.find(c=>c.type==='CPU'),clock=P.state.components.find(c=>c.type==='Clock Generator');
  const edges=P.state.connections.filter(e=>e.source.componentId===cpu.id||e.target.componentId===cpu.id);
  assert.ok(new Set(edges.map(e=>e.source.componentId===cpu.id?e.target.componentId:e.source.componentId)).size>=5);
  assert.equal(P.state.connections.filter(e=>e.source.componentId===clock.id).length,3);
  const saved=JSON.parse(JSON.stringify(P.state));
  assert.equal(saved.connections.length,20);assert.equal(saved.components.length,15);
  for(const e of saved.connections){assert.ok(e.id);assert.ok(e.source.componentId);assert.ok(e.target.componentId);assert.ok(!('x1' in e));}
  assert.ok(saved.connections.some(e=>e.source.portId===null));assert.ok(saved.connections.some(e=>e.source.portId));
  const ids=[...saved.components,...saved.ports,...saved.connections].map(o=>o.id);assert.equal(new Set(ids).size,ids.length);
  const snapshot=JSON.stringify(P.state);P.ui.tab='placement';P.ui.tab='checks';P.ui.tab='architecture';assert.equal(JSON.stringify(P.state),snapshot);
  assert.equal(P.addConnection({componentId:'missing',anchor:'top'},end(cpu)),null);
});

