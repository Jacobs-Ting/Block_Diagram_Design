(function(P){
  'use strict';
  const $=id=>document.getElementById(id),svg=$('pcb-canvas'),NS='http://www.w3.org/2000/svg';
  let selected=null,drag=null;const boardDraft=new Set();
  for(const key of ['width','height','thickness'])$('board-'+key).addEventListener('input',()=>boardDraft.add(key));
  const side=p=>p.side||'top';
  const activeSide=()=>$('placement-side').value;
  const find=id=>P.state.placements.find(p=>p.componentId===id);
  const size=p=>p.rotation%180?{w:p.height,h:p.width}:{w:p.width,h:p.height};
  function node(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function clamp(p){const {w,h}=size(p);p.x=Math.max(0,Math.min(p.x,P.state.board.width-w));p.y=Math.max(0,Math.min(p.y,P.state.board.height-h));}
  function reject(message){$('placement-rule-warning').textContent='無法擺放：'+message;return false;}
  function commit(p,changes){const next={...p,...changes};clamp(next);const error=P.boardRules.valid(next);if(error)return reject(error);Object.assign(p,next);$('placement-rule-warning').textContent='';changed();return true;}
  function changed(){P.notify('placement-update');}
  function cancelPlacement(id){
    if(!find(id))return;
    if(drag?.p.componentId===id)drag=null;
    P.state.placements=P.state.placements.filter(p=>p.componentId!==id);
    if(selected===id)selected=null;
    $('placement-rule-warning').textContent='';
    changed();
  }
  function place(id){if(find(id)||!P.component(id))return;const c=P.component(id);if(c.icWidth>P.state.board.width||c.icHeight>P.state.board.height){$('placement-message').textContent=`${c.name} 的 IC 尺寸超出電路板，請增加板尺寸。`;return;}const n=P.state.placements.length,p={id:P.uuid(),componentId:id,x:4+(n%8)*18,y:4+Math.floor(n/8)*18,width:P.component(id).icWidth,height:P.component(id).icHeight,rotation:0,side:activeSide()};clamp(p);const position=P.boardRules.findSpace(p);if(!position)return reject('此面沒有足以容納 IC 且符合 Keep Out 的位置。');P.state.placements.push(position);$('placement-rule-warning').textContent='';selected=id;changed();}
  function showPlacement(id){const p=find(id);if(!p)return;selected=id;$('placement-side').value=side(p);$('view-top').click();render();}
  function assignSide(id,face){
    if(!['top','bottom'].includes(face))return;
    const p=find(id);
    if(p){if(!commit(p,{side:face}))return;selected=id;$('placement-side').value=face;render();}
    else {const previous=activeSide();$('placement-side').value=face;place(id);if(!find(id))$('placement-side').value=previous;}
    if(find(id))showPlacement(id);
  }
  function overlaps(a,b){const x=size(a),y=size(b);return a.x<b.x+y.w&&a.x+x.w>b.x&&a.y<b.y+y.h&&a.y+x.h>b.y;}
  function render(){
    const board=P.state.board;for(const key of ['width','height','thickness'])if(!boardDraft.has(key))$('board-'+key).value=board[key];P.pcb3d.render(selected);
    const highest=face=>Math.max(0,...P.state.placements.filter(p=>side(p)===face).map(p=>P.component(p.componentId)?.icThickness||0));
    const top=highest('top'),bottom=highest('bottom');$('height-summary').textContent=`Top 最高 IC：${top} mm · Bottom 最高 IC：${bottom} mm · 整體高度：${Number((board.thickness+top+bottom).toFixed(3))} mm`;
    svg.setAttribute('viewBox',`-5 -5 ${board.width+10} ${board.height+10}`);
    for(const id of ['pcb-board','pcb-dots']){ $(id).setAttribute('width',board.width);$(id).setAttribute('height',board.height); }
    const keepouts=$('pcb-keepouts');keepouts.replaceChildren();for(const p of P.state.placements){const c=P.component(p.componentId);for(const z of P.boardRules.zones(p,c).filter(z=>z.side===activeSide())){const r=node('rect',{x:z.x,y:z.y,width:z.w,height:z.h,class:'pcb-keepout '+z.kind,'pointer-events':'none'});r.append(node('title',{},`${c.name} · ${z.kind==='same'?'同面':'背面'} Keep Out`));keepouts.append(r);}}
    const parts=$('pcb-parts'),nets=$('pcb-nets');parts.replaceChildren();nets.replaceChildren();
    const collisions=new Set();for(const a of P.state.placements)for(const b of P.state.placements)if(a!==b&&side(a)===side(b)&&overlaps(a,b))collisions.add(a.componentId);
    if($('show-ratsnest').checked)for(const e of P.state.connections){const a=find(e.source.componentId),b=find(e.target.componentId);if(!a||!b||side(a)!==activeSide()||side(b)!==activeSide())continue;const x=size(a),y=size(b);const l=node('line',{x1:a.x+x.w/2,y1:a.y+x.h/2,x2:b.x+y.w/2,y2:b.y+y.h/2,stroke:P.interfaceColors[e.interfaceType]||'#aaa','stroke-width':.25,'stroke-dasharray':'1 1'});l.append(node('title',{},e.label||e.interfaceType));nets.append(l);}
    for(const p of P.state.placements){const c=P.component(p.componentId);if(!c||side(p)!==activeSide())continue;const {w,h}=size(p),g=node('g',{'data-component':c.id,transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':`${c.name} · ${p.x}, ${p.y} mm`,class:'pcb-chip'+(selected===c.id?' selected':'')+(collisions.has(c.id)?' collision':'')});
      const geometry=P.icGeometry(c),body=P.icRect(geometry.body,c,p.rotation);
      for(const pad of geometry.pads){const r=P.icRect(pad,c,p.rotation);g.append(node('rect',{x:r.x,y:r.y,width:r.w,height:r.h,fill:'#c1cbd1',class:'pcb-lead'}));}
      g.append(node('rect',{x:body.x,y:body.y,width:body.w,height:body.h,rx:.6,fill:'#202b38',stroke:P.colors[c.category]||'#99aabb','stroke-width':.4}));
      // A pin marker and edge pads make the planning footprint distinct from a logical block.
      if(c.icPackage==='QFN')for(let i=1;i<=4;i++){g.append(node('rect',{x:-.8,y:h*i/5-.35,width:.8,height:.7,fill:'#c1cbd1'}),node('rect',{x:w,y:h*i/5-.35,width:.8,height:.7,fill:'#c1cbd1'}));}
      g.append(node('circle',{cx:1.3,cy:1.3,r:.45,fill:'#f5d17d'}),node('text',{x:w/2,y:h/2,'text-anchor':'middle','font-size':Math.min(2,w/Math.max(c.name.length*.6,1)),fill:'#eef4fa'},c.name),node('text',{x:w/2,y:h/2+2.5,'text-anchor':'middle','font-size':1.2,fill:'#a1b4c7'},`${p.width} × ${p.height} mm · ${p.rotation}°`),node('title',{},`${c.name}\n${c.partNumber||'虛擬 IC'} · ${c.icPackage==='Custom'?(c.packageSpec||'自訂'):c.icPackage}${['SOT','TQFP'].includes(c.icPackage)?' '+c.icPinCount+' PIN':''}\n${P.componentPorts(c.id).length} 個介面 Port（非實體腳位）`));parts.append(g);
    }
    $('placement-message').textContent=`PCB ${board.width} × ${board.height} mm · 面積 ${board.width*board.height} mm² · ${activeSide()==='top'?'Top 上表面':'Bottom 下表面'}（共用 Top 視角 XY 座標） · 已擺放 ${P.state.placements.length} / ${P.state.components.length} 顆 IC · ${collisions.size?collisions.size+' 顆元件重疊，請調整位置':'無元件重疊'} · 左上角為原點。虛擬尺寸供規劃使用。`;
    const inventory=$('inventory');inventory.replaceChildren();
    const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');
    for(const label of ['頁面 1 元件','封裝 / 尺寸 (mm)','目前狀態','選擇擺放面']){const th=document.createElement('th');th.scope='col';th.textContent=label;header.append(th);}head.append(header);table.append(head);
    const rows=document.createElement('tbody');
    for(const c of P.state.components){
      const p=find(c.id),row=document.createElement('tr');row.dataset.componentId=c.id;row.classList.toggle('selected',selected===c.id);
      const title=document.createElement('td'),name=document.createElement('button');name.className='inventory-select';name.textContent=c.name;name.disabled=!p;name.title=p?'選取並顯示此 IC':'請先選擇 TOP 或 Bottom';name.onclick=()=>showPlacement(c.id);title.append(name);row.append(title);
      const detail=document.createElement('td');detail.textContent=`${c.icPackage==='Custom'?(c.packageSpec||'自訂'):c.icPackage}${['SOT','TQFP'].includes(c.icPackage)?' '+c.icPinCount+' PIN':''} · ${c.icWidth} × ${c.icHeight} × ${c.icThickness}`;row.append(detail);
      const status=document.createElement('td');status.className='placement-side-status';status.textContent=p?side(p).toUpperCase():'未擺放';row.append(status);
      const actions=document.createElement('td');
      for(const face of ['top','bottom']){
        const button=document.createElement('button');button.dataset.placeSide=face;button.textContent=`放到 ${face==='top'?'TOP':'Bottom'}`;button.setAttribute('aria-label',`${c.name} 放到 ${face.toUpperCase()}`);button.setAttribute('aria-pressed',String(!!p&&side(p)===face));
        button.onclick=()=>assignSide(c.id,face);actions.append(button);
      }
      const cancel=document.createElement('button');cancel.dataset.cancelPlacement=c.id;cancel.textContent='取消擺放';cancel.disabled=!p;cancel.setAttribute('aria-label',`${c.name} 取消擺放`);cancel.title='將 IC 移回未擺放狀態';cancel.onclick=()=>cancelPlacement(c.id);actions.append(cancel);
      row.append(actions);rows.append(row);
    }
    table.append(rows);inventory.append(table);
    if(!P.state.components.length){const empty=document.createElement('p');empty.textContent='第一頁尚無元件，請先在 Architecture 新增元件。';inventory.append(empty);}
    $('inventory-count').textContent=` / TOP ${P.state.placements.filter(p=>side(p)==='top').length} · BOTTOM ${P.state.placements.filter(p=>side(p)==='bottom').length} · 未擺放 ${P.state.components.length-P.state.placements.length}`;
    const editor=$('placement-editor');editor.replaceChildren();const p=find(selected);if(!p)return;
    const title=document.createElement('strong');title.textContent=P.component(selected)?.name||'';editor.append(title);
    const faceLabel=document.createElement('label'),face=document.createElement('select');faceLabel.textContent='擺放面';face.id='selected-placement-side';
    for(const [value,label] of [['top','Top 上表面'],['bottom','Bottom 下表面']]){const option=document.createElement('option');option.value=value;option.textContent=label;face.append(option);}face.value=side(p);
    face.onchange=()=>{const value=face.value;if(commit(p,{side:value})){$('placement-side').value=value;render();}else face.value=side(p);};faceLabel.append(face);editor.append(faceLabel);
    for(const [key,label] of [['x','X mm'],['y','Y mm'],['width','IC 長 mm'],['height','IC 寬 mm'],['icThickness','IC 高 mm']]){const l=document.createElement('label'),input=document.createElement('input');l.textContent=label;input.type='number';input.step='.1';input.min=key==='width'||key==='height'?1:0;input.value=key==='icThickness'?P.component(p.componentId).icThickness:p[key];if(['width','height','icThickness'].includes(key)){input.readOnly=true;input.title='請在 Architecture 元件屬性修改 IC 尺寸';}input.onchange=()=>{if(['width','height','icThickness'].includes(key))return;const value=Number(input.value),next={...p,[key]:value};const {w,h}=size(next);if(!Number.isFinite(value)||value<Number(input.min)||w>board.width||h>board.height){render();return;}commit(p,next);};l.append(input);editor.append(l);}
    for(const [label,action] of [['旋轉 90°',()=>{const next={...p,rotation:(p.rotation+90)%360},s=size(next);if(s.w>board.width||s.h>board.height)return;commit(p,next);}],['取消擺放',()=>cancelPlacement(p.componentId)]]){const b=document.createElement('button');b.textContent=label;b.onclick=action;editor.append(b);}
  }
  function point(e){const r=svg.getBoundingClientRect(),b=P.state.board,scale=Math.min(r.width/(b.width+10),r.height/(b.height+10));return {x:(e.clientX-r.left-(r.width-(b.width+10)*scale)/2)/scale-5,y:(e.clientY-r.top-(r.height-(b.height+10)*scale)/2)/scale-5};}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const g=e.target.closest('[data-component]');selected=g?.dataset.component||null;const p=find(selected);if(p){e.preventDefault();drag={p,start:point(e),x:p.x,y:p.y};svg.setPointerCapture?.(e.pointerId);}render();});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const q=point(e),snap=n=>$('placement-snap').checked?Math.round(n):Math.round(n*10)/10;commit(drag.p,{x:snap(drag.x+q.x-drag.start.x),y:snap(drag.y+q.y-drag.start.y)});});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,()=>drag=null);
  $('place-all').onclick=()=>{for(const c of P.state.components)place(c.id);};
  $('apply-board').onclick=()=>{const width=Number($('board-width').value),height=Number($('board-height').value),thickness=Number($('board-thickness').value);if(!Number.isFinite(thickness)||thickness<0.1||thickness>100){$('board-message').textContent='板厚須為 0.1–100 mm。';return;}if(![width,height].every(n=>Number.isFinite(n)&&n>=10&&n<=1000)||P.state.placements.some(p=>size(p).w>width||size(p).h>height)){ $('board-message').textContent='板尺寸須為 10–1000 mm，且可容納每顆 IC。';return;}const board={width,height,thickness,unit:'mm'},placements=P.state.placements.map(p=>{const s=size(p);return {...p,x:Math.max(0,Math.min(p.x,width-s.w)),y:Math.max(0,Math.min(p.y,height-s.h))};});const error=P.boardRules.all({...P.state,board,placements});if(error){$('board-message').textContent='無法套用板尺寸：'+error;return;}P.state.board=board;placements.forEach(next=>Object.assign(find(next.componentId),next));boardDraft.clear();$('board-message').textContent=`已套用 PCB ${width} × ${height} mm，面積 ${width*height} mm²；超出邊界的元件已移回板內。`;changed();};
  $('placement-side').onchange=()=>{drag=null;selected=null;render();};
  $('show-ratsnest').onchange=render;$('placement-save').onclick=()=>P.saveProject();$('placement-export').onclick=()=>P.exportProject();
  P.subscribe(({type})=>{if(['tab','clear','project-load','remove'].includes(type))drag=null;if(type==='clear'||type==='project-load'){selected=null;boardDraft.clear();$('board-message').textContent='';$('placement-rule-warning').textContent='';}if(P.ui.tab==='placement'||['clear','project-load'].includes(type))render();});
  P.placement={render,place,size,commit,select:id=>{selected=id;const p=find(id);if(p)$('placement-side').value=side(p);render();}};
})(window.Planner);
