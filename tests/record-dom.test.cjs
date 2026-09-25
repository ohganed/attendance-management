const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {IDBFactory}=require('fake-indexeddb');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').join(__dirname,'../attendance-enhancements.js'),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,30));
async function until(fn){for(let i=0;i<30;i++){if(fn())return;await pause()}assert.ok(fn(),'expected UI did not appear')}
function state(){return {schools:[{id:'a',name:'学校A'},{id:'b',name:'学校B'}],classes:[
 {id:'a1',name:'1-1',schoolId:'a'},{id:'b1',name:'1-1',schoolId:'b'},{id:'a10',name:'1-10',schoolId:'a'}],studentRecords:[
 {id:'1',classId:'a1',studentNumber:1,date:'2026-09-01',type:'GUIDANCE',facts:'対応済みの事実',followUp:true,resolvedAt:'2026-09-02'},
 {id:'2',classId:'a1',studentNumber:'1',date:'2026-09-03',type:'LEARNING',summary:'<img src=x onerror=alert(1)>',nextSupport:'支援内容',followUp:false},
 {id:'3',classId:'b1',studentNumber:1,type:'GUIDANCE',facts:'別学校'},
 {id:'4',className:'1-1',studentNumber:1,type:'GUIDANCE',facts:'特定不能'},
 {id:'5',className:'1-1',schoolId:'a',studentNumber:2,type:'GUIDANCE',facts:'旧形式'},
 {id:'6',classId:'a10',studentNumber:1,type:'GUIDANCE',facts:'1-10の記録'}]}}
async function setup(t, data=state()){
 const dom=new JSDOM('<!doctype html><header></header><section class="register"><div class="section-title"><select><option value="a1">A</option><option value="b1">B</option></select></div><table><tbody><tr><th>1</th><td>✓</td></tr><tr><th>2</th><td>✓</td></tr><tr><th>3</th><td>✓</td></tr></tbody></table></section>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://test.invalid'});
 const w=dom.window;w.indexedDB=new IDBFactory();w.alert=()=>assert.fail('unexpected alert');
 // jsdom does not implement native dialog presentation; content/events stay real DOM.
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 await new Promise(resolve=>{const r=w.indexedDB.open('attendance-v02',2);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>{const tx=r.result.transaction('state','readwrite');tx.objectStore('state').put(data,'main');tx.oncomplete=()=>{r.result.close();resolve()}}});
 t.after(()=>w.close());w.eval(source);return w;
}
async function read(w){return new Promise(resolve=>{const r=w.indexedDB.open('attendance-v02',2);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('main');q.onsuccess=()=>{db.close();resolve(q.result)}}})}
test('register counts and opens all records, uses text safely, keeps saved data intact and handles class changes',async t=>{
 const w=await setup(t),d=w.document,first=d.querySelector('tr'),before=await read(w);
 await until(()=>first.querySelector('.am-record-link'));
 assert.equal(first.querySelector('.am-record-link').textContent,'記録 2件');
 first.querySelector('.am-record-link').click();await until(()=>d.querySelector('dialog'));
 const dialog=d.querySelector('dialog');assert.match(dialog.textContent,/対応済みの事実/);assert.match(dialog.textContent,/支援内容/);
 assert.match(dialog.textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(dialog.querySelectorAll('img').length,0);
 assert.doesNotMatch(dialog.textContent,/別学校|特定不能/);
 assert.ok(dialog.textContent.indexOf('支援内容')<dialog.textContent.indexOf('対応済みの事実'));
 dialog.querySelector('button').click();assert.equal(d.querySelector('dialog'),null);assert.deepEqual(await read(w),before);
 const select=d.querySelector('select');select.value='b1';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 await until(()=>first.querySelector('.am-record-link')?.textContent==='記録 1件');
 first.querySelector('.am-record-link').click();await until(()=>d.querySelector('dialog'));assert.match(d.querySelector('dialog').textContent,/別学校/);
 assert.doesNotMatch(d.querySelector('dialog').textContent,/支援内容/);
});
test('input identifies identical class names by school and never matches class-name prefixes',async t=>{
 const w=await setup(t),d=w.document;
 d.body.insertAdjacentHTML('beforeend','<div class="sheet"><div class="sheet-head"><h2>1-1</h2><p>2026-09-25・1限・学校B</p></div><div class="student"><b>No.1</b><div><button>欠席</button></div></div></div>');
 const row=d.querySelector('.student');await until(()=>row.querySelector('.am-record-link'));
 assert.equal(row.querySelector('.am-record-link').textContent,'記録 1件');row.querySelector('.am-record-link').click();await until(()=>d.querySelector('dialog'));
 assert.match(d.querySelector('dialog').textContent,/別学校/);assert.doesNotMatch(d.querySelector('dialog').textContent,/支援内容/);
 d.querySelector('dialog button').click();d.querySelector('h2').textContent='1-10';d.querySelector('.sheet-head p').textContent='2026-09-25・1限・学校A';
 await until(()=>row.dataset.amRecordContext?.includes('a10'));row.querySelector('.am-record-link').click();await until(()=>d.querySelector('dialog'));
 assert.match(d.querySelector('dialog').textContent,/1-10の記録/);
 assert.equal(row.querySelectorAll('.am-record-link').length,1);
});
test('legacy records with a known school appear; no records means no badge',async t=>{
 const w=await setup(t),d=w.document;
 await until(()=>d.querySelectorAll('.am-record-link').length===2);
 const rows=d.querySelectorAll('tr');assert.equal(rows[2].querySelector('.am-record-link'),null);
 rows[1].querySelector('.am-record-link').click();await until(()=>d.querySelector('dialog'));assert.match(d.querySelector('dialog').textContent,/旧形式/);
});
test('old state without studentRecords remains readable',async t=>{
 const data=state();delete data.studentRecords;const w=await setup(t,data);await pause();await pause();
 assert.equal(w.document.querySelectorAll('.am-record-link').length,0);assert.deepEqual(await read(w),data);
});
