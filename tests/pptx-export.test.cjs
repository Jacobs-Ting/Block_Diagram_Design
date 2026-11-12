const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
function setup(){const ctx={window:{},crypto:require('node:crypto').webcrypto,TextEncoder};vm.createContext(ctx);for(const file of ['component-library','rf-model','placement-rules','state','link-budget','pptx-export'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx);return ctx.window.Planner;}
// Minimal reader for the stored (uncompressed) ZIP produced by the exporter.
function entries(bytes){const b=Buffer.from(bytes),out={};let at=0;while(b.readUInt32LE(at)===0x04034b50){const size=b.readUInt32LE(at+18),n=b.readUInt16LE(at+26),name=b.slice(at+30,at+30+n).toString('utf8'),data=b.slice(at+30+n,at+30+n+size);out[name]=data;at+=30+n+size;}return out;}
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64'));
test('PPTX report contains architecture, placement Top/Bottom and link budget slides',()=>{
  const P=setup(),trx=P.addComponent('RF Transceiver',0,0,{txPower:5,rxGain:10,rxNf:5}),pa=P.addComponent('PA',0,0,{rfGain:20,p1db:27}),ant=P.addComponent('Antenna');
  P.addConnection({componentId:trx.id,portId:null,anchor:'right'},{componentId:pa.id,portId:null,anchor:'left'},{interfaceType:'RF',rfMode:'tx',loss:1});
  P.addConnection({componentId:pa.id,portId:null,anchor:'right'},{componentId:ant.id,portId:null,anchor:'left'},{interfaceType:'RF',rfMode:'tx',loss:1});
  P.state.placements.push({id:P.uuid(),componentId:trx.id,x:2,y:2,width:12,height:12,rotation:0,side:'top'},{id:P.uuid(),componentId:pa.id,x:30,y:2,width:12,height:12,rotation:0,side:'bottom'});
  const img={data:png,width:1,height:1},slides=P.pptx.reportSlides({architecture:img,top:img,bottom:img});
  const files=entries(P.pptx.build(slides,{title:'t'})),names=Object.keys(files);
  for(const part of ['[Content_Types].xml','ppt/presentation.xml','ppt/slideMasters/slideMaster1.xml','ppt/slideLayouts/slideLayout1.xml','ppt/theme/theme1.xml'])assert.ok(names.includes(part),part);
  const slideXml=names.filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/))).map(n=>files[n].toString('utf8'));
  assert.equal(slideXml.length,slides.length);
  assert.equal(names.filter(n=>n.startsWith('ppt/media/')).length,3);
  const all=slideXml.join('');
  for(const text of ['方塊架構圖','Top 上表面','Bottom 下表面','Tx 天線饋入端最大功率','逐級明細','23.00'])assert.ok(all.includes(text),text);
  assert.match(files['ppt/presentation.xml'].toString(),new RegExp(`<p:sldId id="${255+slides.length}"`));
  // CRC of every entry must match so PowerPoint accepts the package.
  const b=Buffer.from(P.pptx.zip([['a.txt','hello']]));assert.equal(b.readUInt32LE(14),zlib.crc32?zlib.crc32(Buffer.from('hello')):0x3610a686);
});
test('Long tables paginate under the height limit and keep the header row',()=>{
  const P=setup(),rows=[['A','B'],...Array.from({length:60},(_,i)=>['row '+i,'值 '.repeat(i%7+1)])];
  const pages=P.pptx.paginate(rows,[2,2],10,3);assert.ok(pages.length>1);
  for(const page of pages){assert.deepEqual(page.rows[0],['A','B']);assert.ok(page.heights.reduce((a,b)=>a+b,0)<=3+page.heights[1]);}
  assert.equal(pages.reduce((n,p)=>n+p.rows.length-1,0),60);
});
