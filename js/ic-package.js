(function(P){
  'use strict';
  // All geometry fits within the configured IC envelope, including SOT leads.
  P.icGeometry=c=>{
    const w=c.icWidth,h=c.icHeight,pads=[];
    if(c.icPackage==='Hole')return {body:{x:0,y:0,w,h},pads,hole:{cx:w/2,cy:h/2,r:c.holeDiameter/2,pad:c.padDiameter/2}};
    const body=c.icPackage==='SOT'?{x:w*.18,y:0,w:w*.64,h}:c.icPackage==='TQFP'?{x:w*.18,y:h*.18,w:w*.64,h:h*.64}:{x:0,y:0,w,h};
    if(c.icPackage==='SOT')for(let i=0;i<c.icPinCount/2;i++){
      const pitch=h/(c.icPinCount/2+1),height=pitch*.45,y=(i+1)*pitch-height/2;
      pads.push({x:0,y,w:w*.22,h:height},{x:w*.78,y,w:w*.22,h:height});
    }
    if(c.icPackage==='TQFP')for(let i=0;i<c.icPinCount/4;i++){
      const n=c.icPinCount/4, px=w*.64/(n+1),py=h*.64/(n+1),x=w*.18+(i+1)*px,y=h*.18+(i+1)*py;
      pads.push({x:x-px*.225,y:0,w:px*.45,h:h*.22},{x:x-px*.225,y:h*.78,w:px*.45,h:h*.22},{x:0,y:y-py*.225,w:w*.22,h:py*.45},{x:w*.78,y:y-py*.225,w:w*.22,h:py*.45});
    }
    return {body,pads};
  };
  P.icRect=(r,c,rotation)=>{
    if(rotation===90)return {x:c.icHeight-r.y-r.h,y:r.x,w:r.h,h:r.w};
    if(rotation===180)return {x:c.icWidth-r.x-r.w,y:c.icHeight-r.y-r.h,w:r.w,h:r.h};
    if(rotation===270)return {x:r.y,y:c.icWidth-r.x-r.w,w:r.h,h:r.w};
    return {...r};
  };
})(window.Planner);
(function(P){
  'use strict';
  // Realistic planning models for RF connectors, shared by the 2D and 3D placement views.
  // Local frame: u across the part, v into the board (SMA: v=0 is the board edge, barrel at v<0;
  // IPEX: origin at the footprint centre). z is absolute for a top-mounted part (board top = t);
  // a bottom-mounted part mirrors z about the board centre (z' = t - z).
  const GOLD='#d9b45a',GOLD_DARK='#b8923c',COPPER='#c98a4b',STEEL='#c9cfd6',PTFE='#f2f0ea',LCP='#e6dcc2';
  P.rfConnectorKind=c=>c?.type==='SMA Edge Mount'?'sma':c?.type==='IPEX'?'ipex':null;
  P.connectorModel=(c,t)=>{
    const kind=P.rfConnectorKind(c);if(!kind)return null;
    if(kind==='sma'){
      const w=c.icWidth,L=c.icHeight,s=w/6.35,tc=t/2,leg=Math.min(1.35*s,w/3),flange=1.6*s,barrel=6.4*s,r=2.9*s;
      return {kind,origin:'edge',overhang:flange+barrel,parts:[
        {type:'pad',u0:-w/2-.15,u1:-w/2+leg+.15,v0:0,v1:L+.15,z:t,color:COPPER},{type:'pad',u0:w/2-leg-.15,u1:w/2+.15,v0:0,v1:L+.15,z:t,color:COPPER},
        {type:'pad',u0:-.55*s,u1:.55*s,v0:0,v1:Math.min(L,3.4*s)+.15,z:t,color:COPPER},
        {type:'pad',u0:-w/2-.15,u1:-w/2+leg+.15,v0:0,v1:L+.15,z:0,color:COPPER},{type:'pad',u0:w/2-leg-.15,u1:w/2+.15,v0:0,v1:L+.15,z:0,color:COPPER},
        {type:'box',name:'GND leg',u0:-w/2,u1:-w/2+leg,v0:0,v1:L,z0:t,z1:t+.5*s,color:GOLD},{type:'box',name:'GND leg',u0:w/2-leg,u1:w/2,v0:0,v1:L,z0:t,z1:t+.5*s,color:GOLD},
        {type:'box',name:'GND leg',u0:-w/2,u1:-w/2+leg,v0:0,v1:L,z0:-.5*s,z1:0,color:GOLD},{type:'box',name:'GND leg',u0:w/2-leg,u1:w/2,v0:0,v1:L,z0:-.5*s,z1:0,color:GOLD},
        {type:'box',name:'Center pin',u0:-.38*s,u1:.38*s,v0:-.2,v1:Math.min(L,3.4*s),z0:t,z1:t+.3*s,color:'#f0cf73'},
        {type:'box',name:'Flange',u0:-w/2,u1:w/2,v0:-flange,v1:0,z0:tc-w/2,z1:tc+w/2,color:GOLD_DARK},
        {type:'hcyl',name:'Threaded barrel 1/4"-36',r,v0:-flange,v1:-flange-barrel,zc:tc,color:GOLD,thread:.706*s,dielectric:2.05*s,pin:.64*s}
      ]};
    }
    const w=c.icWidth,h=c.icHeight,s=Math.min(w/3,h/2.6);
    return {kind,origin:'center',overhang:0,parts:[
      {type:'pad',u0:-1.55*s,u1:-.95*s,v0:-1.15*s,v1:1.15*s,z:t,color:COPPER},{type:'pad',u0:.95*s,u1:1.55*s,v0:-1.15*s,v1:1.15*s,z:t,color:COPPER},{type:'pad',u0:-.4*s,u1:.4*s,v0:.85*s,v1:1.35*s,z:t,color:COPPER},
      {type:'box',name:'GND tab',u0:-1.5*s,u1:-1*s,v0:-1.05*s,v1:1.05*s,z0:t,z1:t+.2*s,color:STEEL},{type:'box',name:'GND tab',u0:1*s,u1:1.5*s,v0:-1.05*s,v1:1.05*s,z0:t,z1:t+.2*s,color:STEEL},
      {type:'box',name:'Signal tab',u0:-.3*s,u1:.3*s,v0:.9*s,v1:1.3*s,z0:t,z1:t+.15*s,color:'#f0cf73'},
      {type:'box',name:'LCP base',u0:-1*s,u1:1*s,v0:-1.3*s,v1:1*s,z0:t,z1:t+.45*s,color:LCP},
      {type:'vcyl',name:'Socket shell',uc:0,vc:-.15*s,r:1*s,z0:t+.45*s,z1:t+Math.max(.5*s,c.icThickness),color:STEEL,inner:.62*s,pin:.2*s}
    ]};
  };
  // Transform from the connector's local frame to board XY for a placement p (size from footprint).
  P.connectorFrame=(p,model)=>{
    const rot=p.rotation||0,s=rot%180?{w:p.height,h:p.width}:{w:p.width,h:p.height};
    const origin=model.origin==='center'?{x:p.x+s.w/2,y:p.y+s.h/2}:rot===0?{x:p.x+s.w/2,y:p.y}:rot===90?{x:p.x+s.w,y:p.y+s.h/2}:rot===180?{x:p.x+s.w/2,y:p.y+s.h}:{x:p.x,y:p.y+s.h/2};
    const a=rot*Math.PI/180,cos=Math.round(Math.cos(a)),sin=Math.round(Math.sin(a));
    return {origin,rot,map:(u,v)=>({x:origin.x+u*cos-v*sin,y:origin.y+u*sin+v*cos})};
  };
})(window.Planner);
