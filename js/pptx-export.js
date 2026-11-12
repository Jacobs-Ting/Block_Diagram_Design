(function(P){
  'use strict';
  // Dependency-free PresentationML (.pptx) writer plus the STRATUM report builder.
  // Slides contain: architecture block diagram, placement Top / Bottom and RF link budget results.
  const enc=new TextEncoder(),EMU=914400,SLIDE_W=13.333,SLIDE_H=7.5;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  const xml=s=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s;
  const emu=inches=>Math.round(inches*EMU);
  const NS_A='http://schemas.openxmlformats.org/drawingml/2006/main',NS_R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',NS_P='http://schemas.openxmlformats.org/presentationml/2006/main',NS_REL='http://schemas.openxmlformats.org/package/2006/relationships';
  const FONT_LATIN='Calibri',FONT_EA='Microsoft JhengHei';

  // ---------- ZIP (stored, UTF-8 names, binary safe) ----------
  const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(data){let c=0xffffffff;for(let i=0;i<data.length;i++)c=CRC[(c^data[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files){
    const chunks=[],central=[];let offset=0,centralSize=0;
    for(const [name,source] of files){
      const path=enc.encode(name),data=typeof source==='string'?enc.encode(source):source,crc=crc32(data);
      const h=new Uint8Array(30+path.length),v=new DataView(h.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);h.set(path,30);
      chunks.push(h,data);
      const c=new Uint8Array(46+path.length),w=new DataView(c.buffer);
      w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,path.length,true);w.setUint32(42,offset,true);c.set(path,46);
      central.push(c);offset+=h.length+data.length;centralSize+=c.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    const all=[...chunks,...central,end],out=new Uint8Array(all.reduce((s,b)=>s+b.length,0));let at=0;for(const b of all){out.set(b,at);at+=b.length;}return out;
  }

  // ---------- DrawingML helpers ----------
  function run(text,o={}){
    const size=Math.round((o.size||14)*100);
    return `<a:r><a:rPr lang="zh-TW" altLang="en-US" sz="${size}"${o.bold?' b="1"':''} dirty="0"><a:solidFill><a:srgbClr val="${o.color||'1F2933'}"/></a:solidFill><a:latin typeface="${o.mono?'Consolas':FONT_LATIN}"/><a:ea typeface="${FONT_EA}"/><a:cs typeface="${FONT_LATIN}"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;
  }
  // paragraphs: string (\n separated) or array of {text,size,bold,color} / arrays of runs
  function paragraphs(content,o={}){
    const list=Array.isArray(content)?content:String(content??'').split('\n');
    return list.map(item=>{
      const runs=Array.isArray(item)?item:[typeof item==='object'&&item!==null?item:{text:item}];
      const align=o.align&&o.align!=='l'?` algn="${o.align}"`:'';
      const body=runs.filter(r=>r.text!==undefined&&r.text!=='').map(r=>run(r.text,{...o,...r})).join('');
      return `<a:p><a:pPr${align}><a:spcBef><a:spcPts val="${o.spaceBefore||0}"/></a:spcBef></a:pPr>${body}<a:endParaRPr lang="zh-TW" sz="${Math.round((o.size||14)*100)}" dirty="0"/></a:p>`;
    }).join('');
  }
  const xfrm=(x,y,w,h)=>`<a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`;
  const fill=color=>color?`<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`:'<a:noFill/>';
  const line=(color,width=.75)=>color?`<a:ln w="${Math.round(width*12700)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>`:'<a:ln><a:noFill/></a:ln>';
  function shape(id,el){
    const inset=emu(el.inset??.08);
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(el.name||'Shape '+id)}"/><p:cNvSpPr${el.text!==undefined?' txBox="1"':''}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el.x,el.y,el.w,el.h)}<a:prstGeom prst="${el.geom||'rect'}"><a:avLst/></a:prstGeom>${fill(el.fill)}${line(el.line,el.lineWidth)}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${el.anchor||'t'}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${el.text!==undefined?paragraphs(el.text,el):'<a:p><a:endParaRPr lang="zh-TW" dirty="0"/></a:p>'}</p:txBody></p:sp>`;
  }
  function picture(id,el,rId){
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(el.name||'Picture '+id)}"${el.alt?` descr="${esc(el.alt)}"`:''}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(el.x,el.y,el.w,el.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${el.line?line(el.line,el.lineWidth):''}</p:spPr></p:pic>`;
  }
  function table(id,el){
    const cols=el.cols,total=cols.reduce((a,b)=>a+b,0),size=el.size||10,border=el.border||'D5DCE3';
    const edge=tag=>`<a:${tag} w="6350"><a:solidFill><a:srgbClr val="${border}"/></a:solidFill></a:${tag}>`;
    const rows=el.rows.map((row,r)=>{
      const header=r===0&&el.header!==false,h=el.heights?.[r]??.3;
      const cells=row.map((cell,c)=>{
        const spec=cell&&typeof cell==='object'&&!Array.isArray(cell)?cell:{text:cell};
        const color=header?'FFFFFF':spec.color||'1F2933',bg=header?(el.headerFill||'203D55'):spec.fill||(el.band&&r%2===0?'F3F6F9':'FFFFFF');
        const text=spec.text===null||spec.text===undefined?'':String(spec.text);
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(text,{size:spec.size||size,bold:header||spec.bold,color,align:spec.align||el.align?.[c],mono:spec.mono})}</a:txBody><a:tcPr marL="${emu(.06)}" marR="${emu(.06)}" marT="${emu(.035)}" marB="${emu(.035)}" anchor="${header?'ctr':'t'}">${edge('lnL')}${edge('lnR')}${edge('lnT')}${edge('lnB')}${fill(bg)}</a:tcPr></a:tc>`;
      }).join('');
      return `<a:tr h="${emu(h)}">${cells}</a:tr>`;
    }).join('');
    const height=el.rows.reduce((s,_,r)=>s+(el.heights?.[r]??.3),0);
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(el.name||'Table '+id)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(total)}" cy="${emu(height)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${cols.map(w=>`<a:gridCol w="${emu(w)}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }

  // ---------- Package parts ----------
  const theme=()=>xml(`<a:theme xmlns:a="${NS_A}" name="STRATUM"><a:themeElements><a:clrScheme name="STRATUM"><a:dk1><a:srgbClr val="1F2933"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="10161E"/></a:dk2><a:lt2><a:srgbClr val="F3F6F9"/></a:lt2><a:accent1><a:srgbClr val="2F9E8A"/></a:accent1><a:accent2><a:srgbClr val="203D55"/></a:accent2><a:accent3><a:srgbClr val="E5B96B"/></a:accent3><a:accent4><a:srgbClr val="EA828C"/></a:accent4><a:accent5><a:srgbClr val="6F8FB3"/></a:accent5><a:accent6><a:srgbClr val="9B7FD1"/></a:accent6><a:hlink><a:srgbClr val="2F9E8A"/></a:hlink><a:folHlink><a:srgbClr val="6F8FB3"/></a:folHlink></a:clrScheme><a:fontScheme name="STRATUM"><a:majorFont><a:latin typeface="${FONT_LATIN}"/><a:ea typeface="${FONT_EA}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT_LATIN}"/><a:ea typeface="${FONT_EA}"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="STRATUM"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`);
  const emptyTree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const master=()=>xml(`<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  const layout=()=>xml(`<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  const rels=list=>xml(`<Relationships xmlns="${NS_REL}">${list.map(([id,type,target])=>`<Relationship Id="${id}" Type="${type.startsWith('http')?type:NS_R+'/'+type}" Target="${esc(target)}"/>`).join('')}</Relationships>`);

  /** slides: [{background?, elements:[{type:'shape'|'image'|'table', ...}]}]; images carry {data:Uint8Array} (PNG). */
  function build(slides,meta={}){
    const files=[],media=[];
    const slideXml=slides.map((slide,index)=>{
      let id=2;const slideRels=[['rId1','slideLayout','../slideLayouts/slideLayout1.xml']];
      const body=slide.elements.map(el=>{
        if(el.type==='image'){media.push(el.data);const rId='rId'+(slideRels.length+1);slideRels.push([rId,'image',`../media/image${media.length}.png`]);return picture(id++,el,rId);}
        if(el.type==='table')return table(id++,el);
        return shape(id++,el);
      }).join('');
      files.push([`ppt/slides/_rels/slide${index+1}.xml.rels`,rels(slideRels)]);
      const bg=slide.background?`<p:bg><p:bgPr>${fill(slide.background)}<a:effectLst/></p:bgPr></p:bg>`:'';
      return xml(`<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${bg}<p:spTree>${emptyTree}${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    });
    const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');
    files.unshift(
      ['[Content_Types].xml',xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slides.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`)],
      ['_rels/.rels',rels([['rId1','officeDocument','ppt/presentation.xml'],['rId2','http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties','docProps/core.xml'],['rId3','extended-properties','docProps/app.xml']])],
      ['docProps/core.xml',xml(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title||'STRATUM Report')}</dc:title><dc:creator>STRATUM System Planning</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)],
      ['docProps/app.xml',xml(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>STRATUM System Planning</Application><Slides>${slides.length}</Slides><PresentationFormat>Widescreen</PresentationFormat></Properties>`)],
      ['ppt/presentation.xml',xml(`<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+6}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(SLIDE_W)}" cy="${emu(SLIDE_H)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)],
      ['ppt/_rels/presentation.xml.rels',rels([['rId1','slideMaster','slideMasters/slideMaster1.xml'],['rId2','theme','theme/theme1.xml'],['rId3','presProps','presProps.xml'],['rId4','viewProps','viewProps.xml'],['rId5','tableStyles','tableStyles.xml'],...slides.map((_,i)=>['rId'+(i+6),'slide',`slides/slide${i+1}.xml`])])],
      ['ppt/presProps.xml',xml(`<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`)],
      ['ppt/viewProps.xml',xml(`<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`)],
      ['ppt/tableStyles.xml',xml(`<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`)],
      ['ppt/slideMasters/slideMaster1.xml',master()],
      ['ppt/slideMasters/_rels/slideMaster1.xml.rels',rels([['rId1','slideLayout','../slideLayouts/slideLayout1.xml'],['rId2','theme','../theme/theme1.xml']])],
      ['ppt/slideLayouts/slideLayout1.xml',layout()],
      ['ppt/slideLayouts/_rels/slideLayout1.xml.rels',rels([['rId1','slideMaster','../slideMasters/slideMaster1.xml']])],
      ['ppt/theme/theme1.xml',theme()]
    );
    slideXml.forEach((s,i)=>files.push([`ppt/slides/slide${i+1}.xml`,s]));
    media.forEach((data,i)=>files.push([`ppt/media/image${i+1}.png`,data]));
    return zip(files);
  }

  // ---------- Report layout ----------
  const fmt=v=>Number.isFinite(v)?v.toFixed(2):'—';
  const textWidth=s=>[...String(s??'')].reduce((n,ch)=>n+(/[⺀-￿]/.test(ch)?1:.55),0); // em units
  function rowHeight(row,cols,size){
    let lines=1;
    row.forEach((cell,c)=>{const text=String(cell&&typeof cell==='object'?cell.text??'':cell??''),em=size/72,usable=Math.max(.2,cols[c]-.14);
      const n=text.split('\n').reduce((s,part)=>s+Math.max(1,Math.ceil(textWidth(part)*em/usable)),0);lines=Math.max(lines,n);});
    return lines*size*1.25/72+.1;
  }
  /** Split rows (first row = header) into pages that fit maxHeight. Returns [{rows,heights}]. */
  function paginate(rows,cols,size,maxHeight){
    const head=rows[0],headH=rowHeight(head,cols,size),pages=[];let current=null,used=0;
    for(const row of rows.slice(1)){const h=rowHeight(row,cols,size);if(!current||used+h>maxHeight){current={rows:[head],heights:[headH]};pages.push(current);used=headH;}current.rows.push(row);current.heights.push(h);used+=h;}
    return pages.length?pages:[{rows:[head],heights:[headH]}];
  }
  function frame(title,subtitle,page,projectName){
    return [
      {type:'shape',name:'Header',x:0,y:0,w:SLIDE_W,h:.9,fill:'10161E'},
      {type:'shape',name:'Accent',x:0,y:.9,w:SLIDE_W,h:.05,fill:'60D5BF'},
      {type:'shape',name:'Title',x:.45,y:.1,w:9.6,h:.5,text:title,size:22,bold:true,color:'FFFFFF',anchor:'ctr',inset:0},
      {type:'shape',name:'Subtitle',x:.45,y:.55,w:12.4,h:.3,text:subtitle||'',size:11,color:'8FE3D3',anchor:'ctr',inset:0},
      {type:'shape',name:'Brand',x:10.1,y:.1,w:2.8,h:.5,text:'▧ STRATUM',size:13,bold:true,color:'60D5BF',align:'r',anchor:'ctr',inset:0},
      {type:'shape',name:'Footer',x:.45,y:7.12,w:12.4,h:.28,text:[[{text:projectName,color:'6B7A8C'},{text:`   ·   ${page}`,color:'9AA7B5'}]],size:9,anchor:'ctr',inset:0}
    ];
  }
  function fitImage(img,x,y,w,h){const r=Math.min(w/img.width,h/img.height),iw=img.width*r,ih=img.height*r;return {type:'image',data:img.data,x:x+(w-iw)/2,y:y+(h-ih)/2,w:iw,h:ih,line:'C9D2DB',lineWidth:.75,alt:img.alt};}

  // ---------- Browser capture ----------
  function stylesheetText(){let css='';for(const sheet of document.styleSheets){try{css+=[...sheet.cssRules].map(rule=>rule.cssText).join('\n');}catch{}}return css;}
  function svgToPng(svgText,width,height,background){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'})),image=new Image();
      image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);URL.revokeObjectURL(url);
        canvas.toBlob(async blob=>{if(!blob){reject(new Error('PNG 編碼失敗。'));return;}resolve({data:new Uint8Array(await blob.arrayBuffer()),width,height});},'image/png');}catch(error){URL.revokeObjectURL(url);reject(error);}};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('SVG 圖像無法渲染。'));};image.src=url;
    });
  }
  // Content bounds of the architecture drawing, so slides are not mostly empty workspace.
  function architectureBounds(){
    const s=P.state,pts=[];
    for(const c of s.components){const a=(c.rotation||0)*Math.PI/180,cx=c.x+c.width/2,cy=c.y+c.height/2,hw=(Math.abs(Math.cos(a))*c.width+Math.abs(Math.sin(a))*c.height)/2,hh=(Math.abs(Math.sin(a))*c.width+Math.abs(Math.cos(a))*c.height)/2;pts.push([cx-hw,cy-hh],[cx+hw,cy+hh]);}
    for(const l of s.lines)pts.push([l.x1,l.y1],[l.x2,l.y2]);
    for(const t of s.textBoxes)pts.push([t.x,t.y],[t.x+t.width,t.y+t.height]);
    if(!pts.length)return {x:0,y:0,width:s.workspace.width,height:s.workspace.height};
    const m=60,x0=Math.min(...pts.map(p=>p[0]))-m,y0=Math.min(...pts.map(p=>p[1]))-m,x1=Math.max(...pts.map(p=>p[0]))+m,y1=Math.max(...pts.map(p=>p[1]))+m;
    return {x:x0,y:y0,width:Math.max(200,x1-x0),height:Math.max(120,y1-y0)};
  }
  async function captureArchitecture(){
    const box=architectureBounds(),svg=P.buildExportSvg(box),scale=Math.min(2.5,4096/Math.max(box.width,box.height));
    const img=await svgToPng(svg,Math.round(box.width*scale),Math.round(box.height*scale),P.state.appearance?.theme==='light'?'#f4f7fa':'#111923');
    return {...img,alt:'System architecture block diagram'};
  }
  async function capturePlacement(face){
    const select=document.getElementById('placement-side'),source=document.getElementById('pcb-canvas'),b=P.state.board;
    select.value=face;P.placement.render();
    const copy=P.inlineSvgStyles(source,source.cloneNode(true));copy.removeAttribute('hidden');copy.style.display='inline';copy.removeAttribute('id');copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
    copy.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));
    const vw=b.width+10,vh=b.height+10,scale=Math.min(14,3600/Math.max(vw,vh)),W=Math.round(vw*scale),H=Math.round(vh*scale);
    copy.setAttribute('width',W);copy.setAttribute('height',H);copy.setAttribute('viewBox',`-5 -5 ${vw} ${vh}`);
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=stylesheetText()+'#pcb-canvas,svg{width:auto;height:auto}';copy.querySelector('defs').append(style);
    const svg=new XMLSerializer().serializeToString(copy);
    return {...await svgToPng(svg,W,H,'#101e22'),alt:`PCB placement ${face}`};
  }

  // ---------- Slides ----------
  function placementRows(face){
    const rows=[['元件','封裝','X, Y (mm)','尺寸 (mm)','旋轉','高 (mm)']];
    for(const p of P.state.placements.filter(p=>(p.side||'top')===face)){const c=P.component(p.componentId);if(!c)continue;
      rows.push([c.name,c.icPackage==='Custom'?(c.packageSpec||'自訂'):c.icPackage+(['SOT','TQFP'].includes(c.icPackage)?' '+c.icPinCount+'P':''),`${p.x}, ${p.y}`,`${p.width} × ${p.height}`,p.rotation+'°',c.icThickness]);}
    return rows;
  }
  function reportSlides(images,now=new Date()){
    const s=P.state,name=s.project?.name||'STRATUM Project',slides=[],date=now.toLocaleString('zh-TW',{hour12:false});
    const add=(title,subtitle,elements)=>slides.push({elements:[...frame(title,subtitle,`${slides.length+1}`,name),...elements]});
    const side=p=>p.side||'top',rows=P.linkBudget.evaluate(),lb=s.linkBudget;
    const highest=face=>Math.max(0,...s.placements.filter(p=>side(p)===face).map(p=>P.component(p.componentId)?.icThickness||0));

    // Cover
    slides.push({background:'10161E',elements:[
      {type:'shape',x:.8,y:1.6,w:.12,h:2.3,fill:'60D5BF'},
      {type:'shape',x:1.15,y:1.5,w:11,h:.5,text:'▧ STRATUM · SYSTEM PLANNING',size:14,bold:true,color:'60D5BF',inset:0},
      {type:'shape',x:1.15,y:2.05,w:11.4,h:1.1,text:name,size:38,bold:true,color:'FFFFFF',anchor:'ctr',inset:0},
      {type:'shape',x:1.15,y:3.2,w:11,h:.6,text:'系統架構 · PCB 擺件 · RF Link Budget 報告',size:18,color:'C6D2DE',inset:0},
      {type:'table',x:1.15,y:4.55,cols:[2.6,2.6,2.6,2.6],size:12,headerFill:'203D55',border:'2A3542',rows:[
        ['方塊','連線','已擺放 IC','RF 路徑'],
        [{text:String(s.components.length),fill:'172331',color:'FFFFFF',size:20,bold:true},{text:String(s.connections.length),fill:'172331',color:'FFFFFF',size:20,bold:true},{text:`${s.placements.length} / ${s.components.length}`,fill:'172331',color:'FFFFFF',size:20,bold:true},{text:String(rows.length),fill:'172331',color:'FFFFFF',size:20,bold:true}]],heights:[.38,.62]},
      {type:'shape',x:1.15,y:6.55,w:11,h:.35,text:`匯出時間 ${date}  ·  PCB ${s.board.width} × ${s.board.height} × ${s.board.thickness} mm`,size:11,color:'8291A3',inset:0}
    ]});

    // Architecture
    add('方塊架構圖 · System Architecture',`${s.components.length} 個方塊 · ${s.connections.length} 條連線 · ${s.lines.length} 條直線 · ${s.textBoxes.length} 個文字框`,[fitImage(images.architecture,.45,1.15,12.43,5.9)]);

    // Placement Top / Bottom
    for(const face of ['top','bottom']){
      const img=images[face],list=placementRows(face),count=list.length-1,label=face==='top'?'Top 上表面':'Bottom 下表面';
      const subtitle=`PCB ${s.board.width} × ${s.board.height} mm · 板厚 ${s.board.thickness} mm · ${label} ${count} 顆 · Top 最高 ${highest('top')} mm / Bottom 最高 ${highest('bottom')} mm · 整體高度 ${Number((s.board.thickness+highest('top')+highest('bottom')).toFixed(3))} mm`;
      const cols=[1.4,.72,.8,.75,.45,.48],size=9,pages=paginate(list,cols,size,5.25);
      pages.forEach((page,i)=>{
        const els=[fitImage(img,.45,1.15,7.6,5.55),{type:'shape',x:.45,y:6.74,w:7.6,h:.32,text:face==='bottom'?'俯視座標同 Top（由上方透視，未鏡像）；原點為左上角。虛線為原設計連線。':'原點為左上角；虛線為原設計連線，橘色虛框為 Keep Out 範圍。',size:9,color:'6B7A8C',inset:0}];
        if(count)els.push({type:'table',x:8.25,y:1.15,cols,size,band:true,rows:page.rows,heights:page.heights,align:[null,null,'r','r','r','r']});
        else els.push({type:'shape',x:8.25,y:1.15,w:4.6,h:.8,text:`${label}尚無擺放 IC。`,size:12,color:'6B7A8C',fill:'F3F6F9',anchor:'ctr',align:'ctr'});
        add(`PCB 擺件 · ${label}${pages.length>1?` (${i+1}/${pages.length})`:''}`,subtitle,els);
      });
    }

    // Link budget summary (Tx then Rx)
    const statusCell=r=>r.valid?(r.warnings.length?{text:'有條件估算',color:'B7791F',bold:true}:{text:'估算完成',color:'1F8A70',bold:true}):{text:'未完成',color:'C2410C',bold:true};
    const settings=`Rx 雜訊頻寬 ${lb.bandwidthMHz} MHz · 所需 SNR ${lb.snrDb} dB · Sensitivity = −174 + 10log₁₀(BW) + NF + SNR · Tx 受 DA / PA P1dB / 被動元件 Max Input 限制`;
    if(!rows.length)add('RF Link Budget',settings,[{type:'shape',x:.45,y:1.3,w:12.4,h:1,text:'尚無 RF Transceiver（TRX），沒有可估算的 RF 路徑。',size:14,color:'6B7A8C',fill:'F3F6F9',anchor:'ctr',align:'ctr'}]);
    for(const kind of ['tx','rx']){
      const subset=rows.filter(r=>r.kind===kind);if(!subset.length)continue;
      const head=kind==='tx'?['TRX / 通道','RF 路徑','Max power (dBm)','總 Gain (dB)','限制來源','狀態','備註']:['TRX / 通道','RF 路徑','Sensitivity (dBm)','Cascade NF (dB)','總 Gain (dB)','狀態','備註'];
      const cols=kind==='tx'?[1.45,3.6,1.15,1,1.7,1,2.53]:[1.45,3.6,1.2,1.15,1,1,3.03];
      const body=subset.map(r=>{const note=r.warnings.slice(0,3).join('\n')+(r.warnings.length>3?`\n…另 ${r.warnings.length-3} 項`:'');
        return kind==='tx'?[`${r.trx}\nTX ${r.channel}`,r.path,{text:fmt(r.value),bold:true},fmt(r.gain),r.limiter||'—',statusCell(r),{text:note,size:8,color:'5B6876'}]:[`${r.trx}\nRX ${r.channel}`,r.path,{text:fmt(r.value),bold:true},fmt(r.nf),fmt(r.gain),statusCell(r),{text:note,size:8,color:'5B6876'}];});
      const pages=paginate([head,...body],cols,9.5,5.7);
      pages.forEach((page,i)=>add(`RF Link Budget · ${kind==='tx'?'Tx 天線饋入端最大功率':'Rx 天線端輸入靈敏度'}${pages.length>1?` (${i+1}/${pages.length})`:''}`,settings,[{type:'table',x:.45,y:1.15,cols,size:9.5,band:true,rows:page.rows,heights:page.heights,align:[null,null,'r','r',kind==='tx'?null:'r',null,null]}]));
    }

    // Stage-by-stage details, two paths per slide when they fit
    const details=rows.filter(r=>r.stages.length);
    const blocks=details.map(r=>{
      const head=['級','Gain (dB)','NF (dB)','累積 Gain (dB)',r.kind==='tx'?'輸出 (dBm)':'累積 NF (dB)'];
      const body=r.stages.map(st=>[st.name,fmt(st.gain),fmt(st.nf),fmt(st.cumulativeGain),fmt(r.kind==='tx'?st.power:st.cumulativeNf)]);
      return {r,rows:[head,...body]};
    });
    const cols=[2.6,.85,.85,1.1,.75],colsTotal=cols.reduce((a,b)=>a+b,0),gap=.63,size=9;
    let pending=[];
    const flush=()=>{if(!pending.length)return;const els=[];pending.forEach((b,i)=>{const x=.45+i*(colsTotal+gap);
      els.push({type:'shape',x,y:1.12,w:colsTotal,h:.62,text:[[{text:`${b.r.kind.toUpperCase()} · ${b.r.trx} / CH ${b.r.channel}`,bold:true,size:11,color:'203D55'},{text:`   ${b.r.kind==='tx'?'Max':'Sens.'} ${fmt(b.r.value)} dBm`,bold:true,size:11,color:b.r.valid?'1F8A70':'C2410C'}],{text:b.r.path,size:8.5,color:'5B6876'}],inset:0});
      els.push({type:'table',x,y:1.8,cols,size,band:true,rows:b.page.rows,heights:b.page.heights,align:[null,'r','r','r','r']});});
      add('RF Link Budget · 逐級明細',settings,els);pending=[];};
    for(const b of blocks){const pages=paginate(b.rows,cols,size,5.2);pages.forEach(page=>{pending.push({r:b.r,page});if(pending.length===2)flush();});}
    flush();
    return slides;
  }

  async function exportReport(){
    const button=document.getElementById('export-pptx'),previous=document.getElementById('placement-side')?.value;
    if(button){button.disabled=true;button.textContent='產生中…';}
    try{
      const images={architecture:await captureArchitecture()};
      try{images.top=await capturePlacement('top');images.bottom=await capturePlacement('bottom');}
      finally{const select=document.getElementById('placement-side');if(select&&previous){select.value=previous;P.placement.render();}}
      const bytes=build(reportSlides(images),{title:P.state.project?.name}),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
      const safe=(P.state.project?.name||'stratum-project').replace(/[\\/:*?"<>|]+/g,'-').trim()||'stratum-project',url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`${safe}-report.pptx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
      P.notify('pptx-export');return true;
    }catch(error){P.warn('PPT 匯出失敗：'+error.message);return false;}
    finally{if(button){button.disabled=false;button.textContent='匯出 PPT';}}
  }

  P.pptx={build,zip,crc32,paginate,reportSlides};
  P.exportPPTX=exportReport;
  if(typeof document!=='undefined'){const button=document.getElementById('export-pptx');if(button)button.addEventListener('click',exportReport);}
})(window.Planner);
