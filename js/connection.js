(function(P){
  'use strict';
  const svg=document.getElementById('canvas'),layer=document.getElementById('connections'),preview=document.getElementById('connection-preview');
  const ns='http://www.w3.org/2000/svg',nodes=new Map();
  function element(tag,attrs={},text){const node=document.createElementNS(ns,tag);attributes(node,attrs);if(text!==undefined)node.textContent=text;return node;}
  function attributes(node,attrs){Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));}
  function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  P.svg={element,attributes,point};
  function draw(edge){
    const route=P.geometry.route(edge);if(!route)return;
    let group=nodes.get(edge.id);
    if(!group){
      group=element('g',{class:'connection','data-edge-id':edge.id,tabindex:0,role:'button'});
      group.append(element('path',{class:'edge-halo'}),element('path',{class:'edge-line','marker-end':'url(#arrow)'}),element('path',{class:'edge-core'}),element('path',{class:'edge-hit'}),element('text',{class:'edge-label','text-anchor':'middle'}),element('title'));
      layer.append(group);nodes.set(edge.id,group);
    }
    group.querySelectorAll('path').forEach(path=>path.setAttribute('d',route.d));
    group.style.setProperty('--edge-color',P.interfaceColors[edge.interfaceType]);
    group.classList.toggle('selected',P.isSelected(edge.id,'connection'));
    group.classList.toggle('differential',['PCIe','SerDes'].includes(edge.interfaceType));
    group.classList.toggle('heavy',['RF','Power'].includes(edge.interfaceType));
    group.classList.toggle('clock',edge.interfaceType==='Clock');
    const label=group.querySelector('.edge-label');attributes(label,{x:route.label.x,y:route.label.y});label.textContent=edge.label;
    const description=`${P.component(edge.source.componentId).name} → ${P.component(edge.target.componentId).name}: ${edge.label||edge.interfaceType}`;
    group.setAttribute('aria-label',description);group.querySelector('title').textContent=description;
  }
  function reconcile(){const ids=new Set(P.state.connections.map(e=>e.id));nodes.forEach((g,id)=>{if(!ids.has(id)){g.remove();nodes.delete(id);}});P.state.connections.forEach(draw);}
  reconcile();
  P.subscribe(({type,id})=>{
    if(['connection-add','connection-remove','remove','ports','clear','project-load'].includes(type))reconcile();
    else if(['move','resize','update'].includes(type))P.state.connections.filter(e=>e.source.componentId===id||e.target.componentId===id).forEach(draw);
    else if(type==='connection-update'){const edge=P.connection(id);if(edge)draw(edge);}
    else if(type==='selection')nodes.forEach((g,key)=>g.classList.toggle('selected',P.isSelected(key,'connection')));
    if(type==='mode'||type==='tab'||type==='remove'||type==='ports')cancel();
  });
  let pending=null;
  function endpointFromNode(node){const p=node?.closest?.('.connection-point');return p?{componentId:p.dataset.componentId,portId:p.dataset.portId||null,anchor:p.dataset.side}:null;}
  function targetAt(e){
    const node=document.elementFromPoint(e.clientX,e.clientY),endpoint=endpointFromNode(node);if(endpoint)return endpoint;
    const block=node?.closest?.('.block');if(!block)return null;
    const c=P.component(block.dataset.id),p=point(e);
    return P.sides.map(anchor=>({componentId:c.id,portId:null,anchor})).sort((a,b)=>{const aa=P.geometry.anchor(a),bb=P.geometry.anchor(b);return Math.hypot(aa.x-p.x,aa.y-p.y)-Math.hypot(bb.x-p.x,bb.y-p.y);})[0];
  }
  function cancel(){pending=null;preview.setAttribute('d','');svg.classList.remove('connecting');svg.querySelectorAll('.source-point').forEach(n=>n.classList.remove('source-point'));}
  function complete(target){
    if(!pending)return;const source=pending.source;cancel();
    const edge=P.addConnection(source,target);if(edge)P.select(edge.id,'connection');
  }
  function begin(source,e){
    if(pending){complete(source);return;}
    pending={source,start:{x:e.clientX,y:e.clientY},moved:false};
    svg.classList.add('connecting');e.target?.closest?.('.connection-point')?.classList.add('source-point');
    const a=P.geometry.anchor(source);preview.setAttribute('d',`M ${a.x} ${a.y} L ${a.x+20} ${a.y}`);
  }
  function move(e){
    if(!pending)return;const a=P.geometry.anchor(pending.source);if(!a){cancel();return;}
    if(Math.hypot(e.clientX-pending.start.x,e.clientY-pending.start.y)>5)pending.moved=true;
    const b=point(e),midX=(a.x+b.x)/2;preview.setAttribute('d',`M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`);
  }
  function release(e){if(!pending||!pending.moved)return;const target=targetAt(e);if(target)complete(target);else cancel();}
  P.connectionUI={begin,move,release,cancel,complete,endpointFromNode,targetAt,isPending:()=>!!pending};
})(window.Planner);

