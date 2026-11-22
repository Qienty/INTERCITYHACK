import {campaignRanges,periodRange,withSchedule,scheduleErrors} from './campaign.mjs';
import {validDate} from './engine.mjs';

export function scheduleForm(brief,plan,esc,icon){
  const s=brief.schedule||{unit:'custom',mode:'continuous'},ranges=campaignRanges(brief);
  const units=[['year','年度'],['quarter','季度'],['month','月度'],['custom','自定义时间']];
  const periodSelect=(r,index)=>{
    const value=r.start? s.unit==='quarter'?Math.ceil(Number(r.start.slice(5,7))/3):Number(r.start.slice(5,7)):'';
    if(s.unit==='custom')return '<div class="dates">'+['start','end'].map(edge=>`<input type="date" min="2027-01-01" max="2027-12-31" aria-label="${s.mode==='segments'?'第 '+(index+1)+' 段':''}投放${edge==='start'?'开始':'结束'}日期" title="${edge==='start'?'开始':'结束'}日期" ${s.mode==='segments'?'data-range-index="'+index+'" data-range-edge="'+edge+'"':'data-brief="'+edge+'"'} value="${esc(r[edge])}">`).join('')+'</div>';
    return `<div class="period-picker"><span>2027 年</span>${s.unit==='year'?'<strong>全年</strong>':'<select data-period-index="'+index+'" aria-label="'+(s.mode==='segments'?'第 '+(index+1)+' 段':'')+'投放'+(s.unit==='month'?'月份':'季度')+'"><option value="">请选择'+(s.unit==='month'?'月份':'季度')+'</option>'+Array.from({length:s.unit==='month'?12:4},(_,i)=>'<option value="'+(i+1)+'" '+(value===i+1?'selected':'')+'>'+(s.unit==='month'?(i+1)+' 月':'第 '+(i+1)+' 季度')+'</option>').join('')+'</select>'}</div><p class="period-dates">${r.start&&r.end?esc(r.start)+' 至 '+esc(r.end):'选择周期后自动生成完整起止日期'}</p>`;
  };
  const errors=scheduleErrors(brief,validDate),ready=!errors.length;
  const days=ready?ranges.reduce((sum,r)=>sum+Math.round((Date.parse(r.end)-Date.parse(r.start))/86400000)+1,0):0;
  const periods=ready?ranges.reduce((sum,r)=>sum+Math.ceil((Math.round((Date.parse(r.end)-Date.parse(r.start))/86400000)+1)/28),0):0;
  return `<div class="field schedule-field" id="schedule-editor"><div class="field-label">投放日期 <small>2027 年内</small></div><div class="schedule-unit"><label class="sr-only" for="schedule-unit">日期周期</label><select id="schedule-unit" data-schedule-unit>${units.map(([id,label])=>'<option value="'+id+'" '+(s.unit===id?'selected':'')+'>'+label+'</option>').join('')}</select></div><div class="schedule-mode" role="group" aria-label="投放方式">${[['continuous','全部时间'],['segments','分段投放']].map(([id,label])=>'<button type="button" data-schedule-mode="'+id+'" aria-pressed="'+(s.mode===id)+'" class="'+(s.mode===id?'selected':'')+'">'+label+'</button>').join('')}</div>${s.mode==='segments'?'<div class="schedule-segments">'+ranges.map((r,i)=>'<div class="schedule-segment"><div class="segment-heading"><strong>第 '+(i+1)+' 段</strong><button class="btn subtle" type="button" data-remove-segment="'+i+'" aria-label="删除第 '+(i+1)+' 段">'+icon('close',14)+'</button></div>'+periodSelect(r,i)+'</div>').join('')+'</div><button class="btn small add-segment" type="button" data-add-segment '+(ranges.length>=24?'disabled':'')+'>'+icon('plus',14)+'添加投放时段</button>':periodSelect({start:brief.start,end:brief.end},0)}<div class="field-hint schedule-summary" aria-live="polite">${icon('calendar',12)} ${ready? (s.mode==='segments'?ranges.length+' 段 · ':'')+days+' 天投放 · '+periods+' 个 28 天计费期':'请填写有效投放日期'}<br>${s.mode==='segments'?'每段分别向上取整计费，间隔日期不计入。':'所选时间连续投放；日期选择不改变刊例价计费口径。'}</div>${errors.some(e=>e.includes('重叠'))?'<p class="schedule-error" role="alert">投放分段不能重叠，请调整日期。</p>':''}</div>`;
}

export function installSchedule({getBrief,setBrief,changed}){
  const commit=s=>{setBrief(withSchedule(getBrief(),s));changed();};
  const current=()=>{const b=getBrief();return {...(b.schedule||{unit:'custom',mode:'continuous'}),ranges:campaignRanges(b)};};
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-schedule-mode],[data-add-segment],[data-remove-segment]');if(!button||button.disabled)return;
    const s=current();
    if(button.hasAttribute('data-schedule-mode')){const mode=button.dataset.scheduleMode;if(mode===s.mode)return;s.mode=mode;if(mode==='continuous'){const bounds=withSchedule({}, {...s,mode:'segments'});if(s.ranges.length>1)s.unit='custom';s.ranges=[{start:bounds.start,end:bounds.end}];}}
    if(button.hasAttribute('data-add-segment')){if(s.ranges.length>=24)return;s.ranges.push(s.unit==='year'?periodRange('year',2027):{start:'',end:''});}
    if(button.hasAttribute('data-remove-segment'))s.ranges.splice(Number(button.dataset.removeSegment),1);
    commit(s);
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.hasAttribute('data-schedule-unit')){const s=current();s.unit=el.value;s.ranges=s.ranges.length?s.ranges.map(r=>s.unit==='custom'?r:s.unit==='year'?periodRange('year',2027):{start:'',end:''}):[{start:'',end:''}];commit(s);}
    if(el.hasAttribute('data-period-index')){const s=current();s.ranges[Number(el.dataset.periodIndex)]=periodRange(s.unit,2027,el.value);commit(s);}
    if(el.hasAttribute('data-range-edge')){const s=current();s.ranges[Number(el.dataset.rangeIndex)][el.dataset.rangeEdge]=el.value;commit(s);}
  });
}
