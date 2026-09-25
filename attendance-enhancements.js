(()=>{
'use strict';
const DB='attendance-v02',STORE='state',KEY='main';
const uid=()=>globalThis.crypto?.randomUUID?.()||`rec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function readState(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function updateState(mutator){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),req=store.get(KEY);req.onsuccess=()=>{const state=req.result;if(!state){reject(new Error('既存データが見つかりません'));return}mutator(state);store.put(state,KEY)};req.onerror=()=>reject(req.error);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
function classInfo(state,title='',lessonLabel=''){
 const classes=(state?.classes||[]).filter(c=>c.name===title);
 if(lessonLabel){
  const schoolName=lessonLabel.replace(/^.*?・[^・]*限・/,'');
  const matches=classes.filter(c=>(state.schools||[]).some(s=>s.id===c.schoolId&&s.name===schoolName));
  return matches.length===1?matches[0]:null;
 }
 return classes.length===1?classes[0]:null;
}
function numberFromRow(row){const first=Array.from(row.firstElementChild?.childNodes||[]).filter(n=>n.nodeType===3).map(n=>n.textContent).join('');const m=first.match(/^(?:No\.)?\s*(\d+)\s*$/);return m?Number(m[1]):null}
function contextFromSheet(state,row){const sheet=row.closest('.sheet');const title=sheet?.querySelector('.sheet-head h2')?.textContent?.trim()||'';const sub=sheet?.querySelector('.sheet-head p')?.textContent?.trim()||'';const cls=classInfo(state,title,sub);return {classId:cls?.id||null,className:cls?.name||title,schoolId:cls?.schoolId||null,studentNumber:numberFromRow(row),lessonLabel:sub,date:(sub.match(/\d{4}-\d{2}-\d{2}/)||[])[0]||today(),scene:'授業中'}}
function studentRecords(state,base){
 if(!base.classId||base.studentNumber==null)return [];
 return (Array.isArray(state.studentRecords)?state.studentRecords:[]).filter(record=>{
  if(!record||record.studentNumber==null||Number(record.studentNumber)!==base.studentNumber)return false;
  if(record.schoolId&&record.schoolId!==base.schoolId)return false;
  if(record.classId)return record.classId===base.classId;
  // Old free-text records are usable only when their class is unambiguous.
  const matches=(state.classes||[]).filter(c=>c.name===record.className&&(!record.schoolId||c.schoolId===record.schoolId));
  return matches.length===1&&matches[0].id===base.classId;
 }).sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
async function showRecords(base,opener){
 const state=await readState(),records=studentRecords(state,base);
 document.getElementById('am-record-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='am-record-dialog';dialog.className='am-record-dialog';
 dialog.setAttribute('aria-labelledby','am-record-title');
 const heading=document.createElement('h2');heading.id='am-record-title';heading.textContent=`${base.className} / No.${base.studentNumber} の記録`;
 const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.autofocus=true;close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus()});
 dialog.append(close,heading);
 const school=document.createElement('p');school.textContent=(state.schools||[]).find(s=>s.id===base.schoolId)?.name||'';dialog.append(school);
 if(!records.length){const empty=document.createElement('p');empty.textContent='記録はありません。';dialog.append(empty)}
 for(const record of records){
  const card=document.createElement('article');card.className='am-record-card';
  const title=document.createElement('h3');title.textContent=`${record.date||'日付なし'} · ${record.type==='LEARNING'?'学習記録':'指導記録'}`;card.append(title);
  if(record.scene){const scene=document.createElement('p');scene.textContent=record.scene;card.append(scene)}
  const fields=record.type==='LEARNING'?[['内容',record.summary],['次の支援',record.nextSupport]]:[['事実',record.facts],['本人の反応',record.reaction],['行った対応',record.response]];
  const list=document.createElement('dl');
  fields.forEach(([label,value])=>{if(value==null||value==='')return;const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=String(value);list.append(term,detail)});card.append(list);
  if(record.followUp){
   const status=document.createElement('p');status.textContent=record.resolvedAt?'次回確認：確認済み':'次回確認：必要';card.append(status);
   if(!record.resolvedAt){const done=document.createElement('button');done.type='button';done.textContent='この記録を確認済みにする';done.onclick=()=>resolveFollowUp(record.id).catch(err=>alert(err.message));card.append(done)}
  }
  dialog.append(card);
 }
 document.body.append(dialog);dialog.showModal();
}
function appendRecordLink(container,base,records){
 if(!records.length)return;
 const button=document.createElement('button');button.type='button';button.className='am-record-link';button.textContent=`記録 ${records.length}件`;
 const pending=records.filter(r=>r.followUp&&!r.resolvedAt).length;
 button.title=pending?`次回確認が必要な記録：${pending}件`:'記録を開く';
 button.onclick=e=>{e.stopPropagation();showRecords(base,button).catch(err=>alert(err.message))};container.append(button);
}
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
async function enhanceRows(){
 let state;try{state=await readState()}catch{return}if(!state)return;
 document.querySelectorAll('.student, .register tbody tr').forEach(row=>{
  let base;
  const input=row.matches('.student');
  if(input)base=contextFromSheet(state,row);
  else{
   const classId=row.closest('.register')?.querySelector('.section-title select')?.value;
   const cls=(state.classes||[]).find(c=>c.id===classId);
   base={classId:cls?.id,className:cls?.name,schoolId:cls?.schoolId,studentNumber:numberFromRow(row)};
  }
  const records=studentRecords(state,base);
  const signature=JSON.stringify([base,records]);
  const previous=row.querySelector('.am-record-buttons');
  if(row.dataset.amRecordContext===signature&&previous)return;
  previous?.remove();row.dataset.amRecordContext=signature;
  if(!base.classId||base.studentNumber==null)return;
  const controls=input?(row.querySelector('div')||row):row.querySelector('th');if(!controls)return;
  const wrap=document.createElement('span');wrap.className='am-record-buttons';
  if(input){
   const learn=document.createElement('button');learn.type='button';learn.textContent='学習';learn.onclick=e=>{e.stopPropagation();addRecord(base,'LEARNING').catch(err=>alert(err.message))};
   const guide=document.createElement('button');guide.type='button';guide.textContent='指導';guide.onclick=e=>{e.stopPropagation();addRecord(base,'GUIDANCE').catch(err=>alert(err.message))};wrap.append(learn,guide);
  }
  appendRecordLink(wrap,base,records);
  const pending=records.filter(r=>r.followUp&&!r.resolvedAt);
  if(pending.length){const follow=document.createElement('button');follow.type='button';follow.className='am-follow';follow.textContent=`● 次回確認 ${pending.length}`;follow.onclick=e=>{e.stopPropagation();showRecords(base,follow).catch(err=>alert(err.message))};wrap.append(follow)}
  controls.append(wrap);
 });
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
 const cls=classInfo(state,title,sub); if(!cls)return null;
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
function addStyle(){if(document.getElementById('am-enh-style'))return;const s=document.createElement('style');s.id='am-enh-style';s.textContent=`.am-record-dialog{box-sizing:border-box;width:min(640px,calc(100vw - 32px));max-height:85vh;overflow:auto;padding:20px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#172033}.am-record-dialog::backdrop{background:#0008}.am-record-dialog>button{min-height:44px;float:right}.am-record-dialog h2{font-size:20px;clear:both;padding-top:12px}.am-record-card{border-top:1px solid #d7dde7;padding:12px 0}.am-record-card h3{font-size:16px}.am-record-card dt{font-weight:700;margin-top:10px}.am-record-card dd{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.am-record-card button{min-height:44px}.am-record-buttons .am-record-link{background:#edf4ff;color:#174ea6;border:1px solid #9cbdeb;min-height:44px}.register th .am-record-buttons{display:flex;margin:6px 0 0}.am-modal-bg{position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}.am-modal{background:#fff;border-radius:16px;padding:16px;max-width:420px;width:100%;max-height:80vh;overflow:auto;display:grid;gap:8px}.am-modal button{min-height:44px}.am-handoff{margin:12px 0;padding:14px;border:1px solid #d7dde7;border-radius:14px;background:#f8fafc;display:grid;gap:10px}.am-handoff label{display:grid;gap:4px;font-weight:700}.am-handoff textarea{min-height:54px;font-size:16px;padding:9px;border:1px solid #cbd5e1;border-radius:10px}.am-prev{padding:8px;background:#fff;border-radius:9px}.am-record-buttons{display:inline-flex;gap:5px;margin-left:6px;flex-wrap:wrap}.am-record-buttons button{font-size:12px;padding:6px 8px}.am-record-buttons .am-follow{color:#9a5a00;border-color:#e0b65b;background:#fff7df}#am-quick-guidance{background:#fff;border:1px solid #cfd5df;border-radius:12px;padding:10px 14px;font-weight:700}`;document.head.appendChild(s)}
let scheduled=false;function scan(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;addStyle();addQuickButton();enhanceRows();addLessonHandoff()})}
document.addEventListener('change',scan);
new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true,characterData:true});scan();
})();
