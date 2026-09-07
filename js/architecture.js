(function (P) {
  'use strict';
  const svg=document.getElementById('canvas'),layer=document.getElementById('blocks');
  const nodes=new Map(),{element,attributes,point}=P.svg;
  const handles=['nw','n','ne','e','se','s','sw','w'];
  function points(c,g){
    const target=g.querySelector('.points');target.replaceChildren();
    const endpoints=[...P.sides.map(anchor=>({componentId:c.id,portId:null,anchor})),...P.componentPorts(c.id).map(p=>({componentId:c.id,portId:p.id,anchor:p.side}))];
    for(const end of endpoints){
      const port=P.port(end.portId),node=element('g',{class:'connection-point '+(port?'engineering':'general'),'data-component-id':c.id,'data-port-id':end.portId||'','data-side':end.anchor,tabindex:0,role:'button','aria-label':`${c.name}: ${port?.name||end.anchor+' general connection'}`});
      node.append(element('circle',{class:'point-hit',r:12}),port?element('rect',{class:'point-dot',x:-5,y:-5,width:10,height:10,rx:2}):element('circle',{class:'point-dot',r:5}),element('title'));
      node.style.setProperty('--port-color',port?P.interfaceColors[port.type]:'#b3c3d3');
      node.querySelector('title').textContent=port?`${port.name} · ${port.type} · ${port.direction} · ${P.portUsage(port.id)} / ${port.maxConnections??'∞'} connections`:`${end.anchor} · General connection · Unlimited`;
      target.append(node);
    }
  }
  function layout(c,g){
    attributes(g,{transform:`translate(${c.x} ${c.y}) rotate(${c.rotation} ${c.width/2} ${c.height/2})`});
    attributes(g.querySelector('.body'),{width:c.width,height:c.height});
    attributes(g.querySelector('.text-clip'),{width:c.width-32,height:c.height-12});
    for(const node of g.querySelectorAll('.connection-point')){
      const end=P.connectionUI.endpointFromNode(node),p=P.geometry.anchorLocal(end);attributes(node,{transform:`translate(${p.x} ${p.y})`});
      const port=P.port(end.portId);
      const connected=P.state.connections.some(edge=>[edge.source,edge.target].some(p=>p.componentId===end.componentId&&p.portId===end.portId&&(port||p.anchor===end.anchor)));
      node.classList.toggle('connected',connected);
      node.classList.toggle('over-limit',!!port&&port.maxConnections!==null&&P.portUsage(port.id)>port.maxConnections);
    }
    for(const node of g.querySelectorAll('.resize-handle')){
      const h=node.dataset.handle,x=h.includes('w')?-16:h.includes('e')?c.width+16:c.width/2,y=h.includes('n')?-16:h.includes('s')?c.height+16:c.height/2;
      attributes(node,{x:x-5,y:y-5});
    }
  }
  function draw(c,structural=false){
    let g=nodes.get(c.id);
    if(!g){
      g=element('g',{'data-id':c.id,class:'block',tabindex:0,role:'button'});
      const clip=element('clipPath',{id:'clip-'+c.id});clip.append(element('rect',{class:'text-clip',x:16,y:6}));
      const text=element('g',{'clip-path':`url(#clip-${c.id})`});
      text.append(element('text',{class:'symbol',x:16,y:31}),element('text',{class:'category',x:43,y:28}),element('text',{class:'name',x:16,y:58}),element('text',{class:'part',x:16,y:80}),element('text',{class:'ref',x:16,y:100}));
      const grips=element('g',{class:'resize-handles'});handles.forEach(h=>grips.append(element('rect',{class:'resize-handle','data-handle':h,width:10,height:10,rx:2})));
      g.append(clip,element('rect',{class:'body',rx:7}),element('rect',{class:'stripe',x:0,y:18,width:3,height:30,rx:1}),text,grips,element('g',{class:'points'}),element('title',{class:'block-title'}));
      nodes.set(c.id,g);layer.append(g);structural=true;
    }
    if(structural)points(c,g);
    layout(c,g);g.classList.toggle('selected',P.isSelected(c.id,'component'));
    g.setAttribute('aria-label',`${c.name}, ${c.category}`);
    g.querySelector('.block-title').textContent=`${c.name}\n${c.partNumber}\n${c.width} × ${c.height}`;
    const color=P.colors[c.category]||P.colors.Other;
    const body=g.querySelector('.body'),renderColor=c.renderColor||'#1c2938';
    // CSS declarations override SVG presentation attributes. Set the live
    // color as an inline style so the editor and exported SVG/PNG agree.
    body.setAttribute('fill',renderColor);body.style.fill=renderColor;
    const font=c.fontFamily||'Segoe UI',size=c.fontSize||15,textColor=c.textColor||'#dce5ee';
    for(const node of g.querySelectorAll('.name,.part,.category,.ref')){node.style.fontFamily=font;node.style.fill=textColor;}
    g.querySelector('.name').style.fontSize=size+'px';g.querySelector('.part').style.fontSize=Math.max(9,size*.73)+'px';g.querySelector('.category').style.fontSize=Math.max(8,size*.6)+'px';g.querySelector('.ref').style.fontSize=Math.max(8,size*.6)+'px';
    g.querySelector('.stripe').setAttribute('fill',color);g.querySelector('.symbol').setAttribute('fill',color);g.querySelector('.symbol').textContent=P.icons[c.category]||'□';
    g.querySelector('.category').textContent=c.category.toUpperCase();
    g.querySelector('.name').textContent=c.name;g.querySelector('.part').textContent=c.partNumber||'No part number';g.querySelector('.ref').textContent='ID '+c.id.slice(0,8).toUpperCase();
  }
  P.state.components.forEach(c=>draw(c));
  function reconcile(){
    const ids=new Set(P.state.components.map(c=>c.id));nodes.forEach((node,id)=>{if(!ids.has(id)){node.remove();nodes.delete(id);}});P.state.components.forEach(c=>draw(c,true));
  }
  P.subscribe(({type,id})=>{
    if(type==='project-load')reconcile();
    else if(type==='clear'){nodes.clear();layer.replaceChildren();svg.classList.remove('drop-active');}
    else if(type==='remove'){nodes.get(id)?.remove();nodes.delete(id);}
    else if(type==='selection')nodes.forEach((g,key)=>g.classList.toggle('selected',P.isSelected(key,'component')));
    else if(type==='mode')svg.classList.toggle('connect-mode',P.ui.mode==='connect');
    else if(type.startsWith('connection-'))P.state.components.forEach(c=>draw(c,true));
    else {const c=P.component(id);if(c){if(type==='move'||type==='resize')layout(c,nodes.get(id));else draw(c,type==='ports');}}
  });
  let drag=null;
  function endDrag(){if(drag)nodes.get(drag.id)?.classList.remove('dragging');drag=null;}
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const endpoint=P.connectionUI.endpointFromNode(e.target);
    if(endpoint){e.preventDefault();P.connectionUI.begin(endpoint,e);svg.setPointerCapture(e.pointerId);return;}
    if(P.connectionUI.isPending()){
      e.preventDefault();const target=P.connectionUI.targetAt(e);if(target)P.connectionUI.complete(target);else P.connectionUI.cancel();return;
    }
    const edge=e.target.closest('.connection');if(edge){e.preventDefault();P.select(edge.dataset.edgeId,'connection');svg.focus();return;}
    const g=e.target.closest('.block');if(!g){P.select(null);return;}
    e.preventDefault();const c=P.component(g.dataset.id);P.select(c.id);svg.focus();
    if(P.ui.mode==='connect')return;
    const p=point(e),handle=e.target.closest('.resize-handle')?.dataset.handle;
    drag={id:c.id,handle,start:p,original:{...c}};svg.setPointerCapture(e.pointerId);g.classList.add('dragging');
  });
  svg.addEventListener('pointermove',e=>{
    const p=point(e);document.getElementById('coordinates').textContent=`X ${Math.round(p.x)}  Y ${Math.round(p.y)}`;
    P.connectionUI.move(e);if(!drag)return;
    const c=P.component(drag.id);if(!c){endDrag();return;}
    const delta={x:p.x-drag.start.x,y:p.y-drag.start.y};
    if(drag.handle)P.update(c.id,P.geometry.resize(drag.original,drag.handle,delta,P.ui.snap,P.minimumSize(c.id)),'resize');
    else {const snap=n=>P.ui.snap?Math.round(n/20)*20:n;P.update(c.id,{x:snap(drag.original.x+delta.x),y:snap(drag.original.y+delta.y)},'move');}
  });
  svg.addEventListener('pointerup',e=>{P.connectionUI.release(e);endDrag();});
  svg.addEventListener('pointercancel',()=>{P.connectionUI.cancel();endDrag();});
  svg.addEventListener('lostpointercapture',endDrag);
  P.subscribe(({type})=>{if(['mode','tab','remove'].includes(type))endDrag();});
  svg.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const endpoint=P.connectionUI.endpointFromNode(e.target);if(endpoint){e.preventDefault();const p=e.target.getBoundingClientRect();P.connectionUI.begin(endpoint,{clientX:p.x,clientY:p.y,target:e.target});return;}
    if(e.target.dataset.edgeId){e.preventDefault();P.select(e.target.dataset.edgeId,'connection');}
    else if(e.target.dataset.id){e.preventDefault();P.select(e.target.dataset.id);}
  });
  svg.addEventListener('dragover',e=>{if(!Array.from(e.dataTransfer.types).includes('application/x-stratum-component'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';svg.classList.add('drop-active');});
  svg.addEventListener('dragleave',()=>svg.classList.remove('drop-active'));
  svg.addEventListener('drop',e=>{
    e.preventDefault();svg.classList.remove('drop-active');const name=e.dataTransfer.getData('application/x-stratum-component');if(!P.library.some(c=>c.name===name))return;
    const p=point(e),snap=n=>P.ui.snap?Math.round(n/20)*20:n;const c=P.addComponent(name,snap(p.x-100),snap(p.y-56));P.select(c.id);
  });
  P.addAtCenter=name=>{const offset=(P.state.components.length%6)*20;const c=P.addComponent(name,540+offset,620+offset);P.select(c.id);};
})(window.Planner);

