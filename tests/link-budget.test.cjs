const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){const ctx={window:{},crypto:require('node:crypto').webcrypto,TextEncoder};vm.createContext(ctx);for(const file of ['component-library','rf-model','placement-rules','state','link-budget','xlsx-export'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx);return ctx.window.Planner;}
const end=c=>({componentId:c.id,portId:null,anchor:'right'});
const link=(P,a,b,options={})=>P.addConnection(end(a),end(b),{interfaceType:'RF',...options});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Tx maximum respects DA power, PA output P1dB and downstream max-input caps',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver',0,0,{txPower:5}),pa=P.addComponent('PA',0,0,{rfGain:25,p1db:27}),filter=P.addComponent('Filter',0,0,{rfLoss:2,maxInput:23}),ant=P.addComponent('Antenna');
  link(P,trx,pa,{loss:1});link(P,pa,filter,{loss:1});link(P,filter,ant,{loss:1});
  const r=P.linkBudget.evaluate().find(r=>r.kind==='tx');assert.equal(r.valid,true);near(r.value,20);near(r.drive,0);assert.match(r.limiter,/Filter/);
  P.update(filter.id,{maxInput:40});const p1=P.linkBudget.evaluate().find(r=>r.kind==='tx');near(p1.value,23);assert.match(p1.limiter,/PA/);
  P.update(trx.id,{txPower:-10});near(P.linkBudget.evaluate()[0].value,10);
});
test('Rx cascade uses Friis including cable loss and terminal TRX LNA; BW and SNR scale sensitivity',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver',0,0,{rxGain:10,rxNf:5}),lna=P.addComponent('LNA',0,0,{rfGain:20,rfNf:2}),filter=P.addComponent('Filter',0,0,{rfLoss:3,maxInput:10}),ant=P.addComponent('Antenna');
  link(P,ant,filter,{loss:1});link(P,filter,lna,{loss:0});link(P,lna,trx,{loss:1});
  const rows=P.linkBudget.evaluate(),r=rows.find(r=>r.kind==='rx');assert.equal(r.valid,true);
  const lin=x=>10**(x/10);let gain=1,F=1;
  for(const [g,nf] of [[-1,1],[-3,3],[0,0],[20,2],[-1,1],[10,5]]){F+=(lin(nf)-1)/gain;gain*=lin(g);}
  const expected=10*Math.log10(F);near(r.nf,expected);near(r.gain,25);near(r.value,-174+10*Math.log10(20e6)+expected+10);
  const x=P.linkBudget.evaluate({bandwidthMHz:200,snrDb:13}).find(r=>r.kind==='rx');near(x.value-r.value,13);
  assert.match(r.path,/Antenna → Filter → LNA → RF Transceiver/);
});
test('Four channels follow explicit RF lanes; non-RF edges and free drawings do not participate',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver',0,0,{txChannels:4,rxChannels:4,txPower:0,rxGain:10,rxNf:3});
  for(let ch=1;ch<=4;ch++){const ant=P.addComponent('Antenna');link(P,trx,ant,{rfMode:'both',txChannel:ch,rxChannel:ch,loss:ch});}
  P.addConnection(end(trx),end(P.addComponent('CPU')),{interfaceType:'Digital'});
  const rows=P.linkBudget.evaluate();assert.equal(rows.length,8);
  for(const row of rows){assert.equal(row.valid,true);if(row.kind==='tx')near(row.value,-row.channel);else near(row.nf,3+row.channel);}
  assert.equal(P.update(trx.id,{txChannels:5}),false);assert.equal(P.update(trx.id,{rxChannels:1.5}),false);assert.equal(P.update(trx.id,{txChannels:0}),false);
});
test('Incomplete routes, missing values, cycles, unsupported stages and ambiguous branches are explicit',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver'),pa=P.addComponent('PA'),ant=P.addComponent('Antenna');
  const e=link(P,trx,pa);link(P,pa,ant);
  let r=P.linkBudget.evaluate()[0];assert.equal(r.valid,false);assert.equal(r.value,null);assert.ok(r.warnings.some(w=>w.includes('txPower')));
  P.update(trx.id,{txPower:0});P.update(pa.id,{rfGain:20,p1db:30});
  link(P,pa,P.addComponent('Antenna'));r=P.linkBudget.evaluate()[0];assert.equal(r.valid,true);assert.ok(r.warnings.some(w=>w.includes('分支')));
  const b=P.addComponent('RF Switch',0,0,{rfLoss:1,maxInput:20});link(P,pa,b);link(P,b,pa);assert.ok(P.linkBudget.evaluate().some(r=>r.warnings.some(w=>w.includes('迴路'))));
  P.updateConnection(e.id,{txChannel:2});assert.equal(P.linkBudget.evaluate()[0].value,null);
  assert.equal(P.updateConnection(e.id,{loss:-1}),false);assert.equal(P.updateConnection(e.id,{rxChannel:5}),false);
  assert.equal(P.update(pa.id,{p1db:Infinity}),false);assert.equal(P.update(pa.id,{rfGain:null}),true);
});
test('Excel writer produces a valid ZIP with numeric cells and escaped literal strings',()=>{
  const P=setup(),bytes=P.xlsx.build([{name:'Summary',rows:[['Name','Result'],['=HYPERLINK("bad")',-83.25],['<RF & PA>',null]]}]);
  const data=Buffer.from(bytes);assert.equal(data.readUInt32LE(0),0x04034b50);const entries=new Map();let offset=0;
  while(data.readUInt32LE(offset)===0x04034b50){const n=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28),length=data.readUInt32LE(offset+18),name=data.subarray(offset+30,offset+30+n).toString();const start=offset+30+n+extra;entries.set(name,data.subarray(start,start+length).toString());offset=start+length;}
  assert.equal(entries.size,6);const xml=entries.get('xl/worksheets/sheet1.xml');assert.match(xml,/<v>-83.25<\/v>/);assert.match(xml,/&lt;RF &amp; PA&gt;/);assert.match(xml,/=HYPERLINK\(&quot;bad&quot;\)/);assert.doesNotMatch(xml,/<f>/);
  const {spawnSync}=require('node:child_process');const check=spawnSync('python3',['-c','import sys,zipfile,io,xml.etree.ElementTree as E; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; [E.fromstring(z.read(n)) for n in z.namelist()]; print("valid")'],{input:data});assert.equal(check.status,0,check.stderr.toString());
});
test('TRX ports track channel counts and preserve connected ports; switch ports have individual budgets',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver',0,0,{txPower:10,txChannels:2,rxChannels:3,rxGain:10,rxNf:2}),sw=P.addComponent('RF Switch'),ant=P.addComponent('Antenna');
  const ports=P.componentPorts(trx.id);assert.equal(ports.filter(p=>p.type==='RF').length,5);
  const tx2=ports.find(p=>p.rfKey==='tx:2'),rx3=ports.find(p=>p.rfKey==='rx:3'),sp=[P.componentPorts(sw.id).find(p=>p.rfKey==='rf:1'),P.componentPorts(sw.id).find(p=>p.rfKey==='rfc')];
  P.updatePort(sp[0].id,{loss:1,maxLevel:5});P.updatePort(sp[1].id,{loss:2,maxLevel:20});
  const ep=(c,p)=>({...end(c),portId:p.id});const edge=link(P,trx,sw);
  P.removeConnection(edge.id);const e=P.addConnection(ep(trx,tx2),ep(sw,sp[0]));P.addConnection(ep(sw,sp[1]),end(ant));
  assert.equal(e.txChannel,2);assert.equal(P.linkBudget.evaluate().find(r=>r.kind==='tx'&&r.channel===2).value,2);
  assert.equal(P.update(trx.id,{txChannels:1}),false);assert.ok(P.port(tx2.id));assert.ok(P.connection(e.id));
  assert.equal(P.update(sw.id,{rfPortCount:4}),true);assert.equal(P.componentPorts(sw.id).filter(p=>p.type==='RF').length,5);assert.equal(P.port(sp[0].id).loss,1);
  const extra=P.componentPorts(sw.id).find(p=>p.rfKey==='rf:4'),other=P.addComponent('Antenna');const linked=P.addConnection(ep(sw,extra),end(other));assert.ok(linked);assert.equal(P.update(sw.id,{rfPortCount:2}),false);
  P.removeConnection(linked.id);assert.equal(P.update(sw.id,{rfPortCount:2}),true);assert.equal(P.componentPorts(sw.id).length,3);
  assert.equal(P.updatePort(sp[0].id,{loss:-1}),false);assert.equal(P.updatePort(sp[0].id,{maxLevel:101}),false);
  P.removePort(tx2.id);assert.ok(P.port(tx2.id));
  P.removeConnection(e.id);assert.equal(P.update(trx.id,{txChannels:1,rxChannels:4}),true);assert.equal(P.port(tx2.id),undefined);assert.equal(P.port(rx3.id).rfKey,'rx:3');
});
test('Balun converts differential Tx/Rx to single-ended with insertion loss and mismatch detection',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver',0,0,{txPower:10,rxGain:10,rxNf:3}),balun=P.addComponent('Balun',0,0,{rfLoss:2,maxInput:20}),ant=P.addComponent('Antenna');
  const tx=P.componentPorts(trx.id).find(p=>p.rfKey==='tx:1'),rx=P.componentPorts(trx.id).find(p=>p.rfKey==='rx:1'),balanced=P.componentPorts(balun.id).find(p=>p.rfKey==='balanced'),single=P.componentPorts(balun.id).find(p=>p.rfKey==='unbalanced');
  assert.equal(balanced.signalMode,'differential');assert.equal(single.signalMode,'single');
  P.updatePort(tx.id,{signalMode:'differential'});P.updatePort(rx.id,{signalMode:'differential'});
  const ep=(c,p)=>({...end(c),portId:p.id});
  const a=P.addConnection(ep(trx,tx),ep(balun,balanced));P.addConnection(ep(balun,single),end(ant));
  assert.equal(P.linkBudget.evaluate().find(r=>r.kind==='tx').valid,false);
  const minus=P.addConnection({...ep(trx,tx),polarity:'-'},{...ep(balun,balanced),polarity:'-'});assert.ok(minus);
  const txResult=P.linkBudget.evaluate().find(r=>r.kind==='tx');assert.equal(txResult.valid,true);near(txResult.value,8);assert.equal(P.rfDifferential(a),false);assert.equal(P.linkBudget.evaluate().filter(r=>r.kind==='tx').length,1);
  P.updateConnection(minus.id,{loss:1});assert.equal(P.linkBudget.evaluate().find(r=>r.kind==='tx').valid,false);P.updateConnection(minus.id,{loss:0});
  assert.equal(P.updatePort(tx.id,{signalMode:'single'}),false);P.removeConnection(minus.id);P.updatePort(tx.id,{signalMode:'single'});const mismatch=P.linkBudget.evaluate().find(r=>r.kind==='tx');assert.equal(mismatch.valid,false);assert.ok(mismatch.warnings.some(w=>w.includes('不匹配')));
  P.removeConnection(a.id);
  for(const e of [...P.state.connections])P.removeConnection(e.id);
  P.addConnection(end(ant),ep(balun,single));P.addConnection(ep(balun,balanced),ep(trx,rx));P.addConnection({...ep(balun,balanced),polarity:'-'},{...ep(trx,rx),polarity:'-'});
  const r=P.linkBudget.evaluate().find(r=>r.kind==='rx');assert.equal(r.valid,true);near(r.nf,5);near(r.gain,8);
  assert.equal(P.updatePort(rx.id,{signalMode:'invalid'}),false);assert.equal(P.updatePort(balanced.id,{signalMode:'single'}),false);
});
