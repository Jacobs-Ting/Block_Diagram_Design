(function(P){
  'use strict';
  const svg=document.getElementById('canvas'),layer=document.getElementById('text-boxes'),{element,attributes,point}=P.svg,nodes=new Map();
  const handles=['nw','n','ne','e','se','s','sw','w'];let gesture=null;
  function wrappedLines(box){
    const capacity=Math.max(1,Math.floor((box.width-20)/(box.fontSize*.58))),result=[];
    for(const paragraph of String(box.text).split('\n')){if(!paragraph){result.push('');continue;}let rest=paragraph;while(rest.length>capacity){let cut=rest.lastIndexOf(' ',capacity);if(cut<1)cut=capacity;result.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}result.push(rest);}
    return result.slice(0,Math.max(1,Math.floor((box.height-18)/(box.fontSize*1.25))));
  }
  function draw(box){
    let node=nodes.get(box.id);
    if(!node){
      node=element('g',{class:'text-box','data-text-id':box.id,tabindex:0,role:'button'});
      const clip=element('clipPath',{id:'text-clip-'+box.id});clip.append(element('rect',{class:'text-clip-rect'}));
      const handlesGroup=element('g',{class:'text-handles'});handles.forEach(handle=>handlesGroup.append(element('rect',{class:'text-resize-handle','data-text-handle':handle,width:10,height:10,rx:2})));
      node.append(clip,element('rect',{class:'text-box-body',rx:4}),element('text',{class:'text-box-content','clip-path':`url(#text-clip-${box.id})`}),handlesGroup);nodes.set(box.id,node);layer.append(node);
    }
    attributes(node,{transform:`translate(${box.x} ${box.y})`});
    const body=node.querySelector('.text-box-body');attributes(body,{width:box.width,height:box.height});body.style.fill=box.backgroundColor;body.style.stroke=box.borderColor;
    attributes(node.querySelector('.text-clip-rect'),{x:8,y:8,width:box.width-16,height:box.height-16});
    const content=node.querySelector('.text-box-content');content.replaceChildren();content.style.fill=box.textColor;content.style.fontFamily=box.fontFamily;content.style.fontSize=box.fontSize+'px';
    wrappedLines(box).forEach((line,index)=>content.append(element('tspan',{x:10,y:10+box.fontSize+(index*box.fontSize*1.25)},line)));
    for(const handle of node.querySelectorAll('.text-resize-handle')){const h=handle.dataset.textHandle,x=h.includes('w')?-12:h.includes('e')?box.width+12:box.width/2,y=h.includes('n')?-12:h.includes('s')?box.height+12:box.height/2;attributes(handle,{x:x-5,y:y-5});}
    node.classList.toggle('selected',P.isSelected(box.id,'text'));node.setAttribute('aria-label','文字框：'+box.text.slice(0,40));
  }
  function pos(e){const p=point(e),unit=P.ui.snap?20:1,snap=n=>Math.round(n/unit)*unit;return{x:snap(p.x),y:snap(p.y)};}
  function stop(cancel=false){if(cancel&&gesture?.original&&P.textBox(gesture.id))P.updateTextBox(gesture.id,gesture.original);gesture=null;}
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;const node=e.target.closest('.text-box');
    if(P.ui.mode!=='text'&&(!node||P.ui.mode!=='select'))return;
    e.preventDefault();e.stopImmediatePropagation();const p=pos(e);svg.focus();
    if(P.ui.mode==='text')gesture={kind:'create',start:p};
    else {const box=P.textBox(node.dataset.textId),handle=e.target.closest('.text-resize-handle')?.dataset.textHandle;P.select(box.id,'text');gesture={kind:handle?'resize':'move',id:box.id,handle,start:p,original:{...box}};}
    svg.setPointerCapture(e.pointerId);
  },true);
  svg.addEventListener('pointermove',e=>{
    if(!gesture)return;e.preventDefault();e.stopImmediatePropagation();const p=pos(e),o=gesture.original;
    if(gesture.kind==='create')return;
    if(gesture.kind==='move')P.updateTextBox(gesture.id,{x:o.x+p.x-gesture.start.x,y:o.y+p.y-gesture.start.y});
    else {let x=o.x,y=o.y,width=o.width,height=o.height;if(gesture.handle.includes('w')){x=Math.min(o.x+o.width-80,p.x);width=o.x+o.width-x;}if(gesture.handle.includes('e'))width=Math.max(80,p.x-o.x);if(gesture.handle.includes('n')){y=Math.min(o.y+o.height-40,p.y);height=o.y+o.height-y;}if(gesture.handle.includes('s'))height=Math.max(40,p.y-o.y);P.updateTextBox(gesture.id,{x,y,width,height});}
  },true);
  svg.addEventListener('pointerup',e=>{
    if(!gesture)return;e.stopImmediatePropagation();if(gesture.kind==='create'){const p=pos(e),x=Math.min(gesture.start.x,p.x),y=Math.min(gesture.start.y,p.y),width=Math.abs(p.x-gesture.start.x),height=Math.abs(p.y-gesture.start.y);const box=P.addTextBox({x,y,width:width>=20?width:240,height:height>=20?height:100});P.setMode('select');P.select(box.id,'text');}gesture=null;
  },true);
  svg.addEventListener('pointercancel',()=>stop(true));
  P.subscribe(({type,id})=>{if(['text-add','text-update'].includes(type))draw(P.textBox(id));if(type==='text-remove'){nodes.get(id)?.remove();nodes.delete(id);}if(type==='selection')nodes.forEach((node,key)=>node.classList.toggle('selected',P.isSelected(key,'text')));if(type==='clear'){nodes.forEach(n=>n.remove());nodes.clear();stop();}if(type==='project-load'){nodes.forEach(n=>n.remove());nodes.clear();P.state.textBoxes.forEach(draw);}if(['mode','tab'].includes(type))stop(true);});
  P.state.textBoxes.forEach(draw);
})(window.Planner);
