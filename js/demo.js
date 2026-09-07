(function(P){
  'use strict';
  const demo=[['CPU',60,160,'NXP','i.MX 8M Plus'],['DDR',60,360,'Micron','DDR4 memory'],['FPGA',60,580,'AMD','Artix-7'],['SDR',330,160,'','SDR baseband'],['RF Transceiver',600,160,'Analog Devices','ADRV9002'],['PA',870,160,'','RF power amplifier'],['Antenna',1140,160,'','3.5 GHz antenna'],['Clock Generator',330,360,'Skyworks','Si5341'],['LNA',600,360,'','Low-noise amplifier'],['RF Switch',870,360,'','RF front end'],['Filter',1140,360,'','RF band-pass filter'],['PMIC',330,580,'','Power management'],['Ethernet PHY',600,580,'TI','DP83867'],['GNSS Receiver',870,580,'u-blox','ZED-F9P'],['GNSS Antenna',1140,580,'','Active GNSS antenna']];
  const blocks={};demo.forEach(([name,x,y,vendor,partNumber])=>blocks[name]=P.addComponent(name,x,y,{vendor,partNumber}));
  function endpoint(name,anchor,portId=null){return{componentId:blocks[name].id,portId,anchor};}
  function link(a,b,sideA,sideB,type,label){P.addConnection(endpoint(a,sideA),endpoint(b,sideB),{interfaceType:type,label});}
  link('CPU','DDR','bottom','top','Digital','DDR4');
  link('CPU','FPGA','left','left','SerDes','SerDes');
  link('CPU','Ethernet PHY','bottom','top','Ethernet','Ethernet');
  const cpuPcie=P.addPort(blocks.CPU.id,{name:'PCIe_TXRX',type:'PCIe',side:'right',maxConnections:1});
  const sdrPcie=P.addPort(blocks.SDR.id,{name:'PCIe',type:'PCIe',side:'left',maxConnections:1});
  P.addConnection(endpoint('CPU','right',cpuPcie.id),endpoint('SDR','left',sdrPcie.id),{label:'PCIe Gen4 x4'});
  link('SDR','RF Transceiver','right','left','Digital','IQ / Digital');
  // Separate right-side SDR pins connect to matching left-side TRX pins.
  // Each signal is an independent edge, not multiple labels on one wire.
  for(const [name,type] of [['SPI Control','SPI'],['REF Clock','Clock'],['GPIO Sync','GPIO']]){
    const source=P.addPort(blocks.SDR.id,{name,type,side:'right',direction:'output',maxConnections:1});
    const target=P.addPort(blocks['RF Transceiver'].id,{name,type,side:'left',direction:'input',maxConnections:1});
    P.addConnection(endpoint('SDR','right',source.id),endpoint('RF Transceiver','left',target.id),{interfaceType:type,label:name});
  }
  const rfOut=P.addPort(blocks['RF Transceiver'].id,{name:'RF_OUT',type:'RF',side:'right',direction:'output',maxConnections:1});
  const rfIn=P.addPort(blocks.PA.id,{name:'RF_IN',type:'RF',side:'left',direction:'input',maxConnections:1});
  P.addConnection(endpoint('RF Transceiver','right',rfOut.id),endpoint('PA','left',rfIn.id),{label:'RF 3.5 GHz'});
  link('PA','RF Switch','bottom','top','RF','RF');link('RF Switch','Filter','right','left','RF','RF');link('Filter','Antenna','top','bottom','RF','RF');
  link('GNSS Antenna','GNSS Receiver','left','right','RF','GNSS');
  const clock=P.addPort(blocks['Clock Generator'].id,{name:'CLK_OUT',type:'Clock',side:'top',direction:'output',maxConnections:null});
  for(const target of ['FPGA','SDR','RF Transceiver'])P.addConnection(endpoint('Clock Generator','top',clock.id),endpoint(target,'bottom'),{label:'REF CLK'});
  const power=P.addPort(blocks.PMIC.id,{name:'POWER_OUT',type:'Power',side:'top',direction:'output',maxConnections:null});
  for(const target of ['CPU','SDR','RF Transceiver','GNSS Receiver'])P.addConnection(endpoint('PMIC','top',power.id),endpoint(target,'bottom'),{label:'Power'});
})(window.Planner);
