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
    const PTFE3='#f2f0ea';
    const N=24,ring=(cx,cy,r,z)=>Array.from({length:N},(_,i)=>project(cx+r*Math.cos(2*Math.PI*i/N),cy+r*Math.sin(2*Math.PI*i/N),z));
    function disc(cx,cy,r,z,color,mount,id,label){const ps=ring(cx,cy,r,z);points.push(...ps);const g=node('g',id?{'data-component':id,class:'pcb-solid'}:{'pointer-events':'none'});g.append(node('polygon',{points:ps.map(p=>`${p.x},${p.y}`).join(' '),fill:color,stroke:id&&id===selected?'#fff':'#102d32','stroke-width':id&&id===selected?.4:.12}));if(id)g.append(node('title',{},label));(mount==='bottom'?bottomFaces:faces).push({depth:ps.reduce((s,p)=>s+p.depth,0)/N,node:g});}
    // Screw head as a shaded N-gon prism standing on the mounting face.
    function cylinder(cx,cy,r,z,height,color,id,label,mount){
      for(let i=0;i<N;i++){const a=2*Math.PI*i/N,a2=2*Math.PI*(i+1)/N,ps=[[a,z],[a2,z],[a2,z+height],[a,z+height]].map(([t,zz])=>project(cx+r*Math.cos(t),cy+r*Math.sin(t),zz));points.push(...ps);
        const g=node('g',{'data-component':id,class:'pcb-solid'}),pts=ps.map(p=>`${p.x},${p.y}`).join(' ');g.append(node('polygon',{points:pts,fill:color,stroke:color,'stroke-width':.05}),node('polygon',{points:pts,fill:'#000',opacity:.12+.28*(.5+.5*Math.cos((a+a2)/2+yaw)),'pointer-events':'none'}),node('title',{},label));
        (mount==='bottom'?bottomFaces:faces).push({depth:ps.reduce((s,p)=>s+p.depth,0)/4,node:g});}
      disc(cx,cy,r,mount==='bottom'?z:z+height,'#c3ccd5',mount,id,label);
    }
    for(const p of P.state.placements){
      const c=P.component(p.componentId);if(!c)continue;
      const model=P.connectorModel(c,b.thickness);
      if(model){
        // Each part is a convex solid: cull faces pointing away from the camera, then paint parts back to front.
        const mount=p.side||'top',t=b.thickness,mz=z=>mount==='bottom'?t-z:z,frame=P.connectorFrame(p,model),label=`${c.name}\n${c.packageSpec||c.type}\n佔位 ${p.width} × ${p.height} mm`;
        const W=(u,v,z)=>{const q=frame.map(u,v);return [q.x,q.y,mz(z)];},view=[Math.sin(yaw)*Math.sin(tilt),Math.cos(yaw)*Math.sin(tilt),Math.cos(tilt)];
        const solids=[];
        for(const part of model.parts){
          const faces3=[],add=(pts,color,shade,decal=false,line=false)=>faces3.push({pts,color,shade,decal,line});
          if(part.type==='box'){const {u0,u1,v0,v1,z0,z1}=part,V=[[u0,v0,z0],[u1,v0,z0],[u1,v1,z0],[u0,v1,z0],[u0,v0,z1],[u1,v0,z1],[u1,v1,z1],[u0,v1,z1]].map(q=>W(...q));
            [[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]].forEach((idx,i)=>add(idx.map(k=>V[k]),part.color,[.4,.22,.38,.15,.3,0][i]));}
          else if(part.type==='hcyl'){const n=24,ang=i=>2*Math.PI*i/n,ring=(v,r=part.r)=>Array.from({length:n},(_,i)=>W(r*Math.cos(ang(i)),v,part.zc+r*Math.sin(ang(i))));
            const A=ring(part.v0),B=ring(part.v1);
            for(let i=0;i<n;i++){const j=(i+1)%n;add([A[i],A[j],B[j],B[i]],part.color,.06+.32*(.5-.5*Math.sin(ang(i+.5))));}
            add([...A].reverse(),part.color,.25);add(B,part.color,.15);
            add(ring(part.v1-.01,part.dielectric),'#f2f0ea',0,true);add(ring(part.v1-.02,part.pin),'#f0cf73',0,true);
            for(let v=part.v0-part.thread;v>part.v1+1e-6;v-=part.thread){const R=ring(v,part.r*1.003);for(let i=0;i<n;i++)add([R[i],R[(i+1)%n]],'#7a5c1e',0,true,{quad:i});}}
          else if(part.type==='vcyl'){const n=24,ang=i=>2*Math.PI*i/n,ring=(z,r)=>Array.from({length:n},(_,i)=>W(part.uc+r*Math.cos(ang(i)),part.vc+r*Math.sin(ang(i)),z));
            const A=ring(part.z0,part.r),B=ring(part.z1,part.r);
            for(let i=0;i<n;i++){const j=(i+1)%n;add([A[i],A[j],B[j],B[i]],part.color,.1+.28*(.5+.5*Math.cos(ang(i+.5)+yaw)));}
            add([...A].reverse(),part.color,.3);add(B,part.color,0);add(ring(part.z1+.005,part.inner),'#2b3138',0,true);add(ring(part.z1+.01,part.pin),'#f0cf73',0,true);}
          const all=faces3.filter(f=>!f.line).flatMap(f=>f.pts),centre=[0,1,2].map(k=>all.reduce((sum,q)=>sum+q[k],0)/all.length);
          const facing=pts=>{const [a,b2,c2]=pts,u=[0,1,2].map(k=>b2[k]-a[k]),w=[0,1,2].map(k=>c2[k]-a[k]),nrm=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],mid=[0,1,2].map(k=>pts.reduce((sum,q)=>sum+q[k],0)/pts.length);
            const out=nrm[0]*(mid[0]-centre[0])+nrm[1]*(mid[1]-centre[1])+nrm[2]*(mid[2]-centre[2]);return Math.sign(out||1)*(nrm[0]*view[0]+nrm[1]*view[1]+nrm[2]*view[2])>1e-9;};
          const sideVisible=faces3.filter(f=>!f.decal&&f.pts.length===4).map(f=>facing(f.pts));
          const shown=faces3.filter(f=>f.line?sideVisible[f.line.quad]:facing(f.pts));
          const projected=all.map(q=>project(...q));points.push(...projected);
          solids.push({zc:part.type==='hcyl'?part.zc:part.type==='pad'?part.z:(part.z0+part.z1)/2,depth:projected.reduce((sum,q)=>sum+q.depth,0)/projected.length,shown,name:part.name});
        }
        for(const top of [true,false]){
          const mine=solids.filter(sd=>sd.shown.length&&(mz(sd.zc)>=t/2-1e-6)===top).sort((a,q)=>a.depth-q.depth);if(!mine.length)continue;
          const g=node('g',{'data-component':c.id,class:'pcb-solid pcb-connector-3d'});
          for(const sd of mine)for(const f of [...sd.shown.filter(f=>!f.decal),...sd.shown.filter(f=>f.decal)]){
            const pts=f.pts.map(q=>project(...q)),poly=pts.map(q=>`${q.x},${q.y}`).join(' ');
            if(f.line){g.append(node('line',{x1:pts[0].x,y1:pts[0].y,x2:pts[1].x,y2:pts[1].y,stroke:f.color,'stroke-width':.05,'pointer-events':'none'}));continue;}
            g.append(node('polygon',{points:poly,fill:f.color,stroke:c.id===selected?'#fff':f.decal?'none':'#3d2f10','stroke-width':c.id===selected?.2:.035}));
            if(f.shade)g.append(node('polygon',{points:poly,fill:'#000',opacity:f.shade,'pointer-events':'none'}));
          }
          g.append(node('title',{},label));
          (top?faces:bottomFaces).push({depth:mine.reduce((sum,sd)=>sum+sd.depth,0)/mine.length,node:g});
        }
        continue;
      }
      if(P.isScrewHole(c)){const cx=p.x+p.width/2,cy=p.y+p.height/2,mount=p.side||'top',label=`${c.name}\n${P.packageLabel(c)} · 墊 Ø${c.padDiameter} mm\n螺絲頭高 ${c.icThickness} mm`;
        for(const face of ['top','bottom']){const z=face==='top'?b.thickness+.01:-.01;disc(cx,cy,c.padDiameter/2,z,c.plated?'#c9a64a':'#1d4a3d',face,null);if(face!==mount)disc(cx,cy,c.holeDiameter/2,face==='top'?z+.005:z-.005,'#05100d',face,null);}
        cylinder(cx,cy,c.padDiameter*.45,mount==='bottom'?-c.icThickness-.01:b.thickness+.01,c.icThickness,'#8f9ba7',c.id,label,mount);continue;}
      const geometry=P.icGeometry(c),body=P.icRect(geometry.body,c,p.rotation),label=`${c.name}\n${c.icPackage==='Custom'?(c.packageSpec||'自訂'):c.icPackage}${['SOT','TQFP'].includes(c.icPackage)?' · '+c.icPinCount+' pins':''}\n${c.icWidth} × ${c.icHeight} × ${c.icThickness} mm`;
      const mount=p.side||'top',z=mount==='bottom'?-c.icThickness:b.thickness;
      box(p.x+body.x,p.y+body.y,body.w,body.h,z,c.icThickness,'#111111',c.id,label,false,mount);
      geometry.pads.forEach((pad,index)=>{const r=P.icRect(pad,c,p.rotation);const leadHeight=Math.min(.25,c.icThickness*.35);box(p.x+r.x,p.y+r.y,r.w,r.h,mount==='bottom'?-leadHeight:b.thickness,leadHeight,'#bbc3cc',c.id,`${c.name} · ${c.icPackage} lead ${index+1}`,true,mount);});
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
      if(name==='board'){
        const keepouts=node('g',{'data-layer':'keepouts','pointer-events':'none'}),face=above?'top':'bottom',z=above?b.thickness+.03:-.03;
        for(const placement of P.state.placements)for(const area of P.boardRules.zones(placement,P.component(placement.componentId)).filter(a=>a.side===face)){
          const corners=[[area.x,area.y],[area.x+area.w,area.y],[area.x+area.w,area.y+area.h],[area.x,area.y+area.h]].map(([x,y])=>project(x,y,z));
          const poly=node('polygon',{points:corners.map(p=>`${p.x},${p.y}`).join(' '),fill:area.kind==='same'?'#f5b85b':'#d68df1','fill-opacity':.12,stroke:area.kind==='same'?'#f5b85b':'#d68df1','stroke-width':.3,'stroke-dasharray':'1 .8'});keepouts.append(poly);
        }
        if(keepouts.childNodes.length)svg.append(keepouts);
      }

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
