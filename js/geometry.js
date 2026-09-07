(function(P){
  'use strict';
  const normals={left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}};
  function rotate(p,degrees){const a=degrees*Math.PI/180;return{x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)};}
  function world(c,p){const q=rotate({x:p.x-c.width/2,y:p.y-c.height/2},c.rotation);return{x:c.x+c.width/2+q.x,y:c.y+c.height/2+q.y};}
  function local(c,p){const q=rotate({x:p.x-c.x-c.width/2,y:p.y-c.y-c.height/2},-c.rotation);return{x:q.x+c.width/2,y:q.y+c.height/2};}
  function anchorLocal(end,edgeId){
    const c=P.component(end.componentId),port=P.port(end.portId);if(!c)return null;
    const side=port?.side||end.anchor,ports=P.componentPorts(c.id).filter(p=>p.side===side);
    const index=end.portId?ports.findIndex(p=>p.id===end.portId)+1:0,count=ports.length+1;
    const length=side==='left'||side==='right'?c.height:c.width;
    let along=length*(index+1)/(count+1);
    if(!end.portId&&edgeId){
      const peers=P.state.connections.filter(e=>[e.source,e.target].some(p=>p.componentId===c.id&&!p.portId&&p.anchor===side));
      const i=peers.findIndex(e=>e.id===edgeId);
      if(i>=0)along+=(i-(peers.length-1)/2)*Math.min(10,length/(count+1)/Math.max(1,peers.length));
    }
    return {x:side==='left'?0:side==='right'?c.width:along,y:side==='top'?0:side==='bottom'?c.height:along,side};
  }
  function anchor(end,edgeId){const c=P.component(end.componentId),p=anchorLocal(end,edgeId);if(!p)return null;const point=world(c,p),n=rotate(normals[p.side],c.rotation);return{...point,nx:Math.round(n.x),ny:Math.round(n.y)};}
  // Treat reverse edges as part of the same bundle. IDs and local anchors,
  // rather than rendered coordinates, keep lane membership stable on resize.
  function parallelEdges(edge){
    const key=end=>JSON.stringify([end.componentId,end.portId,P.port(end.portId)?.side||end.anchor]);
    const pair=e=>[key(e.source),key(e.target)].sort().join('|');
    const group=pair(edge);return P.state.connections.filter(e=>pair(e)===group);
  }
  function route(edge){
    const a=anchor(edge.source,edge.id),b=anchor(edge.target,edge.id);if(!a||!b)return null;
    let points=[a,b];
    const parallel=parallelEdges(edge),index=parallel.findIndex(e=>e.id===edge.id);
    const offset=(index-(parallel.length-1)/2)*24;
    if(parallel.length>1&&edge.routingStyle==='straight'){
      // Small end fans keep shared engineering pins exact, with separate
      // straight central segments even when both endpoints are identical.
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
      const direction=edge.source.componentId<edge.target.componentId?1:-1;
      const ox=-dy/length*offset*direction,oy=dx/length*offset*direction;
      points=[a,{x:a.x+dx*.2+ox,y:a.y+dy*.2+oy},{x:a.x+dx*.8+ox,y:a.y+dy*.8+oy},b];
    }else if(parallel.length>1){
      const facing=a.nx&&b.nx&&a.nx!==b.nx&&(b.x-a.x)*a.nx>0;
      const verticalFacing=a.ny&&b.ny&&a.ny!==b.ny&&(b.y-a.y)*a.ny>0;
      const gap=facing?Math.min(22,Math.abs(b.x-a.x)/3):verticalFacing?Math.min(22,Math.abs(b.y-a.y)/3):22+index*12;
      const s={x:a.x+a.nx*gap,y:a.y+a.ny*gap},t={x:b.x+b.nx*gap,y:b.y+b.ny*gap};
      if(a.nx&&b.nx){const y=(a.y+b.y)/2+offset;points=[a,s,{x:s.x,y},{x:t.x,y},t,b];}
      else if(a.ny&&b.ny){const x=(a.x+b.x)/2+offset;points=[a,s,{x,y:s.y},{x,y:t.y},t,b];}
      else {
        const x=(s.x+t.x)/2+offset,y=(s.y+t.y)/2+offset;
        points=a.nx?[a,s,{x,y:s.y},{x,y},{x:t.x,y},t,b]:[a,s,{x:s.x,y},{x,y},{x,y:t.y},t,b];
      }
    }else if(edge.routingStyle!=='straight'){
      const siblings=P.state.connections.filter(e=>e.source.componentId===edge.source.componentId&&e.source.anchor===edge.source.anchor);
      const lane=Math.max(0,siblings.findIndex(e=>e.id===edge.id));
      // Distinct ports facing across a narrow gap must stay in that gap;
      // increasing the branch index must not send later signals around a block.
      const horizontalFacing=a.nx&&b.nx&&a.nx!==b.nx&&(b.x-a.x)*a.nx>0;
      const verticalFacing=a.ny&&b.ny&&a.ny!==b.ny&&(b.y-a.y)*a.ny>0;
      const gap=Math.min(22+lane*8,horizontalFacing?Math.abs(b.x-a.x)/3:verticalFacing?Math.abs(b.y-a.y)/3:Infinity);
      const s={x:a.x+a.nx*gap,y:a.y+a.ny*gap},t={x:b.x+b.nx*gap,y:b.y+b.ny*gap};
      let bends;
      if(a.nx&&b.nx){
        const facing=a.nx!==b.nx&&(b.x-a.x)*a.nx>gap*2;
        const x=facing?(s.x+t.x)/2:a.nx===b.nx?(a.nx>0?Math.max(s.x,t.x):Math.min(s.x,t.x)):(s.x+t.x)/2;
        bends=[{x,y:s.y},{x,y:t.y}];
        if(!facing&&a.nx!==b.nx){const y=Math.min(a.y,b.y)-60-gap;bends=[{x:s.x,y},{x:t.x,y}];}
      }else if(a.ny&&b.ny){
        const facing=a.ny!==b.ny&&(b.y-a.y)*a.ny>gap*2;
        const y=facing?(s.y+t.y)/2:a.ny===b.ny?(a.ny>0?Math.max(s.y,t.y):Math.min(s.y,t.y)):(s.y+t.y)/2;
        bends=[{x:s.x,y},{x:t.x,y}];
        if(!facing&&a.ny!==b.ny){const x=Math.max(a.x,b.x)+60+gap;bends=[{x,y:s.y},{x,y:t.y}];}
      }else bends=a.nx?[{x:t.x,y:s.y}]:[{x:s.x,y:t.y}];
      points=[a,s,...bends,t,b];
    }
    points=points.filter((p,i)=>i===0||Math.abs(p.x-points[i-1].x)+Math.abs(p.y-points[i-1].y)>.01);
    const segments=points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(p.x-points[i].x,p.y-points[i].y)}));
    const longest=segments.reduce((best,s)=>s.length>best.length?s:best,segments[0]);
    const label=longest?{x:(longest.a.x+longest.b.x)/2,y:(longest.a.y+longest.b.y)/2-7}:{x:a.x,y:a.y};
    return {points,label,d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')};
  }
  function resize(original,handle,delta,snap=true,min={width:180,height:112}){
    const d=rotate(delta,-original.rotation),round=n=>snap?Math.round(n/20)*20:n;
    let left=0,top=0,right=original.width,bottom=original.height;
    if(handle.includes('w'))left=Math.min(original.width-min.width,round(d.x));
    if(handle.includes('e'))right=Math.max(min.width,round(original.width+d.x));
    if(handle.includes('n'))top=Math.min(original.height-min.height,round(d.y));
    if(handle.includes('s'))bottom=Math.max(min.height,round(original.height+d.y));
    const width=right-left,height=bottom-top;
    const shift=rotate({x:(left+right-original.width)/2,y:(top+bottom-original.height)/2},original.rotation);
    return{x:original.x+original.width/2+shift.x-width/2,y:original.y+original.height/2+shift.y-height/2,width,height};
  }
  P.geometry={rotate,world,local,anchorLocal,anchor,route,resize,parallelEdges};
})(window.Planner);
