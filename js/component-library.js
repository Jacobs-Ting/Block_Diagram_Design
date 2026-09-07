(function () {
  'use strict';
  const groups = {
    Processor: ['CPU', 'SoC', 'MCU', 'FPGA'], Memory: ['DDR', 'Flash', 'EEPROM'],
    Communication: ['Ethernet PHY', 'PCIe Switch', 'USB Hub', 'SerDes', 'MIPI Interface'],
    RF: ['SDR', 'RF Transceiver', 'PA', 'LNA', 'RF Switch', 'Filter', 'Duplexer', 'Antenna'],
    Clock: ['XO', 'TCXO', 'OCXO', 'PLL', 'Clock Generator'],
    Power: ['PMIC', 'Buck Converter', 'Boost Converter', 'LDO'],
    Interface: ['Connector', 'USB Connector', 'Ethernet Connector', 'RF Connector'],
    GNSS: ['GNSS Receiver', 'GNSS Antenna'], Sensor: ['IMU', 'Temperature Sensor', 'Generic Sensor'],
    Other: ['Generic IC', 'Generic Block']
  };
  const colors = { Processor:'#7ea9f5',Memory:'#b09aea',Communication:'#75c2d6',RF:'#69d5ba',Clock:'#e6c57d',Power:'#e99a76',Interface:'#9baac5',GNSS:'#a2ca7c',Sensor:'#d493bf',Other:'#99aabb' };
  const icons = { Processor:'▣',Memory:'▤',Communication:'⇄',RF:'⌁',Clock:'◷',Power:'ϟ',Interface:'⇥',GNSS:'◎',Sensor:'◇',Other:'□' };
  window.Planner = { library: Object.entries(groups).flatMap(([category,names]) => names.map(name => ({name,category}))), groups, colors, icons };
})();
