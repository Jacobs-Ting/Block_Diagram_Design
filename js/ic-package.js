(function(P){
  'use strict';
  // All geometry fits within the configured IC envelope, including SOT leads.
  P.icGeometry=c=>{
    const w=c.icWidth,h=c.icHeight,pads=[];
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
