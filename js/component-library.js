(function () {
  'use strict';
  const groups = {
    Processor: ['CPU', 'SoC', 'MCU', 'FPGA'], Memory: ['DDR', 'eMMC', 'Flash', 'EEPROM'],
    Communication: ['Ethernet PHY', 'PCIe Switch', 'USB Hub', 'SerDes', 'MIPI Interface'],
    RF: ['SDR', 'RF Transceiver', 'PA', 'LNA', 'RF Switch', 'Balun', 'Filter', 'Duplexer', 'Antenna'],
    Clock: ['XO', 'TCXO', 'OCXO', 'PLL', 'Clock Generator'],
    Power: ['PMIC', 'Buck Converter', 'Boost Converter', 'LDO'],
    Passive: ['R', 'L', 'C'],
    Connector: ['Connector', 'USB Connector', 'Ethernet Connector', 'RF Connector'],
    GNSS: ['GNSS Receiver', 'GNSS Antenna'], Sensor: ['IMU', 'Temperature Sensor', 'Generic Sensor'],
    Other: ['Generic IC', 'Generic Block']
  };
  const colors = { Processor:'#7ea9f5',Memory:'#b09aea',Communication:'#75c2d6',RF:'#69d5ba',Clock:'#e6c57d',Power:'#e99a76',Interface:'#9baac5',Connector:'#9baac5',Passive:'#dbc384',GNSS:'#a2ca7c',Sensor:'#d493bf',Other:'#99aabb' };
  const icons = { Processor:'▣',Memory:'▤',Communication:'⇄',RF:'⌁',Clock:'◷',Power:'ϟ',Interface:'⇥',Connector:'⇥',Passive:'Ω',GNSS:'◎',Sensor:'◇',Other:'□' };
  window.Planner = { library: Object.entries(groups).flatMap(([category,names]) => names.map(name => ({name,category}))), groups, colors, icons };
  const P=window.Planner;
  // Imperial codes encode nominal dimensions in hundredths of an inch.
  P.imperialPackages=Object.fromEntries(['0201','0402','0603','0804','1005'].map(code=>[code,{icWidth:Number((Number(code.slice(0,2))*.254).toFixed(3)),icHeight:Number((Number(code.slice(2))*.254).toFixed(3))}]));
  P.isPassive=c=>['R','L','C'].includes(c.type);
  P.packageChoices=c=>P.isPassive(c)?[...Object.keys(P.imperialPackages).sort(),'TQFP','Custom']:c.category==='Connector'?['Custom','QFN','BGA','SOT','TQFP']:['QFN','BGA','SOT','TQFP','Custom'];
  P.validPackage=c=>['QFN','BGA','SOT','TQFP','Custom',...Object.keys(P.imperialPackages)].includes(c.icPackage)&&typeof (c.packageSpec??'')==='string'&&(c.packageSpec??'').length<=120;
})();
