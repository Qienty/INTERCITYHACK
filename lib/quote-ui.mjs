import {conditionPatch} from './state-validation.mjs';

export function installQuoteUI({getState,modal,save,render,toast,esc,referencePrice,rates=[]}){
  let currentRate=null;
  const rateFor=row=>{
    const direct=(row.rateIds||[]).map(id=>rates.find(rate=>rate.id===id)).find(Boolean);if(direct)return direct;
    // 地铁接口用 L1/L2/L3，测算映射与 07 刊例的 A++/A+ 对应（与刊例测算一致）。
    const mapped=row.media==='metro'?({L1:'A++',L2:'A+',L3:'A+'}[row.grade]||row.grade):row.grade;
    return rates.find(rate=>rate.media===row.media&&rate.name===mapped)||null;
  };
  const rangeValue=(rate,key,basis)=>{const low=Number(rate[key+'Low']),high=Number(rate[key+'High']);if(!Number.isFinite(low)||!Number.isFinite(high))return null;return basis==='low'?low:basis==='high'?high:(low+high)/2;};
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-condition-resource]');if(!button)return;
    const row=getState().records.find(r=>r.id===button.dataset.conditionResource);if(!row)return;
    currentRate=rateFor(row);
    const value=key=>esc(row[key]??'');
    const rateBlock=currentRate?`<div class="rate-prefill"><strong>可从 07-媒体刊例价.xlsx 区间填入（可选）</strong><div class="rate-fill-row"><select id="condition-rate-basis" aria-label="刊例取值"><option value="">不自动填</option><option value="low">区间下限</option><option value="mid" selected>区间中位</option><option value="high">区间上限</option></select><button type="button" class="btn small" data-rate-fill>填入价格与计费口径</button></div><p class="field-hint">原始区间：${esc(currentRate.priceText)} / ${esc(currentRate.periodText)}；制作费：${esc(currentRate.productionText||'未提供')}。填入后仍需核实可售日期、含税口径并保存，区间价不等于成交价。</p></div>`:'';
    modal('补充已核实报价条件 · '+row.name,'<form id="resource-conditions" data-resource-id="'+esc(row.id)+'"><p>仅填写已核实的精确价格和可售档期，填写内容保存在当前项目中。</p>'+(referencePrice(row)?'<div class="note-box">原始参考：'+esc(referencePrice(row))+'。区间与自然月价格不会自动换算成精确 28 天单价。</div>':'')+rateBlock+'<div class="two-fields"><div class="field"><label for="condition-price">精确媒介单价（元 / 所选计价单位）</label><input id="condition-price" name="unitPrice" type="number" step="0.01" min="0.01" required value="'+value('unitPrice')+'"></div><div class="field"><label for="condition-production">单资源制作费（元）</label><input id="condition-production" name="production" type="number" step="0.01" min="0" required value="'+value('production')+'"></div></div><div class="field"><label for="condition-period">已核实的计价口径</label><select id="condition-period" name="periodDays" required><option value="">请选择已确认口径</option><option value="28" '+(row.periodDays===28&&!['day','calendarMonth'].includes(row.billingUnit)?'selected':'')+'>每 28 天</option><option value="day" '+(row.billingUnit==='day'?'selected':'')+'>按天</option><option value="calendarMonth" '+(row.billingUnit==='calendarMonth'?'selected':'')+'>自然月：各分段触及月份分别计月</option></select></div><div class="two-fields"><div class="field"><label for="condition-start">可售开始日期</label><input id="condition-start" name="availableStart" type="date" required value="'+value('availableStart')+'"></div><div class="field"><label for="condition-end">可售结束日期</label><input id="condition-end" name="availableEnd" type="date" required value="'+value('availableEnd')+'"></div></div><div class="field"><label for="condition-source">价格及档期核实来源</label><textarea id="condition-source" name="priceSource" required maxlength="500" placeholder="填写核价文件、核实记录与日期">'+value('priceSource')+'</textarea></div><label class="condition-tax"><input type="checkbox" name="priceIncludesTax" value="true" '+(row.priceIncludesTax===true?'checked':'')+'>精确单价和制作费均已确认为含税价格</label><div class="two-fields"><div class="field"><label for="condition-tax-rate">若为未税：已核实税率（%）</label><input id="condition-tax-rate" name="taxRate" type="number" step="0.01" min="0" max="100" value="'+value('taxRate')+'"></div><div class="field"><label for="condition-billing-source">计价与计税规则来源</label><input id="condition-billing-source" name="billingSource" maxlength="500" value="'+value('billingSource')+'"></div></div><p class="source-material-note">自然月按各分段触及的月份分别计费，同月分段也分别计月；仅在企业明确认可此规则时使用。未税媒介费先打折，再按每资源将媒介费、制作费分别计税到分；其他费用沿用含税口径。区间刊例不自动取中值。</p><div id="condition-errors" class="alert error" role="alert" hidden></div><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn dark">保存核实条件并重新计算</button></div></form>');
  });
  document.addEventListener('click',event=>{
    const fill=event.target.closest('[data-rate-fill]');if(!fill)return;
    if(!currentRate)return;
    const basis=document.getElementById('condition-rate-basis')?.value||'mid';
    const price=rangeValue(currentRate,'price',basis);
    if(!Number.isFinite(price)){toast('该刊例没有可用的价格区间');return;}
    const priceInput=document.getElementById('condition-price');if(priceInput)priceInput.value=String(Math.round(price*100)/100);
    const production=rangeValue(currentRate,'production',basis);
    if(Number.isFinite(production)){const productionInput=document.getElementById('condition-production');if(productionInput)productionInput.value=String(Math.round(production*100)/100);}
    const period=document.getElementById('condition-period');
    if(period){if(/月/.test(currentRate.periodText||''))period.value='calendarMonth';else if(/天|日/.test(currentRate.periodText||''))period.value='day';}
    const billingSource=document.getElementById('condition-billing-source');
    if(billingSource&&!billingSource.value)billingSource.value='07-媒体刊例价.xlsx · 原始发布期「'+(currentRate.periodText||'未注明')+'」';
    const source=document.getElementById('condition-source');
    if(source&&!source.value)source.value='07-媒体刊例价.xlsx · '+({low:'区间下限',mid:'区间中位',high:'区间上限'}[basis]||'区间中位')+'（'+currentRate.priceText+' / '+(currentRate.periodText||'')+'），测算值待核实';
    toast('已按刊例区间填入价格与计费口径；请补齐可售日期与含税口径后再保存');
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(form.id!=='resource-conditions')return;event.preventDefault();
    const values=Object.fromEntries(new FormData(form)),result=conditionPatch(values);
    if(result.errors.length){const box=document.getElementById('condition-errors');box.hidden=false;box.textContent=result.errors.join('；');return;}
    const state=getState(),row=state.records.find(r=>r.id===form.dataset.resourceId);if(!row)return;
    Object.assign(row,result.patch,{conditionsConfirmedAt:new Date().toISOString(),quoteReconfirmationRequired:false,inventoryReconfirmationRequired:false});save();document.getElementById('modal').close();render();toast('已保存核实条件，方案已重新计算');
  });
}
