(function(P){
  'use strict';
  const svg=document.getElementById('canvas'),{element,attributes,point}=P.svg;
  const rectangle=element('rect',{class:'selection-box',hidden:''});svg.append(rectangle);
  let gesture=null;
  const selectable=node=>{
    const block=node.closest('.block');if(block)return{id:block.dataset.id,kind:'component'};
    const edge=node.closest('.connection');if(edge)return{id:edge.dataset.edgeId,kind:'connection'};
    const line=node.closest('.free-line');if(line)return{id:line.dataset.lineId,kind:'line'};
    const textBox=node.closest('.text-box');return textBox?{id:textBox.dataset.textId,kind:'text'}:null;
  };
  function inBox(box){
    const inside=p=>p.x>=box.x&&p.x<=box.x+box.width&&p.y>=box.y&&p.y<=box.y+box.height,items=[];
    for(const c of P.state.components)if([{x:0,y:0},{x:c.width,y:0},{x:0,y:c.height},{x:c.width,y:c.height}].every(p=>inside(P.geometry.world(c,p))))items.push({id:c.id,kind:'component'});
    for(const l of P.state.lines)if(inside({x:l.x1,y:l.y1})&&inside({x:l.x2,y:l.y2}))items.push({id:l.id,kind:'line'});
    for(const box of P.state.textBoxes)if(inside({x:box.x,y:box.y})&&inside({x:box.x+box.width,y:box.y+box.height}))items.push({id:box.id,kind:'text'});
    for(const e of P.state.connections)if(P.geometry.route(e)?.points.every(inside))items.push({id:e.id,kind:'connection'});
    return items;
  }
  function restore(){
    if(gesture?.kind==='group')for(const item of gesture.originals){if(item.kind==='component'&&P.component(item.data.id))P.update(item.data.id,{x:item.data.x,y:item.data.y},'move');if(item.kind==='line'&&P.line(item.data.id))P.updateLine(item.data.id,item.data);if(item.kind==='text'&&P.textBox(item.data.id))P.updateTextBox(item.data.id,item.data);}
    gesture=null;rectangle.setAttribute('hidden','');
  }
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0||P.ui.mode!=='select'||P.connectionUI.isPending())return;
    if(e.target.closest('.connection-point,.resize-handle,.rotation-handle,.line-handle'))return;
    const item=selectable(e.target),additive=e.shiftKey||e.ctrlKey||e.metaKey;
    if(item){
      if(additive){e.preventDefault();e.stopImmediatePropagation();P.selectMany(P.isSelected(item.id,item.kind)?P.ui.selection.filter(s=>s.id!==item.id):[...P.ui.selection,item]);return;}
      if(P.ui.selection.length<2||!P.isSelected(item.id,item.kind))return;
      if(item.kind==='connection'){e.preventDefault();e.stopImmediatePropagation();return;}
      gesture={kind:'group',start:point(e),originals:P.ui.selection.filter(s=>s.kind!=='connection').map(s=>({kind:s.kind,data:{...(s.kind==='component'?P.component(s.id):s.kind==='line'?P.line(s.id):P.textBox(s.id))}}))};
    }else{
      gesture={kind:'box',start:point(e),base:additive?[...P.ui.selection]:[]};
      if(!additive)P.select(null);
      attributes(rectangle,{x:gesture.start.x,y:gesture.start.y,width:0,height:0});rectangle.removeAttribute('hidden');
    }
    e.preventDefault();e.stopImmediatePropagation();svg.focus();svg.setPointerCapture(e.pointerId);
  },true);
  svg.addEventListener('pointermove',e=>{
    if(!gesture)return;e.stopImmediatePropagation();const p=point(e);
    if(gesture.kind==='box'){
      const box={x:Math.min(p.x,gesture.start.x),y:Math.min(p.y,gesture.start.y),width:Math.abs(p.x-gesture.start.x),height:Math.abs(p.y-gesture.start.y)};
      attributes(rectangle,box);P.selectMany([...gesture.base,...inBox(box)]);
    }else{
      const snap=n=>P.ui.snap?Math.round(n/20)*20:n,dx=snap(p.x-gesture.start.x),dy=snap(p.y-gesture.start.y);
      for(const {kind,data:o} of gesture.originals){if(kind==='component')P.update(o.id,{x:o.x+dx,y:o.y+dy},'move');else if(kind==='line')P.updateLine(o.id,{x1:o.x1+dx,y1:o.y1+dy,x2:o.x2+dx,y2:o.y2+dy});else P.updateTextBox(o.id,{x:o.x+dx,y:o.y+dy});}
    }
  },true);
  svg.addEventListener('pointerup',e=>{if(!gesture)return;e.stopImmediatePropagation();gesture=null;rectangle.setAttribute('hidden','');},true);
  svg.addEventListener('pointercancel',restore);
  P.subscribe(({type})=>{if(['mode','tab','clear'].includes(type))restore();});
})(window.Planner);
