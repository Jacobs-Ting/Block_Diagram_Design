(function(P){
  'use strict';
  const $=id=>document.getElementById(id),svg=$('pcb-3d'),NS='http://www.w3.org/2000/svg';
  let yaw=-.55,tilt=1.05,zoom=1,gesture=null,selection=null;
  function node(tag,attrs,text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function project(x,y,z){const b=P.state.board,X=x-b.width/2,Y=y-b.height/2,u=X*Math.cos(yaw)-Y*Math.sin(yaw),v=X*Math.sin(yaw)+Y*Math.cos(yaw);return {x:u,y:v*Math.cos(tilt)-z*Math.sin(tilt),depth:v*Math.sin(tilt)+z*Math.cos(tilt)};}
  function render(selected=selection){
    selection=selected;svg.replaceChildren();const faces=[],bottomFaces=[],boardFaces=[],points=[],b=P.state.board;
    function box(x,y,w,h,z,height,color,id,label,isPad=false,mount='top'){
      const vertices=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z],[x,y,z+height],[x+w,y,z+height],[x+w,y+h,z+height],[x,y+h,z+height]].map(v=>project(...v));points.push(...vertices);
      for(const [i,indices] of [[0,[0,3,2,1]],[1,[0,1,5,4]],[2,[1,2,6,5]],[3,[2,3,7,6]],[4,[3,0,4,7]],[5,[4,5,6,7]]]){
        const ps=indices.map(k=>vertices[k]),g=node('g',id?{'data-component':id,class:isPad?'pcb-lead':'pcb-solid'}:{}),poly=node('polygon',{points:ps.map(p=>`${p.x},${p.y}`).join(' '),fill:color,stroke:id===selected?'#fff':'#102d32','stroke-width':id===selected?.5:.18});
        g.append(poly,node('polygon',{points:poly.getAttribute('points'),fill:i===5?'#ffffff':'#000000',opacity:i===5?.06:[.4,.22,.38,.15,.3][i],'pointer-events':'none'}));
        if(id)g.append(node('title',{},label));
        if(i===(mount==='bottom'?0:5)&&id&&!isPad){const center=project(x+w/2,y+h/2,mount==='bottom'?z-.02:z+height+.02);g.append(node('text',{x:center.x,y:center.y,'text-anchor':'middle','font-size':Math.min(2,w/Math.max(label.split('\n')[0].length*.6,1)),fill:'#ffffff','pointer-events':'none'},label.split('\n')[0]));}
        (id?(mount==='bottom'?bottomFaces:faces):boardFaces).push({depth:ps.reduce((s,p)=>s+p.depth,0)/4,node:g});
      }
    }
    box(0,0,b.width,b.height,0,b.thickness,'#28775e',null,'PCB');
    for(const p of P.state.placements){
      const c=P.component(p.componentId);if(!c)continue;
      const geometry=P.icGeometry(c),body=P.icRect(geometry.body,c,p.rotation),label=`${c.name}\n${c.icPackage}${c.icPackage==='SOT'?' · '+c.icPinCount+' pins':''}\n${c.icWidth} × ${c.icHeight} × ${c.icThickness} mm`;
      const mount=p.side||'top',z=mount==='bottom'?-c.icThickness:b.thickness;
      box(p.x+body.x,p.y+body.y,body.w,body.h,z,c.icThickness,'#111111',c.id,label,false,mount);
      geometry.pads.forEach((pad,index)=>{const r=P.icRect(pad,c,p.rotation);const leadHeight=Math.min(.25,c.icThickness*.35);box(p.x+r.x,p.y+r.y,r.w,r.h,mount==='bottom'?-leadHeight:b.thickness,leadHeight,'#bbc3cc',c.id,`${c.name} · SOT lead ${index+1}`,true,mount);});
    }
    if($('show-ratsnest').checked)for(const e of P.state.connections){const a=P.state.placements.find(p=>p.componentId===e.source.componentId),c=P.state.placements.find(p=>p.componentId===e.target.componentId);if(!a||!c)continue;const sa=P.placement.size(a),sc=P.placement.size(c),v=project(a.x+sa.w/2,a.y+sa.h/2,a.side==='bottom'?-P.component(a.componentId).icThickness-.1:b.thickness+P.component(a.componentId).icThickness+.1),w=project(c.x+sc.w/2,c.y+sc.h/2,c.side==='bottom'?-P.component(c.componentId).icThickness-.1:b.thickness+P.component(c.componentId).icThickness+.1);((a.side||'top')==='bottom'&&(c.side||'top')==='bottom'?bottomFaces:faces).push({depth:(v.depth+w.depth)/2,node:node('line',{x1:v.x,y1:v.y,x2:w.x,y2:w.y,stroke:P.interfaceColors[e.interfaceType]||'#ccc','stroke-width':.25,'stroke-dasharray':'1 1','pointer-events':'none'})});}
    // Keep each mounting side separated by the opaque PCB. Centroid sorting
    // across the board's large faces would incorrectly hide nearby IC faces.
    const above=Math.cos(tilt)>=0,far=above?bottomFaces:faces,near=above?faces:bottomFaces;
    const layers=[];if(far.length)layers.push(['far-components',far]);layers.push(['board',boardFaces],['components',near]);
    for(const [name,items] of layers){
      const layer=node('g',{'data-layer':name});
      items.sort((a,b)=>a.depth-b.depth);for(const f of items)layer.append(f.node);
      svg.append(layer);
    }
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),w=(maxX-minX+14)/zoom,h=(maxY-minY+14)/zoom;
    svg.setAttribute('viewBox',`${(minX+maxX-w)/2} ${(minY+maxY-h)/2} ${w} ${h}`);
  }
  function view(is3d){svg.toggleAttribute('hidden',!is3d);$('pcb-canvas').toggleAttribute('hidden',is3d);$('view-3d').setAttribute('aria-pressed',String(is3d));$('view-top').setAttribute('aria-pressed',String(!is3d));if(is3d)render();}
  $('view-3d').onclick=()=>view(true);$('view-top').onclick=()=>view(false);
  $('look-bottom').onclick=()=>{tilt=Math.PI-1.05;view(true);};
  $('reset-3d').onclick=()=>{yaw=-.55;tilt=1.05;zoom=1;render();};
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();gesture={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,id:e.target.closest('[data-component]')?.dataset.component};svg.setPointerCapture?.(e.pointerId);svg.focus();});
  svg.addEventListener('pointermove',e=>{if(!gesture)return;yaw+=(e.clientX-gesture.x)*.01;tilt=Math.max(-Math.PI,Math.min(Math.PI,tilt+(e.clientY-gesture.y)*.01));gesture.x=e.clientX;gesture.y=e.clientY;render();});
  svg.addEventListener('pointerup',e=>{const g=gesture;gesture=null;if(g&&Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<4&&g.id)P.placement.select(g.id);});
  for(const event of ['pointercancel','lostpointercapture'])svg.addEventListener(event,()=>gesture=null);
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.4,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));render();},{passive:false});
  svg.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.1;if(e.key==='ArrowRight')yaw+=.1;if(e.key==='ArrowUp')tilt=Math.min(Math.PI,tilt+.1);if(e.key==='ArrowDown')tilt=Math.max(-Math.PI,tilt-.1);if(e.key==='+'||e.key==='=')zoom=Math.min(4,zoom*1.1);if(e.key==='-')zoom=Math.max(.4,zoom/1.1);render();});
  P.subscribe(({type})=>{if(['tab','clear','project-load','remove'].includes(type))gesture=null;});
  P.pcb3d={render,project};
})(window.Planner);
