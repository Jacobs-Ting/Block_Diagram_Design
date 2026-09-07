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
    if(options.number){input.min=options.min??0;input.step=1;}else input.maxLength=options.multiline?2000:120;
    if(options.readonly)input.readOnly=true;
    if(options.placeholder)input.placeholder=options.placeholder;
    input.addEventListener(options.commit?'change':'input',()=>{
      let value=input.value;
      if(options.required&&!value.trim()){input.setCustomValidity('A value is required.');return;}
      if(options.number){if(value===''&&options.nullable)value=null;else {value=Number(value);if(input.value===''||!Number.isFinite(value)||value<Number(input.min)||!Number.isInteger(value)){input.setCustomValidity(`Enter an integer of at least ${input.min}.`);return;}}}
      input.setCustomValidity('');onChange?.(value,input);
    });
    wrapper.append(input);parent.append(wrapper);return input;
  }
  function heading(name,caption,icon='⌁'){
    const header=text('div','inspector-header','');header.append(text('span','chip-icon',icon),text('h2','',name),text('p','',caption));panel.append(header);return header;
  }
  function endpointName(end){const c=P.component(end.componentId),port=P.port(end.portId);return `${c?.name||'Missing component'} / ${port?.name||end.anchor+' (general)'}`;}
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
  function connection(edge){
    const header=heading(edge.label||edge.interfaceType,'Logical connection / directed edge');
    field(panel,'Interface Type',edge.interfaceType,value=>P.updateConnection(edge.id,{interfaceType:value}),{choices:P.interfaces});
    field(panel,'Label',edge.label,value=>{P.updateConnection(edge.id,{label:value});header.querySelector('h2').textContent=value||edge.interfaceType;});
    field(panel,'Description',edge.description,value=>P.updateConnection(edge.id,{description:value}),{multiline:true});
    field(panel,'Source',endpointName(edge.source),null,{readonly:true});
    field(panel,'Destination',endpointName(edge.target),null,{readonly:true});
    field(panel,'Line Style',edge.routingStyle,value=>P.updateConnection(edge.id,{routingStyle:value}),{choices:[['orthogonal','Orthogonal (default)'],['straight','Straight']]});
    const parallel=text('button','wide-button','＋ Add parallel connection');
    parallel.addEventListener('click',()=>{
      const count=P.geometry.parallelEdges(edge).length;
      const added=P.addConnection(edge.source,edge.target,{interfaceType:edge.interfaceType,label:`${edge.interfaceType} ${count+1}`,routingStyle:edge.routingStyle});
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
      card.append(text('div','port-usage'+(port.maxConnections!==null&&usage>port.maxConnections?' invalid':''),`${usage} / ${port.maxConnections??'∞'} connections`));
      const update=key=>value=>P.updatePort(port.id,{[key]:value});
      field(card,'Port Name',port.name,update('name'),{commit:true,required:true});
      field(card,'Port Type',port.type,update('type'),{choices:P.interfaces,commit:true});
      const row=text('div','field-row','');
      field(row,'Side',port.side,update('side'),{choices:P.sides,commit:true});
      field(row,'Direction',port.direction,update('direction'),{choices:['input','output','bidirectional'],commit:true});card.append(row);
      field(card,'Max Connections',port.maxConnections,update('maxConnections'),{number:true,min:1,nullable:true,placeholder:'Unlimited (blank)',commit:true});
      const remove=text('button','danger-button','Remove port'+(usage?` + ${usage} links`:''));remove.addEventListener('click',()=>P.removePort(port.id));card.append(remove);section.append(card);
    });
    const add=text('button','wide-button','＋ Add engineering port');add.addEventListener('click',()=>P.addPort(c.id,{name:'Port '+(P.componentPorts(c.id).length+1)}));section.append(add);panel.append(section);
  }
  function component(c){
    const header=heading(c.name,'Component / '+c.type,P.icons[c.category]||'□');
    for(const [key,label] of [['name','Name'],['category','Category'],['vendor','Vendor'],['partNumber','Part Number']]){
      const input=field(panel,label,c[key],value=>{P.update(c.id,{[key]:value});if(key==='name')header.querySelector('h2').textContent=value;if(key==='category')header.querySelector('.chip-icon').textContent=P.icons[value];},{name:key,required:key==='name',choices:key==='category'?Object.keys(P.groups):null});
      input.addEventListener('blur',()=>{if(key==='name'&&!input.value.trim()){input.value=c.name;input.setCustomValidity('');}});
    }
    const min=P.minimumSize(c.id),sizes=text('div','field-row','');
    for(const key of ['width','height']){
      const input=field(sizes,key==='width'?'Width':'Height',c[key],value=>P.update(c.id,{[key]:value},'resize'),{name:key,number:true,min:min[key]});
      input.addEventListener('blur',()=>{input.value=c[key];input.setCustomValidity('');});
    }
    panel.append(sizes,text('p','inspector-note',`Minimum ${min.width} × ${min.height} canvas units. Port spacing may increase the minimum.`));
    const colorRow=text('div','color-field','');
    field(colorRow,'Block Color',c.renderColor||'#1c2938',value=>P.update(c.id,{renderColor:value}),{color:true});
    const reset=text('button','','使用預設色');reset.addEventListener('click',()=>{P.update(c.id,{renderColor:'#1c2938'});render();});colorRow.append(reset);panel.append(colorRow);
    field(panel,'Rotation',c.rotation,value=>P.update(c.id,{rotation:Number(value)}),{choices:[['0','0°'],['90','90°'],['180','180°'],['270','270°']]});
    for(const [key,label] of [['description','Description'],['voltage','Voltage'],['frequency','Frequency'],['power','Power'],['notes','Notes']])field(panel,label,c[key],value=>P.update(c.id,{[key]:value}),{multiline:['description','notes'].includes(key)});
    ports(c);
    const edges=P.state.connections.filter(e=>e.source.componentId===c.id||e.target.componentId===c.id);
    panel.append(text('h3','section-title',`CONNECTIONS / ${edges.length}`));
    for(const edge of edges){const button=text('button','connection-list-item',`${P.component(edge.source.componentId).name} → ${P.component(edge.target.componentId).name} · ${edge.label||edge.interfaceType}`);button.addEventListener('click',()=>P.select(edge.id,'connection'));panel.append(button);}
    panel.append(text('div','uuid','COMPONENT UUID / '+c.id));
  }
  function render(){
    const scroll=panel.scrollTop;panel.replaceChildren();
    if(P.ui.selection.length>1){
      document.getElementById('selection-badge').textContent='MULTI SELECT';
      heading(`${P.ui.selection.length} 個物件已選取`,'框選 / Shift 點擊可調整選取範圍','▧');
      for(const [kind,label] of [['component','方塊'],['connection','工程連線'],['line','獨立直線']])panel.append(text('p','inspector-note',`${label}：${P.ui.selection.filter(s=>s.kind===kind).length}`));
      panel.append(text('p','inspector-note','拖曳選取的方塊或直線可整組移動。Ctrl+C 複製，Ctrl+V 貼上，Delete 刪除選取物件。點擊其他物件可回到單選編輯。'));
      return;
    }
    const c=P.ui.selectedKind==='component'?P.component(P.ui.selected):null,edge=P.ui.selectedKind==='connection'?P.connection(P.ui.selected):null;
    const line=P.ui.selectedKind==='line'?P.line(P.ui.selected):null;
    document.getElementById('selection-badge').textContent=c?'COMPONENT':edge?'CONNECTION':line?'LINE':'NO SELECTION';
    if(c)component(c);else if(edge)connection(edge);else if(line)freeLine(line);else {const empty=text('div','no-selection','');empty.append(text('div','icon','⌖'),text('strong','','Inspect your engineering graph'),text('p','','Select a block, connection or free line to edit. Use Line to draw independent lines with adjustable arrows.'));panel.append(empty);}
    panel.scrollTop=scroll;
  }
  P.subscribe(({type,id})=>{
    if(['selection','remove','connection-remove','line-remove','clear','project-load'].includes(type))render();
    if(type==='line-update'&&P.ui.selected===id){const line=P.line(id);for(const key of ['x1','y1','x2','y2']){const input=panel.querySelector(`[name="${key}"]`);if(input&&document.activeElement!==input)input.value=line[key];}}
    if(type==='ports'){
      if(!panel.contains(document.activeElement)||!document.activeElement.matches('input,select,textarea'))render();
      else {
        const c=P.component(P.ui.selected);
        if(c){const min=P.minimumSize(c.id);for(const key of ['width','height']){const input=panel.querySelector(`[name="${key}"]`);if(input){input.min=min[key];if(document.activeElement!==input)input.value=c[key];}}
          for(const card of panel.querySelectorAll('.port-card')){const port=P.port(card.dataset.portId);if(!port)continue;const usage=P.portUsage(port.id),label=card.querySelector('.port-usage');label.textContent=`${usage} / ${port.maxConnections??'∞'} connections`;label.classList.toggle('invalid',port.maxConnections!==null&&usage>port.maxConnections);}
        }
      }
    }
    if(type==='resize'&&id===P.ui.selected){const c=P.component(id);for(const key of ['width','height']){const input=panel.querySelector(`[name="${key}"]`);if(input&&document.activeElement!==input)input.value=Math.round(c[key]);}}
  });render();
})(window.Planner);
