(function(P){
  'use strict';
  const $=id=>document.getElementById(id),svg=$('pcb-canvas'),NS='http://www.w3.org/2000/svg';
  let selected=null,drag=null;
  const find=id=>P.state.placements.find(p=>p.componentId===id);
  const size=p=>p.rotation%180?{w:p.height,h:p.width}:{w:p.width,h:p.height};
  function node(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function clamp(p){const {w,h}=size(p);p.x=Math.max(0,Math.min(p.x,P.state.board.width-w));p.y=Math.max(0,Math.min(p.y,P.state.board.height-h));}
  function changed(){P.notify('placement-update');}
  function place(id){if(find(id)||!P.component(id))return;const c=P.component(id);if(c.icWidth>P.state.board.width||c.icHeight>P.state.board.height){$('placement-message').textContent=`${c.name} 的 IC 尺寸超出電路板，請增加板尺寸。`;return;}const n=P.state.placements.length,p={id:P.uuid(),componentId:id,x:4+(n%8)*18,y:4+Math.floor(n/8)*18,width:P.component(id).icWidth,height:P.component(id).icHeight,rotation:0};P.state.placements.push(p);clamp(p);selected=id;changed();}
  function overlaps(a,b){const x=size(a),y=size(b);return a.x<b.x+y.w&&a.x+x.w>b.x&&a.y<b.y+y.h&&a.y+x.h>b.y;}
  function render(){
    const board=P.state.board;$('board-width').value=board.width;$('board-height').value=board.height;$('board-thickness').value=board.thickness;P.pcb3d.render(selected);
    const tallest=Math.max(0,...P.state.placements.map(p=>P.component(p.componentId)?.icThickness||0));$('height-summary').textContent=`最高 IC：${tallest} mm · 整體高度（板底至 IC 頂）：${Number((board.thickness+tallest).toFixed(3))} mm`; 
    svg.setAttribute('viewBox',`-5 -5 ${board.width+10} ${board.height+10}`);
    for(const id of ['pcb-board','pcb-dots']){ $(id).setAttribute('width',board.width);$(id).setAttribute('height',board.height); }
    const parts=$('pcb-parts'),nets=$('pcb-nets');parts.replaceChildren();nets.replaceChildren();
    const collisions=new Set();for(const a of P.state.placements)for(const b of P.state.placements)if(a!==b&&overlaps(a,b))collisions.add(a.componentId);
    if($('show-ratsnest').checked)for(const e of P.state.connections){const a=find(e.source.componentId),b=find(e.target.componentId);if(!a||!b)continue;const x=size(a),y=size(b);const l=node('line',{x1:a.x+x.w/2,y1:a.y+x.h/2,x2:b.x+y.w/2,y2:b.y+y.h/2,stroke:P.interfaceColors[e.interfaceType]||'#aaa','stroke-width':.25,'stroke-dasharray':'1 1'});l.append(node('title',{},e.label||e.interfaceType));nets.append(l);}
    for(const p of P.state.placements){const c=P.component(p.componentId);if(!c)continue;const {w,h}=size(p),g=node('g',{'data-component':c.id,transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':`${c.name} · ${p.x}, ${p.y} mm`,class:'pcb-chip'+(selected===c.id?' selected':'')+(collisions.has(c.id)?' collision':'')});
      const geometry=P.icGeometry(c),body=P.icRect(geometry.body,c,p.rotation);
      for(const pad of geometry.pads){const r=P.icRect(pad,c,p.rotation);g.append(node('rect',{x:r.x,y:r.y,width:r.w,height:r.h,fill:'#c1cbd1',class:'pcb-lead'}));}
      g.append(node('rect',{x:body.x,y:body.y,width:body.w,height:body.h,rx:.6,fill:'#202b38',stroke:P.colors[c.category]||'#99aabb','stroke-width':.4}));
      // A pin marker and edge pads make the planning footprint distinct from a logical block.
      if(c.icPackage==='QFN')for(let i=1;i<=4;i++){g.append(node('rect',{x:-.8,y:h*i/5-.35,width:.8,height:.7,fill:'#c1cbd1'}),node('rect',{x:w,y:h*i/5-.35,width:.8,height:.7,fill:'#c1cbd1'}));}
      g.append(node('circle',{cx:1.3,cy:1.3,r:.45,fill:'#f5d17d'}),node('text',{x:w/2,y:h/2,'text-anchor':'middle','font-size':Math.min(2,w/Math.max(c.name.length*.6,1)),fill:'#eef4fa'},c.name),node('text',{x:w/2,y:h/2+2.5,'text-anchor':'middle','font-size':1.2,fill:'#a1b4c7'},`${p.width} × ${p.height} mm · ${p.rotation}°`),node('title',{},`${c.name}\n${c.partNumber||'虛擬 IC'} · ${c.icPackage}${c.icPackage==='SOT'?' '+c.icPinCount+' PIN':''}\n${P.componentPorts(c.id).length} 個介面 Port（非實體腳位）`));parts.append(g);
    }
    $('placement-message').textContent=`PCB ${board.width} × ${board.height} mm · 已擺放 ${P.state.placements.length} / ${P.state.components.length} 顆 IC · ${collisions.size?collisions.size+' 顆元件重疊，請調整位置':'無元件重疊'} · 左上角為原點。虛擬尺寸供規劃使用。`;
    const inventory=$('inventory');inventory.replaceChildren();for(const c of P.state.components){const card=document.createElement('button');card.className='inventory-card';const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=c.name;detail.textContent=(c.partNumber||c.category)+' · '+c.icPackage+(c.icPackage==='SOT'?' '+c.icPinCount+' PIN':'')+' · '+(find(c.id)?'已擺放 · 點擊選取':'＋ 放入電路板');card.append(name,detail);card.onclick=()=>{selected=c.id;if(!find(c.id))place(c.id);else render();};inventory.append(card);}
    $('inventory-count').textContent=` / ${P.state.components.length-P.state.placements.length} UNPLACED`;
    const editor=$('placement-editor');editor.replaceChildren();const p=find(selected);if(!p)return;
    const title=document.createElement('strong');title.textContent=P.component(selected)?.name||'';editor.append(title);
    for(const [key,label] of [['x','X mm'],['y','Y mm'],['width','IC 長 mm'],['height','IC 寬 mm'],['icThickness','IC 高 mm']]){const l=document.createElement('label'),input=document.createElement('input');l.textContent=label;input.type='number';input.step='.1';input.min=key==='width'||key==='height'?1:0;input.value=key==='icThickness'?P.component(p.componentId).icThickness:p[key];if(['width','height','icThickness'].includes(key)){input.readOnly=true;input.title='請在 Architecture 元件屬性修改 IC 尺寸';}input.onchange=()=>{if(['width','height','icThickness'].includes(key))return;const value=Number(input.value),next={...p,[key]:value};const {w,h}=size(next);if(!Number.isFinite(value)||value<Number(input.min)||w>board.width||h>board.height){render();return;}Object.assign(p,next);clamp(p);changed();};l.append(input);editor.append(l);}
    for(const [label,action] of [['旋轉 90°',()=>{const next={...p,rotation:(p.rotation+90)%360},s=size(next);if(s.w>board.width||s.h>board.height)return;Object.assign(p,next);clamp(p);changed();}],['移回待擺清單',()=>{P.state.placements=P.state.placements.filter(x=>x!==p);selected=null;changed();}]]){const b=document.createElement('button');b.textContent=label;b.onclick=action;editor.append(b);}
  }
  function point(e){const r=svg.getBoundingClientRect(),b=P.state.board,scale=Math.min(r.width/(b.width+10),r.height/(b.height+10));return {x:(e.clientX-r.left-(r.width-(b.width+10)*scale)/2)/scale-5,y:(e.clientY-r.top-(r.height-(b.height+10)*scale)/2)/scale-5};}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const g=e.target.closest('[data-component]');selected=g?.dataset.component||null;const p=find(selected);if(p){e.preventDefault();drag={p,start:point(e),x:p.x,y:p.y};svg.setPointerCapture?.(e.pointerId);}render();});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const q=point(e),snap=n=>$('placement-snap').checked?Math.round(n):Math.round(n*10)/10;drag.p.x=snap(drag.x+q.x-drag.start.x);drag.p.y=snap(drag.y+q.y-drag.start.y);clamp(drag.p);changed();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,()=>drag=null);
  $('place-all').onclick=()=>{for(const c of P.state.components)place(c.id);};
  $('apply-board').onclick=()=>{const width=Number($('board-width').value),height=Number($('board-height').value),thickness=Number($('board-thickness').value);if(!Number.isFinite(thickness)||thickness<0.1||thickness>100){$('placement-message').textContent='板厚須為 0.1–100 mm。';return;}if(![width,height].every(n=>Number.isFinite(n)&&n>=10&&n<=1000)||P.state.placements.some(p=>size(p).w>width||size(p).h>height)){ $('placement-message').textContent='板尺寸須為 10–1000 mm，且可容納每顆 IC。';return;}P.state.board={width,height,thickness,unit:'mm'};P.state.placements.forEach(clamp);changed();};
  $('show-ratsnest').onchange=render;$('placement-save').onclick=()=>P.saveProject();$('placement-export').onclick=()=>P.exportProject();
  P.subscribe(({type})=>{if(['tab','clear','project-load','remove'].includes(type))drag=null;if(type==='clear'||type==='project-load')selected=null;if(P.ui.tab==='placement'||['clear','project-load'].includes(type))render();});
  P.placement={render,place,size,select:id=>{selected=id;render();}};
})(window.Planner);
