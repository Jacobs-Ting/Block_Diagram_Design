(function(P){
  'use strict';
  const svg=document.getElementById('canvas'),background=document.getElementById('canvas-background');
  const camera={x:0,y:0,width:P.state.workspace.width,height:P.state.workspace.height};
  let pan=null,space=false;
  function apply(type='workspace-view'){
    svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    const zoom=Math.round(P.state.workspace.width/camera.width*100);
    document.getElementById('zoom-status').textContent=`ZOOM ${zoom}% · ${P.state.workspace.width} × ${P.state.workspace.height}`;
    P.notify(type);
  }
  function fit(){camera.x=0;camera.y=0;camera.width=P.state.workspace.width;camera.height=P.state.workspace.height;apply();}
  function zoom(factor,center={x:camera.x+camera.width/2,y:camera.y+camera.height/2}){
    const minWidth=Math.max(100,P.state.workspace.width/8),maxWidth=P.state.workspace.width*4;
    const next=Math.max(minWidth,Math.min(maxWidth,camera.width*factor)),ratio=next/camera.width;
    camera.x=center.x-(center.x-camera.x)*ratio;camera.y=center.y-(center.y-camera.y)*ratio;
    camera.height*=ratio;camera.width=next;apply();
  }
  function start(e){
    if(!(P.ui.mode==='pan'||e.button===1||space)||e.target.closest('button,input,select,textarea'))return;
    e.preventDefault();e.stopImmediatePropagation();pan={x:e.clientX,y:e.clientY,camera:{...camera}};svg.classList.add('panning');svg.setPointerCapture(e.pointerId);
  }
  svg.addEventListener('pointerdown',start,true);
  svg.addEventListener('pointermove',e=>{
    if(!pan)return;e.preventDefault();e.stopImmediatePropagation();
    const box=svg.getBoundingClientRect(),scaleX=pan.camera.width/(box.width||1),scaleY=pan.camera.height/(box.height||1);
    camera.x=pan.camera.x-(e.clientX-pan.x)*scaleX;camera.y=pan.camera.y-(e.clientY-pan.y)*scaleY;apply();
  },true);
  svg.addEventListener('pointerup',e=>{if(pan){e.stopImmediatePropagation();pan=null;svg.classList.remove('panning');}},true);
  svg.addEventListener('pointercancel',()=>{pan=null;svg.classList.remove('panning');});
  svg.addEventListener('wheel',e=>{e.preventDefault();const p=P.svg.point(e);zoom(e.deltaY>0?1.15:.87,p);},{passive:false});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.closest('input,textarea,select')){space=true;svg.classList.add('space-pan');e.preventDefault();}});
  document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;svg.classList.remove('space-pan');}});
  document.getElementById('zoom-in').addEventListener('click',()=>zoom(.8));
  document.getElementById('zoom-out').addEventListener('click',()=>zoom(1.25));
  document.getElementById('fit-view').addEventListener('click',fit);
  document.getElementById('apply-workspace').addEventListener('click',()=>P.resizeWorkspace(document.getElementById('workspace-width').value,document.getElementById('workspace-height').value));
  P.subscribe(({type})=>{
    if(type==='workspace-resize'||type==='project-load'){
      background.setAttribute('width',P.state.workspace.width);background.setAttribute('height',P.state.workspace.height);
      document.getElementById('workspace-width').value=P.state.workspace.width;document.getElementById('workspace-height').value=P.state.workspace.height;fit();
    }
    if(type==='clear')fit();
    if(type==='mode')svg.classList.toggle('pan-mode',P.ui.mode==='pan');
  });
  P.workspaceView={camera,fit,zoom};background.setAttribute('width',P.state.workspace.width);background.setAttribute('height',P.state.workspace.height);apply();
})(window.Planner);
