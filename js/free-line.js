(function(P){
  'use strict';
  const svg=document.getElementById('canvas'),layer=document.getElementById('free-lines');
  const {element,attributes,point}=P.svg,nodes=new Map();
  const preview=element('path',{class:'free-line-preview'});layer.append(preview);
  let gesture=null;
  function draw(line){
    let node=nodes.get(line.id);
    if(!node){
      node=element('g',{class:'free-line','data-line-id':line.id,tabindex:0,role:'button'});
      node.append(element('path',{class:'free-line-halo'}),element('path',{class:'free-line-stroke'}),element('path',{class:'free-line-hit'}),element('text',{class:'free-line-label','text-anchor':'middle'}));
      for(const end of ['start','end'])node.append(element('circle',{class:'line-handle','data-line-end':end,r:7}));
      nodes.set(line.id,node);layer.append(node);
    }
    const d=`M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`;
    node.querySelectorAll('path').forEach(path=>path.setAttribute('d',d));
    attributes(node.querySelector('.free-line-stroke'),{'marker-start':['start','both'].includes(line.arrows)?'url(#arrow)':'none','marker-end':['end','both'].includes(line.arrows)?'url(#arrow)':'none'});
    attributes(node.querySelector('[data-line-end="start"]'),{cx:line.x1,cy:line.y1});attributes(node.querySelector('[data-line-end="end"]'),{cx:line.x2,cy:line.y2});
    const label=node.querySelector('text');attributes(label,{x:(line.x1+line.x2)/2,y:(line.y1+line.y2)/2-9});label.textContent=line.label;
    node.classList.toggle('selected',P.isSelected(line.id,'line'));node.setAttribute('aria-label',line.label||'Free line');
  }
  function cancel(){
    if(gesture?.kind==='edit'&&P.line(gesture.id))P.updateLine(gesture.id,gesture.original);
    gesture=null;preview.setAttribute('d','');
  }
  function position(e){const p=point(e),snap=n=>Math.round(n/(P.ui.snap?20:1))*(P.ui.snap?20:1);return{x:snap(p.x),y:snap(p.y)};}
  function finish(p){
    const first=gesture.start;gesture=null;preview.setAttribute('d','');
    const line=P.addLine({x1:first.x,y1:first.y,x2:p.x,y2:p.y});
    if(line){P.setMode('select');P.select(line.id,'line');}
  }
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const node=e.target.closest('.free-line');
    if(P.ui.mode!=='line'&&(!node||P.ui.mode!=='select'||P.connectionUI.isPending()))return;
    e.preventDefault();e.stopImmediatePropagation();const p=position(e);svg.focus();
    if(P.ui.mode==='line'){
      if(gesture?.kind==='draw'){finish(p);return;}
      P.select(null);gesture={kind:'draw',start:p,moved:false};preview.setAttribute('d',`M ${p.x} ${p.y} L ${p.x} ${p.y}`);
    }else{
      const line=P.line(node.dataset.lineId);P.select(line.id,'line');
      gesture={kind:'edit',id:line.id,original:{...line},start:p,end:e.target.dataset.lineEnd};
    }
    svg.setPointerCapture(e.pointerId);
  },true);
  svg.addEventListener('pointermove',e=>{
    if(!gesture)return;e.stopImmediatePropagation();const p=position(e);
    document.getElementById('coordinates').textContent=`X ${p.x}  Y ${p.y}`;
    if(gesture.kind==='draw'){gesture.moved=Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>=4;preview.setAttribute('d',`M ${gesture.start.x} ${gesture.start.y} L ${p.x} ${p.y}`);}
    else {
      const o=gesture.original,dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
      const changes=gesture.end==='start'?{x1:p.x,y1:p.y}:gesture.end==='end'?{x2:p.x,y2:p.y}:{x1:o.x1+dx,y1:o.y1+dy,x2:o.x2+dx,y2:o.y2+dy};
      P.updateLine(gesture.id,changes);
    }
  },true);
  svg.addEventListener('pointerup',e=>{
    if(!gesture)return;e.stopImmediatePropagation();
    if(gesture.kind==='draw'){if(gesture.moved)finish(position(e));}else gesture=null;
  },true);
  svg.addEventListener('pointercancel',cancel);
  svg.addEventListener('keydown',e=>{const node=e.target.closest('.free-line');if(node&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();P.select(node.dataset.lineId,'line');}});
  P.subscribe(({type,id})=>{
    if(type==='project-load'){
      cancel();nodes.forEach(node=>node.remove());nodes.clear();P.state.lines.forEach(draw);
    }
    else if(type==='clear'){cancel();nodes.forEach(node=>node.remove());nodes.clear();}
    if(type==='line-add'||type==='line-update')draw(P.line(id));
    if(type==='line-remove'){nodes.get(id)?.remove();nodes.delete(id);if(gesture?.id===id)cancel();}
    if(type==='selection')nodes.forEach((node,key)=>node.classList.toggle('selected',P.isSelected(key,'line')));
    if(type==='mode'||type==='tab'){cancel();svg.classList.toggle('line-mode',P.ui.mode==='line');}
  });
  P.state.lines.forEach(draw);
})(window.Planner);

