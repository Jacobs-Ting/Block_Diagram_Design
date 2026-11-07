(function(P){
  'use strict';
  const panel=document.getElementById('properties-content');
  const text=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;node.textContent=value;return node;};
  function field(parent,label,value,onChange,options={}){
    const wrapper=text('label','field',label);
    const input=document.createElement(options.choices?'select':options.multiline?'textarea':'input');
    if(options.choices)for(const choice of options.choices){const [v,label]=Array.isArray(choice)?choice:[choice,choice];const option=document.createElement('option');option.value=v;option.textContent=label;input.append(option);}
    else if(!options.multiline)input.type=options.color?'color':options.number?'number':'text';
    input.value=value??'';if(options.name)input.name=options.name;
    if(options.number){input.min=options.min??0;if(options.max!==undefined)input.max=options.max;input.step=options.step??1;}else input.maxLength=options.multiline?2000:120;
    if(options.readonly)input.readOnly=true;
    if(options.placeholder)input.placeholder=options.placeholder;
    input.addEventListener(options.commit?'change':'input',()=>{
      let value=input.value;
      if(options.required&&!value.trim()){input.setCustomValidity('A value is required.');return;}
      if(options.number){if(value===''&&options.nullable)value=null;else {value=Number(value);if(input.value===''||!Number.isFinite(value)||value<Number(input.min)||(input.max&&value>Number(input.max))||(options.step===undefined&&!Number.isInteger(value))){input.setCustomValidity(`Enter a whole number from ${input.min}${input.max?' to '+input.max:''}.`);return;}}}
      input.setCustomValidity('');onChange?.(value,input);
    });
    wrapper.append(input);parent.append(wrapper);return input;
  }
  function heading(name,caption,icon='⌁'){
    const header=text('div','inspector-header','');header.append(text('span','chip-icon',icon),text('h2','',name),text('p','',caption));panel.append(header);return header;
  }
  function endpointName(end){const c=P.component(end.componentId),port=P.port(end.portId);return `${c?.name||'Missing component'} / ${port?port.name+(end.polarity||''):end.anchor+' (general)'}`;}
  function freeLine(line){
    const header=heading(line.label||'Free line','Independent drawing object','↗');
    field(panel,'Label',line.label,value=>{P.updateLine(line.id,{label:value});header.querySelector('h2').textContent=value||'Free line';});
    field(panel,'Arrow Direction',line.arrows,value=>P.updateLine(line.id,{arrows:value}),{choices:[['none','— 無箭頭'],['end','→ 指向終點'],['start','← 指向起點'],['both','↔ 雙向箭頭']]});
    panel.append(text('p','inspector-note','拖曳線段可整體移動；拖曳兩端圓點可調整長度與角度。此線為獨立繪圖物件，不會吸附或跟隨 Block。'));
    for(const [key,label] of [['x1','Start X'],['y1','Start Y'],['x2','End X'],['y2','End Y']]){
      const input=field(panel,label,line[key],value=>P.updateLine(line.id,{[key]:value}),{name:key,number:true,min:-1000000});
      input.addEventListener('blur',()=>{input.value=line[key];input.setCustomValidity('');});
    }
    const remove=text('button','danger-button','Delete line');remove.addEventListener('click',()=>P.removeLine(line.id));panel.append(remove);
  }
  function textBox(box){
    const header=heading(box.text.split('\n')[0]||'文字框','Text box / annotation','T');
    field(panel,'Text',box.text,value=>{P.updateTextBox(box.id,{text:value});header.querySelector('h2').textContent=value.split('\n')[0]||'文字框';},{multiline:true});
    field(panel,'Font',box.fontFamily,value=>P.updateTextBox(box.id,{fontFamily:value}),{choices:P.fonts});
    field(panel,'Font Size',box.fontSize,value=>P.updateTextBox(box.id,{fontSize:value}),{number:true,min:8,max:96});
    for(const [key,label] of [['textColor','Text Color'],['backgroundColor','Background Color'],['borderColor','Border Color']])field(panel,label,box[key],value=>P.updateTextBox(box.id,{[key]:value}),{color:true});
    const dimensions=text('div','field-row','');
    field(dimensions,'Width',box.width,value=>P.updateTextBox(box.id,{width:value}),{number:true,min:80});field(dimensions,'Height',box.height,value=>P.updateTextBox(box.id,{height:value}),{number:true,min:40});panel.append(dimensions);
    panel.append(text('p','inspector-note','拖曳文字框移動；拖曳八個控制點縮放。文字會依寬度自動換行，超出高度的內容仍保留於 State。'));
    const remove=text('button','danger-button','Delete text box');remove.addEventListener('click',()=>P.removeTextBox(box.id));panel.append(remove,text('div','uuid','TEXT UUID / '+box.id));
  }
  function connection(edge){
    const header=heading(edge.label||edge.interfaceType,'Logical connection / directed edge');
    field(panel,'Interface Type',edge.interfaceType,value=>P.updateConnection(edge.id,{interfaceType:value}),{choices:P.interfaces});
    field(panel,'Label',edge.label,value=>{P.updateConnection(edge.id,{label:value});header.querySelector('h2').textContent=value||edge.interfaceType;});
    field(panel,'Loss (dB)',edge.loss,value=>P.updateConnection(edge.id,{loss:value}),{name:'loss',number:true,min:0,max:100,step:.1,commit:true});
    if(edge.interfaceType==='RF'){
      field(panel,'RF 路徑方向',edge.rfMode,value=>P.updateConnection(edge.id,{rfMode:value}),{choices:[['auto','依箭頭方向'],['tx','Tx（依箭頭）'],['rx','Rx（依箭頭）'],['both','Tx / Rx 雙向']],commit:true});
      for(const [key,label] of [['txChannel','Tx 通道'],['rxChannel','Rx 通道']])field(panel,label,edge[key],value=>P.updateConnection(edge.id,{[key]:value}),{name:key,number:true,min:1,max:4,commit:true});
      panel.append(text('p','inspector-note','通道編號用於直接連接 TRX 的 RF 線。Tx 箭頭由 TRX 向天線；Rx 由天線向 TRX。共用 RF 路徑可選雙向，視為切換使用。'));
    }
    field(panel,'Description',edge.description,value=>P.updateConnection(edge.id,{description:value}),{multiline:true});
    field(panel,'Source',endpointName(edge.source),null,{readonly:true});
    field(panel,'Destination',endpointName(edge.target),null,{readonly:true});
    field(panel,'Line Style',edge.routingStyle,value=>P.updateConnection(edge.id,{routingStyle:value}),{choices:[['orthogonal','Orthogonal (default)'],['straight','Straight']]});
    const parallel=text('button','wide-button','＋ Add parallel connection');
    parallel.addEventListener('click',()=>{
      const count=P.geometry.parallelEdges(edge).length;
      const added=P.addConnection(edge.source,edge.target,{...edge,interfaceType:edge.interfaceType,label:`${edge.interfaceType} ${count+1}`,routingStyle:edge.routingStyle});
      if(added)P.select(added.id,'connection');
    });
    panel.append(parallel);
    panel.append(text('p','inspector-note','Endpoints follow component position, size and rotation. General points fan out; engineering links stay attached to their port.'));
    const remove=text('button','danger-button','Delete connection');remove.addEventListener('click',()=>P.removeConnection(edge.id));panel.append(remove,text('div','uuid','CONNECTION UUID / '+edge.id));
  }
  function ports(c){
    const section=text('section','ports-editor','');section.append(text('h3','section-title','ENGINEERING PORTS'));
    section.append(text('p','inspector-note','○ General points: unlimited · □ Engineering ports: configurable. Drag a point, or click source then target.'));
    P.componentPorts(c.id).forEach(port=>{
      const card=text('div','port-card','');card.dataset.portId=port.id;const usage=P.portUsage(port.id);
      card.append(text('div','port-usage'+(port.maxConnections!==null&&usage>port.maxConnections*(port.signalMode==='differential'?2:1)?' invalid':''),`${usage} / ${port.maxConnections===null?'∞':port.maxConnections*(port.signalMode==='differential'?2:1)} connections${port.signalMode==='differential'?'（＋／− 各自計數）':''}`));
      const update=key=>(value,input)=>{const ok=P.updatePort(port.id,{[key]:value});if(!ok&&input){input.value=port[key]??'';input.setCustomValidity('無法變更；切換單端前請先移除 − 端點連線。');input.reportValidity();}else if(ok&&key==='signalMode')render();};
      field(card,'Port Name',port.name,update('name'),{commit:true,required:true,readonly:!!port.rfKey});
      if(!port.rfKey)field(card,'Port Type',port.type,update('type'),{choices:P.interfaces,commit:true});
      if(P.isTrx(c)&&port.rfKey)field(card,'RF 走線模式',port.signalMode||'single',update('signalMode'),{name:'signalMode',choices:[['single','單端 Single-ended'],['differential','差分 Differential (+/−)']],commit:true});
      if(c.type==='Balun')card.append(text('p','inspector-note',port.signalMode==='differential'?'差分平衡端 (+/−)':'單端非平衡端'));
      if(c.type==='RF Switch'&&port.rfKey){
        for(const [key,label,min] of [['loss','Port Loss (dB)',0],['maxLevel','Port Max Level (dBm)',-100]])field(card,label,port[key],update(key),{name:key,number:true,min,max:100,step:.1,nullable:true,commit:true,placeholder:'尚未設定'});
      }
      const row=text('div','field-row','');
      if(!port.rfKey)field(row,'Side',port.side,update('side'),{choices:P.sides,commit:true});else row.append(text('p','inspector-note',`${port.name} · ${port.side==='right'?'右側':'左側'}`));
      if(!port.rfKey)field(row,'Direction',port.direction,update('direction'),{choices:['input','output','bidirectional'],commit:true});card.append(row);
      field(card,'Max Connections',port.maxConnections,update('maxConnections'),{number:true,min:1,nullable:true,placeholder:'Unlimited (blank)',commit:true});
      const remove=text('button','danger-button','Remove port'+(usage?` + ${usage} links`:''));remove.addEventListener('click',()=>P.removePort(port.id));if(!port.rfKey)card.append(remove);section.append(card);
    });
    const add=text('button','wide-button','＋ Add engineering port');add.addEventListener('click',()=>P.addPort(c.id,{name:'Port '+(P.componentPorts(c.id).length+1)}));section.append(add);panel.append(section);
  }
  function component(c){
    const header=heading(c.name,'Component / '+c.type,P.icons[c.category]||'□');
    const rfFields=P.rfFields(c);
    if(rfFields.length){
      panel.append(text('h3','section-title','RF / LINK BUDGET'));
      for(const [key,label,min,max,step] of rfFields){
        field(panel,label,c[key],(value,input)=>{const ok=P.update(c.id,{[key]:value},'rf-update');if(!ok){input.value=c[key]??'';input.setCustomValidity('此數量或參數無效；減少 port 前請先移除相關連線。');input.reportValidity();}else if(step===1)render();},{name:key,number:true,min,max,step:step===1?undefined:step,nullable:step!==1,commit:true,placeholder:step===1?'':'尚未設定'});
      }
      if(P.isTrx(c))panel.append(text('p','inspector-note','Tx／Rx 各最多 4 路，共用本元件 RF 參數；路數會自動更新 TXn／RXn RF ports。請從具名 RF port 接線。'));
    }
    if(P.isTrx(c)||c.type==='RF Switch'||c.type==='Balun'){panel.append(text('p','inspector-note',c.type==='Balun'?'左側 BAL 為差分平衡端，右側 UNBAL 為單端；請填入 Balun 的 Loss／Max Input Level。':c.type==='RF Switch'?'左側 RF1～RFN 為分支，右側固定一個 RFC 共用端。每條切換路徑為 RFN ↔ RFC；兩端分別填入 Loss／Max Level，損耗相加。':'RF port 由 Tx／Rx 路數管理；請從對應 TXn／RXn 接線，通道會自動辨識。'));ports(c);}
    if(c.type==='SDR'){
      panel.append(text('h3','section-title','RF 參數設定位置'));
      panel.append(text('p','inspector-note','SDR 為基頻方塊。Tx／Rx 路數、DA Power、Rx LNA Gain／NF 請選擇 RF Transceiver（TRX）設定；PA、LNA、Filter、RF Switch 各有對應 RF 欄位。'));
      const addTrx=text('button','wide-button','＋ 新增 RF Transceiver（TRX）設定 RF');addTrx.onclick=()=>P.addAtCenter('RF Transceiver');panel.append(addTrx);
    }
    for(const [key,label] of [['name','Name'],['category','Category'],['vendor','Vendor'],['partNumber','Part Number']]){
      const input=field(panel,label,c[key],value=>{P.update(c.id,{[key]:value});if(key==='name')header.querySelector('h2').textContent=value;if(key==='category')header.querySelector('.chip-icon').textContent=P.icons[value];},{name:key,required:key==='name',choices:key==='category'?Object.keys(P.groups):null});
      input.addEventListener('blur',()=>{if(key==='name'&&!input.value.trim()){input.value=c.name;input.setCustomValidity('');}});
    }
    panel.append(text('h3','section-title','IC 封裝'));
    field(panel,'IC 封裝',c.icPackage,value=>{P.update(c.id,{icPackage:value},'ic-package');render();},{name:'icPackage',commit:true,choices:['QFN','BGA','SOT']});
    if(c.icPackage==='SOT'){
      const pinInput=field(panel,'SOT 總 PIN 腳數',c.icPinCount,(value,input)=>{
        const ok=P.update(c.id,{icPinCount:value},'ic-package');
        input.setCustomValidity(ok?'':'請輸入 2–64 的偶數，左右各分配一半腳位。');
        if(!ok){input.reportValidity();return;}
        summary.textContent=`左側 ${value/2} 腳 · 右側 ${value/2} 腳（總計 ${value} 腳）`;
      },{name:'icPinCount',number:true,min:2,max:64,step:2,commit:true});
      pinInput.addEventListener('blur',()=>{pinInput.value=c.icPinCount;pinInput.setCustomValidity('');});
      const summary=text('p','inspector-note',`左側 ${c.icPinCount/2} 腳 · 右側 ${c.icPinCount/2} 腳（總計 ${c.icPinCount} 腳）`);panel.append(summary);
    }
    panel.append(text('h3','section-title','IC 實體尺寸 / PLACEMENT'));
    const icSizes=text('div','field-row','');
    const area=field(document.createElement('div'),'IC 面積 (mm²)',Number((c.icWidth*c.icHeight).toFixed(4)),null,{name:'icArea',readonly:true});
    for(const [key,label] of [['icWidth','IC 長 (mm)'],['icHeight','IC 寬 (mm)'],['icThickness','IC 高 (mm)']]){
      const input=field(icSizes,label,c[key],(value,input)=>{
        const ok=P.update(c.id,{[key]:value},'ic-size');
        input.setCustomValidity(ok?'':'IC 尺寸超出目前電路板，請先增加板尺寸。');
        if(!ok){input.reportValidity();return;}
        area.value=Number((c.icWidth*c.icHeight).toFixed(4));
      },{name:key,number:true,min:key==='icThickness'?0.1:1,max:1000,step:0.1,commit:true});
      input.addEventListener('blur',()=>{input.value=c[key];input.setCustomValidity('');});
    }
    panel.append(icSizes,area.parentElement,text('p','inspector-note','面積 = 長 × 寬；Placement 的 3D IC 使用相同長、寬、高（mm）。下方 Width / Height 僅控制架構圖方塊大小。'));
    field(panel,'形狀',c.shape||'rectangle',value=>P.update(c.id,{shape:value}),{choices:[['rectangle','方形'],['circle','圓形'],['triangle','三角形'],['diamond','菱形']]});
    const min=P.minimumSize(c.id),sizes=text('div','field-row','');
    for(const key of ['width','height']){
      const input=field(sizes,key==='width'?'Width':'Height',c[key],value=>P.update(c.id,{[key]:value},'resize'),{name:key,number:true,min:min[key]});
      input.addEventListener('blur',()=>{input.value=c[key];input.setCustomValidity('');});
    }
    panel.append(sizes,text('p','inspector-note',`Minimum ${min.width} × ${min.height} canvas units. Port spacing may increase the minimum.`));
    const colorRow=text('div','color-field','');
    field(colorRow,'Block Color',c.renderColor||'#1c2938',value=>P.update(c.id,{renderColor:value}),{color:true});
    const reset=text('button','','使用預設色');reset.addEventListener('click',()=>{P.update(c.id,{renderColor:'#1c2938'});render();});colorRow.append(reset);panel.append(colorRow);
    field(panel,'Font',c.fontFamily||'Segoe UI',value=>P.update(c.id,{fontFamily:value}),{choices:P.fonts});
    field(panel,'Font Size',c.fontSize||15,value=>P.update(c.id,{fontSize:value}),{number:true,min:8,max:48});
    field(panel,'Text Color',c.textColor||'#dce5ee',value=>P.update(c.id,{textColor:value}),{color:true});
    field(panel,'旋轉角度',Math.round(c.rotation*10)/10,value=>P.update(c.id,{rotation:Number(value)},'rotate'),{name:'rotation',number:true,min:0,max:359});
    for(const [key,label] of [['description','Description'],['voltage','Voltage'],['frequency','Frequency'],['power','Power'],['notes','Notes']])field(panel,label,c[key],value=>P.update(c.id,{[key]:value}),{multiline:['description','notes'].includes(key)});
    if(!P.isTrx(c)&&!['RF Switch','Balun'].includes(c.type))ports(c);
    const edges=P.state.connections.filter(e=>e.source.componentId===c.id||e.target.componentId===c.id);
    panel.append(text('h3','section-title',`CONNECTIONS / ${edges.length}`));
    for(const edge of edges){const button=text('button','connection-list-item',`${P.component(edge.source.componentId).name} → ${P.component(edge.target.componentId).name} · ${edge.label||edge.interfaceType}`);button.addEventListener('click',()=>P.select(edge.id,'connection'));panel.append(button);}
    panel.append(text('div','uuid','COMPONENT UUID / '+c.id));
  }
  function render(resetScroll=false){
    const scroll=resetScroll?0:panel.scrollTop;panel.replaceChildren();
    if(P.ui.selection.length>1){
      document.getElementById('selection-badge').textContent='MULTI SELECT';
      heading(`${P.ui.selection.length} 個物件已選取`,'框選 / Shift 點擊可調整選取範圍','▧');
      for(const [kind,label] of [['component','方塊'],['connection','工程連線'],['line','獨立直線'],['text','文字框']])panel.append(text('p','inspector-note',`${label}：${P.ui.selection.filter(s=>s.kind===kind).length}`));
      panel.append(text('p','inspector-note','拖曳選取的方塊或直線可整組移動。Ctrl+C 複製，Ctrl+V 貼上，Delete 刪除選取物件。點擊其他物件可回到單選編輯。'));
      return;
    }
    const c=P.ui.selectedKind==='component'?P.component(P.ui.selected):null,edge=P.ui.selectedKind==='connection'?P.connection(P.ui.selected):null;
    const line=P.ui.selectedKind==='line'?P.line(P.ui.selected):null;
    const box=P.ui.selectedKind==='text'?P.textBox(P.ui.selected):null;
    document.getElementById('selection-badge').textContent=c?'COMPONENT':edge?'CONNECTION':line?'LINE':box?'TEXT':'NO SELECTION';
    if(c)component(c);else if(edge)connection(edge);else if(line)freeLine(line);else if(box)textBox(box);else {const empty=text('div','no-selection','');empty.append(text('div','icon','⌖'),text('strong','','Inspect your engineering graph'),text('p','','Select a block, connection, line or text box to edit.'));panel.append(empty);}
    panel.scrollTop=scroll;
  }
  P.subscribe(({type,id})=>{
    if(['selection','remove','connection-remove','line-remove','text-remove','clear','project-load'].includes(type))render(['selection','project-load','clear'].includes(type));
    if(type==='line-update'&&P.ui.selected===id){const line=P.line(id);for(const key of ['x1','y1','x2','y2']){const input=panel.querySelector(`[name="${key}"]`);if(input&&document.activeElement!==input)input.value=line[key];}}
    if(type==='ports'){
      if(!panel.contains(document.activeElement)||!document.activeElement.matches('input,select,textarea'))render();
      else {
        const c=P.component(P.ui.selected);
        if(c){const min=P.minimumSize(c.id);for(const key of ['width','height']){const input=panel.querySelector(`[name="${key}"]`);if(input){input.min=min[key];if(document.activeElement!==input)input.value=c[key];}}
          for(const card of panel.querySelectorAll('.port-card')){const port=P.port(card.dataset.portId);if(!port)continue;const usage=P.portUsage(port.id),label=card.querySelector('.port-usage');label.textContent=`${usage} / ${port.maxConnections===null?'∞':port.maxConnections*(port.signalMode==='differential'?2:1)} connections${port.signalMode==='differential'?'（＋／− 各自計數）':''}`;label.classList.toggle('invalid',port.maxConnections!==null&&usage>port.maxConnections*(port.signalMode==='differential'?2:1));}
        }
      }
    }
    if(type==='resize'&&id===P.ui.selected){const c=P.component(id);for(const key of ['width','height']){const input=panel.querySelector(`[name="${key}"]`);if(input&&document.activeElement!==input)input.value=Math.round(c[key]);}}
    if(type==='rotate'&&id===P.ui.selected){const input=panel.querySelector('[name="rotation"]');if(input&&document.activeElement!==input)input.value=Math.round(P.component(id).rotation*10)/10;}
  });render();
})(window.Planner);
