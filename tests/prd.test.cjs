const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){const ctx={window:{},crypto:require('node:crypto').webcrypto,TextEncoder};vm.createContext(ctx);for(const file of ['component-library','rf-model','placement-rules','state','link-budget','prd'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx);return ctx.window.Planner;}
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const end=c=>({componentId:c.id,portId:null,anchor:'right'});
test('Free-space path loss and range are inverse of each other',()=>{
  const P=setup();near(P.prd.fsplDb(1,2400),100.0442,1e-3);near(P.prd.distanceKm(P.prd.fsplDb(3.7,5800),5800),3.7);
  const r=P.prd.linkRange({txPowerDbm:20,rxSensitivityDbm:-90,frequencyMHz:2400,txAntennaGainDbi:2,rxAntennaGainDbi:3,fadeMarginDb:10});
  near(r.eirp,22);near(r.mapl,115);near(r.usable,105);near(r.rangeKm,10**((105-32.44-20*Math.log10(2400))/20));
  assert.equal(P.prd.parseFrequencyMHz('','3.5 GHz antenna'),3500);assert.equal(P.prd.parseFrequencyMHz('915MHz'),915);assert.equal(P.prd.parseFrequencyMHz('n/a'),null);
});
test('PRD analysis collects CPU, DDR and storage specs and pairs Tx/Rx paths through the same antenna',()=>{
  const P=setup();
  const cpu=P.addComponent('CPU',0,0,{partNumber:'i.MX 8M',cpuCores:4,cpuClockMHz:1800}),ddr=P.addComponent('DDR',0,0,{memoryCapacity:16,memoryUnit:'Gb',partNumber:'MT53'}),emmc=P.addComponent('eMMC',0,0,{memoryCapacity:32,memoryUnit:'GB'}),flash=P.addComponent('Flash');
  P.addConnection(end(cpu),end(ddr),{interfaceType:'Digital'});
  const trx=P.addComponent('RF Transceiver',0,0,{txPower:5,rxGain:10,rxNf:5}),ant=P.addComponent('Antenna',0,0,{frequency:'2.4 GHz'});
  P.addConnection(end(trx),end(ant),{interfaceType:'RF',rfMode:'both',loss:1});
  const a=P.prd.analyze();
  assert.equal(a.processors[0].cores,4);assert.deepEqual([...a.processors[0].memory],['DDR']);
  near(a.totals.ddrGB,2);near(a.totals.storageGB,32);
  assert.ok(a.missing.some(m=>m.includes('Flash')&&m.includes('容量')));
  assert.equal(a.ranges.length,1);const r=a.ranges[0];assert.equal(r.rule,'同一天線');assert.equal(r.frequencyMHz,2400);
  const sens=-174+10*Math.log10(20e6)+r.rx.nf+10;near(r.rx.value,sens);near(r.mapl,4-sens);near(r.rangeKm,P.prd.distanceKm(4-sens-10,2400));
  P.state.linkBudget={...P.state.linkBudget,frequencyMHz:5800};P.state.prd={...P.state.prd,fadeMarginDb:0,txAntennaGainDbi:3,rxAntennaGainDbi:3};
  const b=P.prd.analyze().ranges[0];assert.equal(b.source,'手動');near(b.rangeKm,P.prd.distanceKm(4+6-sens,5800));
});
