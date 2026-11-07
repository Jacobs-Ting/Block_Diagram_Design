(function(P){
  'use strict';
  const list=document.getElementById('library-list');
  function library(query=''){
    list.replaceChildren();let count=0;
    Object.entries(P.groups).forEach(([category,names])=>{const matches=names.filter(name=>(name+' '+category+(name==='RF Transceiver'?' TRX Tx Rx':'' )).toLowerCase().includes(query.toLowerCase()));if(!matches.length)return;count+=matches.length;const title=document.createElement('div');title.className='category-title';title.textContent=category;const num=document.createElement('span');num.textContent=matches.length;title.append(num);list.append(title);matches.forEach(name=>{const button=document.createElement('button');button.className='component-item';button.draggable=true;button.dataset.name=name;button.style.setProperty('--category-color',P.colors[category]);const icon=document.createElement('span');icon.textContent=P.icons[category];const label=document.createTextNode(name==='RF Transceiver'?'RF Transceiver (TRX)':name==='SDR'?'SDR（基頻）':name);const grip=document.createElement('small');grip.textContent='⠿';button.append(icon,label,grip);button.title='Add '+name+(P.rfFields({type:name}).length?' · 選取後可在右側設定 RF 參數':name==='SDR'?' · 基頻方塊；射頻參數請使用 RF Transceiver (TRX)':'');list.append(button);});});
    document.getElementById('library-count').textContent=count;
    if(!count){const empty=document.createElement('p');empty.className='library-hint';empty.textContent='No matching components.';list.append(empty);}
  }
  library();document.getElementById('search').addEventListener('input',e=>library(e.target.value));
  list.addEventListener('dragstart',e=>{const item=e.target.closest('[data-name]');if(!item)return;e.dataTransfer.setData('application/x-stratum-component',item.dataset.name);e.dataTransfer.effectAllowed='copy';});
  list.addEventListener('click',e=>{const item=e.target.closest('[data-name]');if(!item)return;setTab('architecture');P.addAtCenter(item.dataset.name);});
  function inventory(){P.placement.render();}
  function status({type}={}){
    const c=P.component(P.ui.selected),edge=P.connection(P.ui.selected),line=P.line(P.ui.selected),box=P.textBox(P.ui.selected);
    document.getElementById('component-count').textContent=`${P.state.components.length} nodes · ${P.state.connections.length} edges · ${P.state.lines.length} lines · ${P.state.textBoxes.length} text`;
    document.getElementById('selection-status').textContent=c?c.name:edge?(edge.label||edge.interfaceType):line?(line.label||'Free line'):box?(box.text.split('\n')[0]||'文字框'):'No selection';
    document.getElementById('delete').disabled=!P.ui.selection.length||P.ui.tab!=='architecture';
    document.getElementById('copy-selection').disabled=!P.ui.selection.length;
    document.getElementById('paste-selection').disabled=!P.hasClipboard();
    if(P.ui.selection.length>1)document.getElementById('selection-status').textContent=`${P.ui.selection.length} 個物件已選取`;
    document.getElementById('clear-canvas').disabled=!['components','ports','connections','lines','textBoxes','placements','zones'].some(key=>P.state[key].length);
    const messages={remove:'Component and related links deleted',add:'Component added',update:'Properties updated',resize:'Block resized',rotate:'圖形已旋轉','connection-add':'Connection created','connection-remove':'Connection deleted','connection-update':'Connection updated',ports:'Port settings updated','text-add':'文字框已新增','text-update':'文字框已更新','text-remove':'文字框已刪除',theme:'顯示主題已切換'};
    if(messages[type])document.getElementById('status').textContent=messages[type];
    const warning=document.getElementById('graph-warning');warning.hidden=!P.ui.warning;warning.querySelector('span').textContent=P.ui.warning||'';
    if(P.ui.tab==='placement'&&!['move','resize','warning'].includes(type))inventory();
    for(const mode of ['select','connect','line','text','pan'])document.getElementById(mode+'-mode').setAttribute('aria-pressed',String(P.ui.mode===mode));
    document.getElementById('canvas-help').textContent=P.ui.mode==='connect'?'CONNECT · Click source then target, or drag between points · Esc to return to Select':'Select block: resize handles · Drag a point to connect · Esc: cancel · Delete: remove';
    if(P.ui.mode==='line')document.getElementById('canvas-help').textContent='LINE · Drag to draw, or click start then end · Esc: cancel';
    if(P.ui.mode==='text')document.getElementById('canvas-help').textContent='文字框 · 在畫布拖曳建立文字區域，建立後可從右側編輯內容與樣式';
    if(P.ui.mode==='pan')document.getElementById('canvas-help').textContent='PAN · 拖曳移動可視範圍 · 滾輪縮放 · Esc 返回 Select';
    if(type?.startsWith('line-'))document.getElementById('status').textContent=type==='line-remove'?'Line deleted':type==='line-add'?'Line created':'Line updated';
    if(type==='clear'){document.getElementById('status').textContent='畫面已清除';document.getElementById('coordinates').textContent='X —  Y —';}
    if(type==='copy')document.getElementById('status').textContent='已複製選取物件';
    if(type==='paste')document.getElementById('status').textContent='已貼上副本';
    const projectMessages={'project-save':'專案已儲存於此瀏覽器','project-saved-load':'已載入本機存檔','project-import':'JSON 專案匯入完成','project-export':'JSON 專案已匯出','png-export':'完整工作區 PNG 已匯出','project-load':'專案資料已載入'};
    if(projectMessages[type])document.getElementById('status').textContent=projectMessages[type];
    if(P.ui.mode==='select')document.getElementById('canvas-help').textContent='選取圖形後拖曳上方圓點旋轉 · 空白處拖曳框選 · Shift 點擊多選 · Ctrl+C / Ctrl+V 複製貼上 · Delete 刪除';
  }
  function setTab(tab){P.ui.tab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));['architecture','placement','checks','budget'].forEach(t=>document.getElementById(t+'-view').hidden=t!==tab);const titles={architecture:['System architecture','Logical component overview'],placement:['Virtual placement','Shared architecture inventory'],budget:['RF Link Budget','Tx maximum power / Rx sensitivity'],checks:['Engineering design check','Rule evaluation · Phase 4']};document.getElementById('view-title').textContent=titles[tab][0];document.getElementById('view-subtitle').textContent=titles[tab][1];document.querySelector('.toolbar-actions').hidden=tab!=='architecture';if(tab==='placement')inventory();if(tab==='budget')P.budgetUI.render();status();}
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{P.notify('tab');setTab(b.dataset.tab);}));
  document.getElementById('select-mode').addEventListener('click',()=>P.setMode('select'));
  document.getElementById('connect-mode').addEventListener('click',()=>P.setMode('connect'));
  document.getElementById('line-mode').addEventListener('click',()=>P.setMode('line'));
  document.getElementById('text-mode').addEventListener('click',()=>P.setMode('text'));
  document.getElementById('pan-mode').addEventListener('click',()=>P.setMode('pan'));
  document.getElementById('dismiss-warning').addEventListener('click',()=>{P.ui.warning='';status();});
  const addBlock=document.getElementById('add-block');addBlock.textContent='＋ 方形';addBlock.addEventListener('click',()=>P.addAtCenter('Generic Block'));
  for(const [id,label,shape] of [['add-diamond','＋ 菱形','diamond'],['add-triangle','＋ 三角形','triangle'],['add-circle','＋ 圓形','circle']]){const button=document.createElement('button');button.id=id;button.textContent=label;button.addEventListener('click',()=>P.addAtCenter('Generic Block',{shape}));addBlock.after(button);}
  document.getElementById('delete').addEventListener('click',()=>P.removeSelected());
  document.getElementById('copy-selection').addEventListener('click',()=>P.copySelection());
  document.getElementById('paste-selection').addEventListener('click',()=>P.pasteSelection());
  document.getElementById('clear-canvas').addEventListener('click',()=>{
    if(window.confirm(`確定清除畫面？將移除 ${P.state.components.length} 個方塊、${P.state.connections.length} 條連線、${P.state.lines.length} 條直線、${P.state.textBoxes.length} 個文字框，以及相關 Port、Placement 與 Zone。此操作無法復原。`))P.clearCanvas();
  });
  document.getElementById('save-project').addEventListener('click',()=>P.saveProject());
  document.getElementById('load-project').addEventListener('click',()=>P.loadSavedProject());
  document.getElementById('export-project').addEventListener('click',()=>P.exportProject());
  document.getElementById('import-project').addEventListener('click',()=>document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>10*1024*1024){P.warn('匯入失敗：JSON 檔案不可超過 10 MB。');return;}
    try{P.importProjectText(await file.text());}catch(error){P.warn('匯入失敗：'+error.message);}
  });
  document.getElementById('export-png').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='輸出中…';await P.exportPNG();button.disabled=false;button.textContent='PNG';});
  document.getElementById('snap').addEventListener('change',e=>P.ui.snap=e.target.checked);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){P.connectionUI.cancel();P.setMode('select');P.select(null);return;}
    if(e.target.closest('input,textarea,select,[contenteditable="true"]')||P.ui.tab!=='architecture')return;
    if(e.ctrlKey||e.metaKey){
      const key=e.key.toLowerCase();
      if(key==='s'){e.preventDefault();P.saveProject();}
      if(key==='c'){e.preventDefault();P.copySelection();}
      if(key==='v'){e.preventDefault();P.pasteSelection();}
      if(key==='a'){e.preventDefault();P.selectMany([...P.state.components.map(c=>({id:c.id,kind:'component'})),...P.state.connections.map(c=>({id:c.id,kind:'connection'})),...P.state.lines.map(l=>({id:l.id,kind:'line'})),...P.state.textBoxes.map(t=>({id:t.id,kind:'text'}))]);}
      return;
    }
    if(e.key==='Delete'){e.preventDefault();P.removeSelected();}
  });
  P.subscribe(status);status();
})(window.Planner);
