(()=>{
'use strict';
const DB='attendance-v02',STORE='state',KEY='main';
const uid=()=>globalThis.crypto?.randomUUID?.()||`rec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function readState(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function updateState(mutator){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),req=store.get(KEY);req.onsuccess=()=>{const state=req.result;if(!state){reject(new Error('既存データが見つかりません'));return}mutator(state);store.put(state,KEY)};req.onerror=()=>reject(req.error);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
function classInfo(state,title=''){const classes=Array.isArray(state?.classes)?state.classes:[];return classes.find(c=>title.includes(c.name||''))||null}
function numberFromRow(row){const first=row.firstElementChild?.textContent||row.textContent||'';const m=first.match(/\d+/);return m?Number(m[0]):null}
function contextFromSheet(state,row){const sheet=row.closest('.sheet');const title=sheet?.querySelector('.sheet-head h2')?.textContent?.trim()||'';const sub=sheet?.querySelector('.sheet-head p')?.textContent?.trim()||'';const cls=classInfo(state,title);return {classId:cls?.id||null,className:cls?.name||title,schoolId:cls?.schoolId||null,studentNumber:numberFromRow(row),lessonLabel:sub,date:(sub.match(/\d{4}-\d{2}-\d{2}/)||[])[0]||today(),scene:'授業中'}}
async function addRecord(base,type){if(base.studentNumber==null){alert('生徒番号を取得できませんでした。');return}
 let record;
 if(type==='LEARNING'){
   const summary=prompt('学習記録：つまずき・できたこと'); if(summary===null)return;
   const next=prompt('次に試すこと・支援',''); if(next===null)return;
   const followUp=confirm('次回の授業で確認しますか？');
   record={id:uid(),type,createdAt:new Date().toISOString(),...base,summary,nextSupport:next,followUp,resolvedAt:null};
 }else{
   const facts=prompt('指導記録：何があったか（事実中心）'); if(facts===null)return;
   const reaction=prompt('本人の反応・様子',''); if(reaction===null)return;
   const response=prompt('行った対応',''); if(response===null)return;
   const followUp=confirm('次回確認が必要ですか？');
   record={id:uid(),type,createdAt:new Date().toISOString(),...base,facts,reaction,response,followUp,resolvedAt:null};
 }
 await updateState(s=>{s.studentRecords=Array.isArray(s.studentRecords)?s.studentRecords:[];s.studentRecords.push(record)});
 alert(type==='LEARNING'?'学習記録を保存しました。':'指導記録を保存しました。');location.reload();
}
async function resolveFollowUp(id){if(!confirm('この「次回確認」を確認済みにしますか？'))return;await updateState(s=>{const r=(s.studentRecords||[]).find(x=>x.id===id);if(r)r.resolvedAt=new Date().toISOString()});location.reload()}
function enhanceNumberGroups(){
 const rows=[...document.querySelectorAll('.students .student')];
 const numbered=rows.map(row=>({row,num:numberFromRow(row)})).filter(x=>Number.isFinite(x.num));
 numbered.forEach(({row,num},index)=>{
  const band=Math.floor((num-1)/5);
  row.classList.remove('am-number-band-a','am-number-band-b','am-number-band-end');
  row.classList.add(band%2===0?'am-number-band-a':'am-number-band-b');
  row.dataset.numberBand=`${band*5+1}-${band*5+5}`;
  const next=numbered[index+1];
  if(!next||Math.floor((next.num-1)/5)!==band)row.classList.add('am-number-band-end');
 });
}
async function enhanceRows(){enhanceNumberGroups();let state;try{state=await readState()}catch{return}const records=Array.isArray(state?.studentRecords)?state.studentRecords:[];
 document.querySelectorAll('.student').forEach(row=>{
  if(row.dataset.amEnhanced)return;row.dataset.amEnhanced='1';const base=contextFromSheet(state,row);if(base.studentNumber==null)return;
  const controls=row.querySelector('div')||row;const wrap=document.createElement('span');wrap.className='am-record-buttons';
  const learn=document.createElement('button');learn.type='button';learn.textContent='学習';learn.onclick=e=>{e.stopPropagation();addRecord(base,'LEARNING').catch(err=>alert(err.message))};
  const guide=document.createElement('button');guide.type='button';guide.textContent='指導';guide.onclick=e=>{e.stopPropagation();addRecord(base,'GUIDANCE').catch(err=>alert(err.message))};wrap.append(learn,guide);
  const pending=records.filter(r=>r.followUp&&!r.resolvedAt&&r.studentNumber===base.studentNumber&&(!base.classId||!r.classId||r.classId===base.classId));
  if(pending.length){const follow=document.createElement('button');follow.type='button';follow.className='am-follow';follow.textContent=`● 次回確認 ${pending.length}`;follow.onclick=e=>{e.stopPropagation();resolveFollowUp(pending[0].id).catch(err=>alert(err.message))};wrap.append(follow)}
  controls.appendChild(wrap);
 })
}

function classNumbers(state,cls,date=today()){
 const start=Number(cls?.studentNumberStart),end=Number(cls?.studentNumberEnd);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return [];
 return Array.from({length:end-start+1},(_,i)=>start+i).filter(num=>{
  const info=(state.enrollments||[]).find(x=>x.classId===cls.id&&Number(x.studentNumber)===num);
  return !info?.excluded&&(!info?.startDate||date>=info.startDate)&&(!info?.endDate||date<=info.endDate);
 });
}
function choose(title,items,label=x=>String(x)){
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='am-modal-bg';
  const box=document.createElement('div');box.className='am-modal';
  const h=document.createElement('h3');h.textContent=title;box.appendChild(h);
  items.forEach(item=>{const b=document.createElement('button');b.type='button';b.textContent=label(item);b.onclick=()=>{overlay.remove();resolve(item)};box.appendChild(b)});
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='キャンセル';cancel.onclick=()=>{overlay.remove();resolve(null)};box.appendChild(cancel);
  overlay.appendChild(box);document.body.appendChild(overlay);
 })
}
function lessonContext(state){
 const sheet=document.querySelector('.sheet'); if(!sheet)return null;
 const title=sheet.querySelector('.sheet-head h2')?.textContent?.trim()||'';
 const sub=sheet.querySelector('.sheet-head p')?.textContent?.trim()||'';
 const cls=classInfo(state,title); if(!cls)return null;
 const date=(sub.match(/\d{4}-\d{2}-\d{2}/)||[])[0]||today();
 return {classId:cls.id,className:cls.name,schoolId:cls.schoolId||null,date,lessonLabel:sub,lessonId:[cls.schoolId||'',cls.id,date,sub].join('|')};
}
function previousHandoff(state,ctx){
 const list=(state.lessonHandoffs||[]).filter(x=>x.classId===ctx.classId&&x.date<ctx.date).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 return list[0]||null;
}
async function saveHandoff(ctx,patch){await updateState(s=>{s.lessonHandoffs=Array.isArray(s.lessonHandoffs)?s.lessonHandoffs:[];let r=s.lessonHandoffs.find(x=>x.lessonId===ctx.lessonId);if(!r){r={...ctx,id:uid(),createdAt:new Date().toISOString()};s.lessonHandoffs.push(r)}Object.assign(r,patch,{updatedAt:new Date().toISOString()})})}
async function addLessonHandoff(){
 let state;try{state=await readState()}catch{return}
 const ctx=lessonContext(state);if(!ctx||document.getElementById('am-handoff'))return;
 const prev=previousHandoff(state,ctx), current=(state.lessonHandoffs||[]).find(x=>x.lessonId===ctx.lessonId)||{};
 const sheet=document.querySelector('.sheet');const card=document.createElement('section');card.id='am-handoff';card.className='am-handoff';
 const prevText=prev?.finishedAt||'（前回記録なし）', seed=current.startWith??prev?.nextTime??'';
 card.innerHTML='<strong>授業引き継ぎ</strong><div class="am-prev">前回終了：'+escapeHtml(prevText)+'</div><label>今日やり始めること<textarea id="am-start"></textarea></label><label>今日終了したところ<textarea id="am-finish"></textarea></label><label>次の時間にやりたいこと<textarea id="am-next"></textarea></label><button type="button" id="am-save-handoff">保存</button>';
 sheet.insertBefore(card,sheet.firstChild);
 card.querySelector('#am-start').value=seed;card.querySelector('#am-finish').value=current.finishedAt||'';card.querySelector('#am-next').value=current.nextTime||'';
 card.querySelector('#am-save-handoff').onclick=async()=>{await saveHandoff(ctx,{startWith:card.querySelector('#am-start').value.trim(),finishedAt:card.querySelector('#am-finish').value.trim(),nextTime:card.querySelector('#am-next').value.trim()});alert('授業引き継ぎを保存しました。')};
}
function escapeHtml(v){const d=document.createElement('div');d.textContent=v??'';return d.innerHTML}
async function quickGuidance(){let state;try{state=await readState()}catch(e){alert(e.message);return}const classes=(state.classes||[]).filter(c=>c&&c.id);if(!classes.length){alert('登録クラスがありません。');return}const cls=await choose('クラスを選択',classes,c=>c.name||c.id);if(!cls)return;const nums=classNumbers(state,cls);if(!nums.length){alert('選択できる出席番号がありません。');return}const studentNumber=await choose('出席番号を選択',nums);if(studentNumber==null)return;const scene=prompt('場面（休み時間／昼休み／放課後／その他）','休み時間');if(scene===null)return;await addRecord({classId:cls.id,className:cls.name||'',schoolId:cls.schoolId||null,studentNumber,date:today(),scene},'GUIDANCE')}
function addQuickButton(){const header=document.querySelector('header');if(!header||document.getElementById('am-quick-guidance'))return;const b=document.createElement('button');b.id='am-quick-guidance';b.type='button';b.textContent='＋ 指導記録';b.onclick=()=>quickGuidance().catch(e=>alert(e.message));header.appendChild(b)}
function addStyle(){if(document.getElementById('am-enh-style'))return;const s=document.createElement('style');s.id='am-enh-style';s.textContent=`.am-calendar-settings{display:block;padding:18px;max-width:1100px;margin:0 auto}.am-settings-card{background:#fff;border:1px solid #dfe5ee;border-radius:16px;margin:0 0 16px;padding:16px}.am-settings-card h2,.am-settings-card h3{margin-top:0}.am-actions,.am-row-actions{display:flex;gap:8px;flex-wrap:wrap}.am-actions button,.am-row-actions button,.am-setting-row>button{min-height:44px;background:#fff;border:1px solid #cfd5df;border-radius:10px;padding:9px 12px}.am-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #edf0f4;padding:12px 0}.am-setting-row span,.am-setting-row small{display:block;color:#697386}.danger{color:#b52f2f!important}.am-exam-attendance{max-width:760px}.am-exam-head{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center}.am-exam-head h3{margin:0}@media(max-width:760px){.am-setting-row{align-items:flex-start;flex-direction:column}.am-row-actions{width:100%}.am-row-actions button{flex:1 1 120px}}.am-modal-bg{position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}.am-modal{background:#fff;border-radius:16px;padding:16px;max-width:420px;width:100%;max-height:80vh;overflow:auto;display:grid;gap:8px}.am-modal button{min-height:44px}.am-handoff{margin:12px 0;padding:14px;border:1px solid #d7dde7;border-radius:14px;background:#f8fafc;display:grid;gap:10px}.am-handoff label{display:grid;gap:4px;font-weight:700}.am-handoff textarea{min-height:54px;font-size:16px;padding:9px;border:1px solid #cbd5e1;border-radius:10px}.am-prev{padding:8px;background:#fff;border-radius:9px}.am-record-buttons{display:inline-flex;gap:5px;margin-left:6px;flex-wrap:wrap}.am-record-buttons button{font-size:12px;padding:6px 8px}.am-record-buttons .am-follow{color:#9a5a00;border-color:#e0b65b;background:#fff7df}#am-quick-guidance{background:#fff;border:1px solid #cfd5df;border-radius:12px;padding:10px 14px;font-weight:700}.students .student.am-number-band-a{background:#fff}.students .student.am-number-band-b{background:#f7f9fc}.students .student.am-number-band-end{border-bottom:3px solid #d8dee8;margin-bottom:3px}.students .student>b{justify-self:start;min-width:52px;padding:7px 8px;border:1px solid #d8dee8;border-radius:8px;background:#fff;font-variant-numeric:tabular-nums;text-align:center}.students .student button.picked{color:#fff;background:#c94848;border-color:#c94848;box-shadow:0 0 0 2px #fff,0 0 0 4px #c94848;font-weight:700}.students .student button:focus-visible{outline:3px solid #245bdb;outline-offset:2px}@media (pointer:coarse){.students .student button{min-height:44px;min-width:52px}}`;document.head.appendChild(s)}
const CAL_TYPES={EXAM_PERIOD:'試験期間',VACATION:'長期休業',NO_CLASS:'その他の授業なし'};
function inRange(date,r){return !!r&&date>=r.start&&date<=r.end}
function calendarRules(state){return Array.isArray(state.calendarRules)?state.calendarRules:[]}
function exams(state){return Array.isArray(state.exams)?state.exams:[]}
function subjects(state){return Array.isArray(state.subjects)?state.subjects:[]}
function blockedRule(state,date){return calendarRules(state).find(r=>inRange(date,r))}
globalThis.__attendanceCalendarMerge=(date,state,entries)=>{
 const rules=calendarRules(state),blocked=rules.some(r=>inRange(date,r));
 const kept=entries.filter(entry=>{
   if(!blocked||entry.source!=='BASE')return true;
   return (state.lessons||[]).some(l=>l.date===date&&l.period===entry.period&&l.schoolId===entry.schoolId&&l.classId===entry.classId&&l.executionStatus==='COMPLETED');
 });
 const examEntries=(state.lessons||[]).filter(l=>l.date===date&&l.lessonType==='exam').map(l=>({
   key:'exam:'+l.id,date:l.date,period:l.period??0,schoolId:l.schoolId,classId:l.classId,
   source:'EXAM',executionStatus:l.executionStatus||'COMPLETED',examId:l.examId,subjectId:l.subjectId
 }));
 return [...kept,...examEntries];
};
async function ensureCalendarState(){
 await updateState(s=>{
  s.calendarRules=Array.isArray(s.calendarRules)?s.calendarRules:[];
  s.exams=Array.isArray(s.exams)?s.exams:[];
  s.subjects=Array.isArray(s.subjects)?s.subjects:[];
  s.lessons=Array.isArray(s.lessons)?s.lessons:[];
  s.lessons.forEach(l=>{if(!l.lessonType)l.lessonType='regular'});
 });
}
function existingRecordsInRange(state,start,end){
 return (state.lessons||[]).filter(l=>l.date>=start&&l.date<=end&&((state.attendance||[]).some(a=>a.lessonId===l.id)||l.executionStatus==='COMPLETED'));
}
async function addSubject(){
 const state=await readState(),name=prompt('担当科目名（例：化学基礎）','');if(!name?.trim())return;
 const school=await choose('学校を選択',(state.schools||[]),x=>x.name);if(!school)return;
 const classes=(state.classes||[]).filter(x=>x.schoolId===school.id);if(!classes.length)return alert('この学校には登録クラスがありません。');
 const picked=[];for(const cls of classes){if(confirm(name.trim()+' の担当クラスに '+cls.name+' を含めますか？'))picked.push(cls.id)}
 if(!picked.length)return alert('対象クラスを1つ以上選択してください。');
 await updateState(s=>{s.subjects=subjects(s);s.subjects.push({id:uid(),name:name.trim(),schoolId:school.id,classIds:picked})});await renderCalendarSettings();
}
async function addRule(type){
 const name=prompt(CAL_TYPES[type]+'の名称',type==='EXAM_PERIOD'?'中間試験':type==='VACATION'?'夏季休業':'学校行事');if(!name?.trim())return;
 const start=prompt('開始日（YYYY-MM-DD）',today());if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))return alert('開始日を確認してください。');
 const end=prompt('終了日（YYYY-MM-DD）',start);if(!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||end<start)return alert('終了日を確認してください。');
 const state=await readState(),existing=existingRecordsInRange(state,start,end);
 if(existing.length&&!confirm('この期間には既存の授業・出欠記録が '+existing.length+' 件あります。\n既存記録は削除しません。設定だけ追加します。続けますか？'))return;
 await updateState(s=>{s.calendarRules=calendarRules(s);s.calendarRules.push({id:uid(),type,name:name.trim(),start,end})});await renderCalendarSettings();
}
async function addExam(){
 const state=await readState(),list=subjects(state);if(!list.length)return alert('先に担当科目を登録してください。');
 const subject=await choose('担当科目を選択',list,x=>x.name);if(!subject)return;
 const date=prompt('試験日（YYYY-MM-DD）',today());if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return alert('試験日を確認してください。');
 const name=prompt('試験名（例：中間試験）','中間試験');if(!name?.trim())return;
 const classes=(state.classes||[]).filter(c=>subject.classIds.includes(c.id));
 if(!classes.length)return alert('この科目の担当クラスがありません。');
 const duplicate=exams(state).find(x=>x.date===date&&x.subjectId===subject.id&&x.name===name.trim());
 if(duplicate)return alert('同じ日・科目・試験名の試験は既に登録されています。二重生成しません。');
 const msg=subject.name+'・'+name.trim()+'\n'+date+'\n\n対象クラス:\n'+classes.map(c=>'・'+c.name+'（授業 +1）').join('\n')+'\n\n試験を欠席した生徒は、この科目の欠席1回として集計されます。\n\n登録しますか？';
 if(!confirm(msg))return;
 const examId=uid();
 await updateState(s=>{
   s.exams=exams(s);s.lessons=Array.isArray(s.lessons)?s.lessons:[];
   s.exams.push({id:examId,date,name:name.trim(),subjectId:subject.id,schoolId:subject.schoolId,classIds:[...subject.classIds],createdAt:new Date().toISOString()});
   classes.forEach((cls,index)=>{
     if(s.lessons.some(l=>l.lessonType==='exam'&&l.examId===examId&&l.classId===cls.id))return;
     s.lessons.push({id:uid(),date,period:90+index,schoolId:cls.schoolId,classId:cls.id,source:'EXAM',executionStatus:'COMPLETED',lessonType:'exam',examId,subjectId:subject.id});
   });
 });await renderCalendarSettings();
}
async function deleteRule(id){
 const state=await readState(),r=calendarRules(state).find(x=>x.id===id);if(!r)return;
 if(!confirm(r.name+' を削除しますか？\n既存の授業・出欠記録は削除されません。'))return;
 await updateState(s=>{s.calendarRules=calendarRules(s).filter(x=>x.id!==id)});await renderCalendarSettings();
}
async function deleteExam(id){
 const state=await readState(),exam=exams(state).find(x=>x.id===id);if(!exam)return;
 const lessonIds=(state.lessons||[]).filter(l=>l.examId===id).map(l=>l.id),hasAttendance=(state.attendance||[]).some(a=>lessonIds.includes(a.lessonId));
 if(hasAttendance&&!confirm('この試験には出欠記録があります。\n試験授業とその出欠記録を削除します。続けますか？'))return;
 if(!hasAttendance&&!confirm('この試験を削除しますか？'))return;
 await updateState(s=>{const ids=(s.lessons||[]).filter(l=>l.examId===id).map(l=>l.id);s.attendance=(s.attendance||[]).filter(a=>!ids.includes(a.lessonId));s.lessons=(s.lessons||[]).filter(l=>l.examId!==id);s.exams=exams(s).filter(x=>x.id!==id)});await renderCalendarSettings();
}
async function openExamAttendance(lessonId){
 const state=await readState(),lesson=(state.lessons||[]).find(l=>l.id===lessonId);if(!lesson)return;
 const cls=(state.classes||[]).find(c=>c.id===lesson.classId),exam=exams(state).find(x=>x.id===lesson.examId),subject=subjects(state).find(x=>x.id===lesson.subjectId);if(!cls)return;
 const nums=classNumbers(state,cls,lesson.date),overlay=document.createElement('div');overlay.className='am-modal-bg';
 const box=document.createElement('div');box.className='am-modal am-exam-attendance';
 box.innerHTML='<div class="am-exam-head"><button type="button" data-close>閉じる</button><div><h3>'+escapeHtml(cls.name)+'</h3><small>'+escapeHtml(lesson.date)+'・試験・'+escapeHtml(subject?.name||'')+' '+escapeHtml(exam?.name||'')+'</small></div></div><p class="hint">全員出席が基本です。欠席等のある番号だけ選びます。</p><div class="students"></div>';
 const list=box.querySelector('.students');
 nums.forEach(num=>{const row=document.createElement('div');row.className='student';const rec=(state.attendance||[]).find(a=>a.lessonId===lesson.id&&a.studentNumber===num);row.innerHTML='<b>No.'+num+'</b><div></div>';const controls=row.querySelector('div');
  [['ABSENT','欠席'],['LATE','遅刻'],['EARLY','早退'],['EXCUSED','認欠'],['BEREAVEMENT','忌引']].forEach(([status,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(rec?.status===status)b.className='picked';b.onclick=async()=>{let time;if(status==='LATE'||status==='EARLY')time=prompt(status==='LATE'?'到着時刻（例 09:17）':'退出時刻（例 14:20）')||undefined;await updateState(s=>{s.attendance=Array.isArray(s.attendance)?s.attendance:[];s.attendance=s.attendance.filter(a=>a.lessonId!==lesson.id||a.studentNumber!==num);if(rec?.status!==status)s.attendance.push({id:uid(),lessonId:lesson.id,studentNumber:num,status,time,attendanceJudgment:status==='LATE'||status==='EARLY'?'UNDECIDED':undefined})});overlay.remove();openExamAttendance(lesson.id)};controls.appendChild(b)});
  if(rec){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=async()=>{await updateState(s=>{s.attendance=(s.attendance||[]).filter(a=>a.lessonId!==lesson.id||a.studentNumber!==num)});overlay.remove();openExamAttendance(lesson.id)};controls.appendChild(cancel)}
  list.appendChild(row);
 });
 box.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.appendChild(box);document.body.appendChild(overlay);enhanceNumberGroups();
}
async function renderCalendarSettings(){
 const root=document.getElementById('am-calendar-settings');if(!root)return;const state=await readState(),subs=subjects(state),rules=calendarRules(state),xs=exams(state);
 root.innerHTML='<section class="am-settings-card"><h2>授業日設定</h2><p>試験期間・長期休業・授業なし日を管理します。既存の祝日・休講設定は従来どおり有効です。</p><div class="am-actions"><button data-sub>＋ 担当科目</button><button data-exam>＋ 担当科目の試験</button><button data-ep>＋ 試験期間</button><button data-vac>＋ 長期休業</button><button data-off>＋ 授業なし日・期間</button></div></section>'+
 '<section class="am-settings-card"><h3>担当科目</h3>'+(subs.length?subs.map(s=>'<div class="am-setting-row"><b>'+escapeHtml(s.name)+'</b><span>'+escapeHtml((s.classIds||[]).map(id=>state.classes?.find(c=>c.id===id)?.name||id).join(' / '))+'</span></div>').join(''):'<p>未登録</p>')+'</section>'+
 '<section class="am-settings-card"><h3>試験</h3>'+(xs.length?xs.map(x=>{const sub=subs.find(s=>s.id===x.subjectId);const ls=(state.lessons||[]).filter(l=>l.examId===x.id);return '<div class="am-setting-row"><div><b>'+escapeHtml(sub?.name||'')+'・'+escapeHtml(x.name)+'</b><small>'+escapeHtml(x.date)+' / '+ls.length+'クラス</small></div><div class="am-row-actions">'+ls.map(l=>'<button data-lesson="'+l.id+'">'+escapeHtml(state.classes?.find(c=>c.id===l.classId)?.name||'クラス')+' 出欠</button>').join('')+'<button class="danger" data-del-exam="'+x.id+'">削除</button></div></div>'}).join(''):'<p>未登録</p>')+'</section>'+
 '<section class="am-settings-card"><h3>通常授業を生成しない期間</h3>'+(rules.length?rules.map(r=>'<div class="am-setting-row"><div><b>'+escapeHtml(CAL_TYPES[r.type]||r.type)+'：'+escapeHtml(r.name)+'</b><small>'+r.start+' 〜 '+r.end+'</small></div><button class="danger" data-del-rule="'+r.id+'">削除</button></div>').join(''):'<p>未登録</p>')+'</section>';
 root.querySelector('[data-sub]').onclick=()=>addSubject();root.querySelector('[data-exam]').onclick=()=>addExam();root.querySelector('[data-ep]').onclick=()=>addRule('EXAM_PERIOD');root.querySelector('[data-vac]').onclick=()=>addRule('VACATION');root.querySelector('[data-off]').onclick=()=>addRule('NO_CLASS');
 root.querySelectorAll('[data-del-rule]').forEach(b=>b.onclick=()=>deleteRule(b.dataset.delRule));root.querySelectorAll('[data-del-exam]').forEach(b=>b.onclick=()=>deleteExam(b.dataset.delExam));root.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>openExamAttendance(b.dataset.lesson));
}
function addCalendarSettingsNav(){
 const nav=document.querySelector('nav');if(!nav||document.getElementById('am-calendar-settings-nav'))return;
 const b=document.createElement('button');b.id='am-calendar-settings-nav';b.type='button';b.textContent='授業日設定';b.onclick=async()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const app=document.querySelector('.app');app.querySelectorAll(':scope > main,:scope > section.panel').forEach(x=>x.style.display='none');let root=document.getElementById('am-calendar-settings');if(!root){root=document.createElement('main');root.id='am-calendar-settings';root.className='am-calendar-settings';app.appendChild(root)}root.style.display='block';await renderCalendarSettings()};nav.appendChild(b);
 nav.querySelectorAll('button:not(#am-calendar-settings-nav)').forEach(x=>x.addEventListener('click',()=>{const root=document.getElementById('am-calendar-settings');if(root)root.style.display='none'}));
}

let scheduled=false;function scan(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;addStyle();addQuickButton();addCalendarSettingsNav();enhanceRows();addLessonHandoff()})}
ensureCalendarState().catch(console.error);new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});scan();
})();
