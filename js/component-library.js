(function () {
  'use strict';
  const groups = {
    Processor: ['CPU', 'SoC', 'MCU', 'FPGA'], Memory: ['DDR', 'eMMC', 'Flash', 'EEPROM'],
    Communication: ['Ethernet PHY', 'PCIe Switch', 'USB Hub', 'SerDes', 'MIPI Interface'],
    RF: ['SDR', 'RF Transceiver', 'PA', 'LNA', 'RF Switch', 'Balun', 'Filter', 'Duplexer', 'Antenna'],
    Clock: ['XO', 'TCXO', 'OCXO', 'PLL', 'Clock Generator'],
    Power: ['PMIC', 'Buck Converter', 'Boost Converter', 'LDO'],
    Passive: ['R', 'L', 'C'],
    Connector: ['Connector', 'USB Connector', 'Ethernet Connector', 'RF Connector', 'SMA Edge Mount', 'IPEX'],
    GNSS: ['GNSS Receiver', 'GNSS Antenna'], Sensor: ['IMU', 'Temperature Sensor', 'Generic Sensor'],
    Mechanical: ['Screw Hole'],
    Other: ['Generic IC', 'Generic Block']
  };
  const colors = { Processor:'#7ea9f5',Memory:'#b09aea',Communication:'#75c2d6',RF:'#69d5ba',Clock:'#e6c57d',Power:'#e99a76',Interface:'#9baac5',Connector:'#9baac5',Passive:'#dbc384',GNSS:'#a2ca7c',Sensor:'#d493bf',Mechanical:'#b8c4d2',Other:'#99aabb' };
  const icons = { Processor:'▣',Memory:'▤',Communication:'⇄',RF:'⌁',Clock:'◷',Power:'ϟ',Interface:'⇥',Connector:'⇥',Passive:'Ω',GNSS:'◎',Sensor:'◇',Mechanical:'⊚',Other:'□' };
  window.Planner = { library: Object.entries(groups).flatMap(([category,names]) => names.map(name => ({name,category}))), groups, colors, icons };
  const P=window.Planner;
  // Imperial codes encode nominal dimensions in hundredths of an inch.
  P.imperialPackages=Object.fromEntries(['0201','0402','0603','0804','1005'].map(code=>[code,{icWidth:Number((Number(code.slice(0,2))*.254).toFixed(3)),icHeight:Number((Number(code.slice(2))*.254).toFixed(3))}]));
  P.isPassive=c=>['R','L','C'].includes(c.type);
  // Mechanical screw (mounting) hole: a round through-hole footprint. ISO 273 fine-series clearance drill,
  // pad / keep-out ring sized for the screw head, and default head height above the board.
  P.isScrewHole=c=>c?.type==='Screw Hole';
  // RF connectors with planning footprints (Custom package; adjust to the chosen part's datasheet).
  P.isEdgeMount=c=>c?.type==='SMA Edge Mount';
  P.typeDefaults={'SMA Edge Mount':{name:'SMA 側插接頭',icPackage:'Custom',packageSpec:'側插 SMA（End-launch / Edge-mount）',icWidth:6.35,icHeight:4.5,icThickness:2.4,keepOutOpposite:true},
    IPEX:{name:'IPEX 接頭',icPackage:'Custom',packageSpec:'IPEX MHF I（U.FL 相容）',icWidth:3,icHeight:2.6,icThickness:1.25}};
  P.libraryLabels={'Screw Hole':'螺絲鎖孔 (Screw Hole)','SMA Edge Mount':'側插 SMA 接頭 (Edge-mount)',IPEX:'IPEX 接頭 (MHF / U.FL)'};
  P.librarySearch={'RF Transceiver':'TRX Tx Rx','Screw Hole':'螺絲鎖孔 螺絲 鎖孔 mounting hole 機構','SMA Edge Mount':'側插 SMA 接頭 end launch edge mount RF connector 射頻','IPEX':'IPEX I-PEX MHF U.FL UFL 接頭 RF connector 射頻'};
  P.screwSizes={M2:{holeDiameter:2.2,padDiameter:4.5,icThickness:2},'M2.5':{holeDiameter:2.7,padDiameter:5.2,icThickness:2.5},M3:{holeDiameter:3.2,padDiameter:6,icThickness:3},M4:{holeDiameter:4.3,padDiameter:8,icThickness:4}};
  P.screwHoleDefaults=(size='M3')=>{const s=P.screwSizes[size]||P.screwSizes.M3;return {name:'螺絲鎖孔',shape:'circle',width:160,height:120,minWidth:120,minHeight:100,icPackage:'Hole',screwSize:size,holeDiameter:s.holeDiameter,padDiameter:s.padDiameter,plated:true,icWidth:s.padDiameter,icHeight:s.padDiameter,icThickness:s.icThickness,keepOutOpposite:true};};
  P.validScrewHole=c=>c.icPackage==='Hole'&&[...Object.keys(P.screwSizes),'Custom'].includes(c.screwSize)&&typeof c.plated==='boolean'&&c.keepOutOpposite===true
    &&Number.isFinite(c.holeDiameter)&&c.holeDiameter>0&&c.holeDiameter<=100&&Number.isFinite(c.padDiameter)&&c.padDiameter>c.holeDiameter&&c.padDiameter<=200
    &&Math.abs(c.icWidth-c.padDiameter)<1e-9&&Math.abs(c.icHeight-c.padDiameter)<1e-9;
  P.packageLabel=c=>P.isScrewHole(c)?`${c.screwSize==='Custom'?'自訂':c.screwSize} ${c.plated?'PTH':'NPTH'} Ø${c.holeDiameter}`:c.icPackage==='Custom'?(c.packageSpec||'自訂'):c.icPackage+(['SOT','TQFP'].includes(c.icPackage)?' '+c.icPinCount+' PIN':'');
  P.packageChoices=c=>P.isScrewHole(c)?['Hole']:P.isPassive(c)?[...Object.keys(P.imperialPackages).sort(),'TQFP','Custom']:c.category==='Connector'?['Custom','QFN','BGA','SOT','TQFP']:['QFN','BGA','SOT','TQFP','Custom'];
  P.validPackage=c=>(c.icPackage!=='Hole'||P.isScrewHole(c))&&['QFN','BGA','SOT','TQFP','Custom','Hole',...Object.keys(P.imperialPackages)].includes(c.icPackage)&&typeof (c.packageSpec??'')==='string'&&(c.packageSpec??'').length<=120;
})();
