(function(P){
  'use strict';
  const $=id=>document.getElementById(id),fmt=v=>Number.isFinite(v)?v.toFixed(2):'—';
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  function table(headers,rows){const wrap=make('div',undefined,'budget-table-wrap'),t=make('table'),head=make('thead'),tr=make('tr');headers.forEach(h=>tr.append(make('th',h)));head.append(tr);t.append(head);const body=make('tbody');rows.forEach(row=>{const tr=make('tr');row.forEach(value=>{const td=make('td');if(value instanceof Node)td.append(value);else td.textContent=value;tr.append(td);});body.append(tr);});t.append(body);wrap.append(t);return wrap;}
  function settings(){const bandwidthMHz=Number($('budget-bandwidth').value),snrDb=Number($('budget-snr').value),fRaw=$('budget-frequency').value.trim(),frequencyMHz=fRaw===''?null:Number(fRaw);
    if(!(P.validFrequency?P.validFrequency(frequencyMHz):frequencyMHz===null||frequencyMHz>0)){$('budget-status').textContent='工作頻率須為 0.001–1,000,000 MHz；留空則自動從天線／TRX 的 Frequency 欄位偵測。';return false;}if(!$('budget-bandwidth').value||!$('budget-snr').value||!Number.isFinite(bandwidthMHz)||bandwidthMHz<=0||bandwidthMHz>100000||!Number.isFinite(snrDb)||snrDb< -100||snrDb>100){$('budget-status').textContent='請輸入有效頻寬（> 0 至 100000 MHz）與 SNR（−100 至 100 dB）。';return false;}P.state.linkBudget={bandwidthMHz,snrDb,frequencyMHz};return true;}
  // Effective working frequency: manual setting, else detected per antenna / TRX (see PRD frequencyFor).
  function frequencyLabel(rows){
    const f=P.state.linkBudget.frequencyMHz,lambda=m=>{const cm=29979.2458/m;return cm>=1?`λ ${cm.toFixed(2)} cm`:`λ ${(cm*10).toFixed(2)} mm`;};
    if(f!==null&&f!==undefined)return {main:`${f} MHz`,sub:`手動設定 · ${lambda(f)}`};
    const found=[...new Set(rows.map(r=>P.prd?.frequencyFor(r).frequencyMHz).filter(Boolean))];
    return found.length?{main:found.map(v=>v+' MHz').join('、'),sub:'自動偵測（天線／TRX Frequency 欄位）'}:{main:'未設定',sub:'請輸入工作頻率，或在天線 Frequency 欄位填寫'};
  }
  function render(){
    const config=P.state.linkBudget;$('budget-bandwidth').value=config.bandwidthMHz;$('budget-snr').value=config.snrDb;if(document.activeElement!==$('budget-frequency'))$('budget-frequency').value=config.frequencyMHz??'';
    const rows=P.linkBudget.evaluate(),target=$('budget-results');target.replaceChildren();$('budget-summary').replaceChildren();
    for(const [title,value] of [['工作頻率',frequencyLabel(rows)],['Tx 路徑',rows.filter(r=>r.kind==='tx').length],['Rx 路徑',rows.filter(r=>r.kind==='rx').length],['資料待補／路徑未完成',rows.filter(r=>!r.valid).length]]){const card=make('article');card.append(make('small',title),make('strong',value?.main??value));if(value?.sub)card.append(make('small',value.sub,'budget-card-sub'));$('budget-summary').append(card);}
    const candidates=P.rfConnectionCandidates();
    if(candidates.length){
      const notice=make('section',undefined,'budget-diagnostic');notice.id='budget-rf-diagnostic';
      notice.append(make('h2',`發現 ${candidates.length} 條 RF 元件間的線路仍是 Digital`),make('p','這些 Connect 線已連到元件，但介面不是 RF，因此尚未納入 Link Budget。請確認用途後轉為 RF。'));
      const button=make('button','將下列 Digital 線全部設為 RF');button.id='budget-convert-rf';button.onclick=()=>{for(const e of candidates)P.updateConnection(e.id,{interfaceType:'RF'});render();};notice.append(button);
      notice.append(table(['來源 → 目的','目前類型','調整'],candidates.map(e=>{const action=make('button','設為 RF');action.onclick=()=>{P.updateConnection(e.id,{interfaceType:'RF'});render();};return [`${P.component(e.source.componentId).name} → ${P.component(e.target.componentId).name}`,e.interfaceType,action];})));target.append(notice);
    }
    if(!rows.length){target.append(make('p','尚無 RF Transceiver（TRX）。請在第一頁新增 TRX、RF 元件與 RF 連線。','budget-empty'));return;}
    for(const kind of ['tx','rx']){
      target.append(make('h2',kind==='tx'?'Tx · 天線饋入端最大功率':'Rx · 天線端輸入靈敏度'));
      const subset=rows.filter(r=>r.kind===kind);
      target.append(table(['TRX / 通道','RF 路徑',kind==='tx'?'Max power (dBm)':'Sensitivity (dBm)',kind==='tx'?'限制來源':'Cascade NF (dB)','狀態 / 明細'],subset.map(r=>{
        const status=make('div');status.append(make('span',r.valid?(r.warnings.length?'有條件估算':'估算完成'):'未完成',r.valid?'budget-valid':'budget-invalid'));
        for(const message of r.warnings)status.append(make('p',message));
        const details=make('details'),summary=make('summary','逐級明細與編輯');details.append(summary);
        details.append(table(['級','Gain (dB)','NF (dB)','累積 Gain',kind==='tx'?'輸出 (dBm)':'累積 NF (dB)'],r.stages.map(s=>[s.name,fmt(s.gain),fmt(s.nf),fmt(s.cumulativeGain),fmt(kind==='tx'?s.power:s.cumulativeNf)])));
        const edit=make('button','編輯 TRX 參數');edit.onclick=()=>{document.querySelector('[data-tab="architecture"]').click();P.select(r.trxId);};details.append(edit);
        for(const id of r.edgeIds){const e=P.connection(id),button=make('button',`編輯線路 ${e?.label||id.slice(0,8)}`);button.onclick=()=>{document.querySelector('[data-tab="architecture"]').click();P.select(id,'connection');};details.append(button);}status.append(details);
        return [`${r.trx} / ${kind.toUpperCase()} ${r.channel}`,r.path,fmt(r.value),kind==='tx'?r.limiter:fmt(r.nf),status];
      })));
    }
  }
  function sheets(){const rows=P.linkBudget.evaluate(),s=P.state.linkBudget;
    return [
      {name:'Summary',widths:[28,12,12,70,20,22,18,18,38,70],rows:[['TRX','Direction','Channel','Path','Status','Result (dBm)','Gain (dB)','NF (dB)','Limiter','Warnings'],...rows.map(r=>[r.trx,r.kind.toUpperCase(),r.channel,r.path,r.valid?(r.warnings.length?'Conditional':'Complete'):'Incomplete',r.value,r.gain,r.nf,r.limiter,r.warnings.join('\n')])]},
      {name:'Stages',widths:[28,12,12,70,35,18,18,22,22,22],rows:[['TRX','Direction','Channel','Path','Stage','Gain (dB)','NF (dB)','Cumulative gain (dB)','Tx output (dBm)','Cumulative NF (dB)'],...rows.flatMap(r=>r.stages.map(s=>[r.trx,r.kind.toUpperCase(),r.channel,r.path,s.name,s.gain,s.nf,s.cumulativeGain,s.power,s.cumulativeNf]))]},
      {name:'RF Components',widths:[38,28,22,18,18,22,22,22,22,22,22,22],rows:[['UUID','Name','Type','Tx channels','Rx channels','Tx DA (dBm)','Rx LNA Gain (dB)','Rx LNA NF (dB)','Gain (dB)','NF (dB)','Loss (dB)','OP1dB / Max input (dBm)'],...P.state.components.filter(c=>P.rfFields(c).length).map(c=>[c.id,c.name,c.type,c.txChannels,c.rxChannels,c.txPower,c.rxGain,c.rxNf,c.rfGain,c.rfNf,c.rfLoss,c.type==='PA'?c.p1db:c.maxInput])]},
      {name:'RF Ports',widths:[38,28,22,18,18,22,22],rows:[['UUID','Component','Port','Direction','Managed lane','Signal mode','Loss (dB)','Max Level (dBm)'],...P.state.ports.filter(p=>p.type==='RF').map(p=>[p.id,P.component(p.componentId)?.name,p.name,p.direction,p.rfKey,p.signalMode||'single',p.loss,p.maxLevel])]},
      {name:'Connections',widths:[38,28,28,24,18,16,16,16,16],rows:[['UUID','From','To','Label','Interface','Loss (dB)','RF mode','Tx channel','Rx channel','Source port / polarity','Target port / polarity'],...P.state.connections.map(e=>[e.id,P.component(e.source.componentId)?.name,P.component(e.target.componentId)?.name,e.label,e.interfaceType,e.loss,e.rfMode,e.txChannel,e.rxChannel,(P.port(e.source.portId)?.name||e.source.anchor)+(e.source.polarity||''),(P.port(e.target.portId)?.name||e.target.anchor)+(e.target.polarity||'')])]},
      {name:'Assumptions',widths:[35,110],rows:[['Setting / Model','Value'],['Project',P.state.project.name],['Exported UTC',new Date().toISOString()],['Rx bandwidth (MHz)',s.bandwidthMHz],['Required SNR (dB)',s.snrDb],['Working frequency (MHz)',s.frequencyMHz??'Auto-detect from Antenna / TRX Frequency field'],['Temperature', '290 K; thermal noise density -174 dBm/Hz'],['Rx sensitivity','-174 + 10*log10(BW_Hz) + cascaded_NF_dB + SNR_dB'],['Cascaded NF','F1 + (F2-1)/G1 + ... ; F/G in linear units; passive NF = Loss'],['Tx','Maximum feasible drive + cumulative Gain; constrained by DA power, PA output P1dB, passive Max input'],['P1dB model','Planning output cap; not Psat or exact compression; excludes modulation back-off'],['Scope','Conducted antenna feed power and antenna-referred sensitivity; excludes EIRP, air path loss, antenna gain and TRX stages after input LNA'],['Branches','Independent switched paths, no splitter/combiner loss or switch-state model'],['Connection defaults','Loss = 0 dB; channel = 1; RF mode = auto. Missing component values block result.'],['Export','Computed snapshot, not an editable formula model; recalculate in the app and export again.'],['NF reference','https://www.analog.com/en/resources/technical-articles/improving-receiver-sensitivity-with-external-lna.html'],['P1dB reference','https://www.keysight.com/us/en/use-cases/measure-amplifier-gain-compression-and-p1db.html']]}
    ];
  }
  function exportExcel(){if(!settings())return false;render();try{const bytes=P.xlsx.build(sheets()),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='RF-Link-Budget.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);$('budget-status').textContent='Excel 匯出完成（包含缺項與警告）。';return true;}catch(error){$('budget-status').textContent='匯出失敗：'+error.message;return false;}}
  $('budget-recalculate').onclick=()=>{if(settings()){render();$('budget-status').textContent='已依目前方塊圖重新估算。';}};
  $('budget-export').onclick=exportExcel;$('budget-save').onclick=()=>{if(settings()&&P.saveProject())$('budget-status').textContent='專案與 Link Budget 設定已儲存。';};
  for(const id of ['budget-bandwidth','budget-snr','budget-frequency'])$(id).addEventListener('change',()=>{if(settings())render();});
  P.subscribe(({type})=>{if(type==='project-load'||type==='link-budget-update')render();else if(P.ui.tab==='budget'&&!['selection','tab','warning'].includes(type))render();});
  P.budgetUI={render,sheets,exportExcel};
})(window.Planner);
