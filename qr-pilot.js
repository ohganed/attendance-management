(()=>{'use strict';
const DB='attendance-v02',STORE='state',KEY='main',tokenPrefix='attendance-qr-pilot-v1:';
const el=id=>document.getElementById(id);let state=null,stream=null,frame=null,active=false,scanned=new Set(),manual=new Set(),lastToken='',lastAt=0,lastFrame=0,hadSaveError=false;
const iso=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
function dbRead(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction(STORE,'readonly');const get=tx.objectStore(STORE).get(KEY);get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close()}})}
function message(s){el('message').textContent=s}
function schools(){return state?.schools||[]}function classes(){return (state?.classes||[]).filter(c=>c.schoolId===el('school').value)}
function current(){return classes().find(c=>c.id===el('class').value)}
function eligible(n){const c=current(),date=el('date').value;const entry=(state.enrollments||[]).find(e=>e.classId===c.id&&Number(e.studentNumber)===n);return !entry?.excluded&&(!entry?.startDate||date>=entry.startDate)&&(!entry?.endDate||date<=entry.endDate)}
function numbers(){const c=current();if(!c)return[];const first=Number(c.studentNumberStart),last=Number(c.studentNumberEnd);if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last<first||last-first>4000)return[];return Array.from({length:last-first+1},(_,i)=>first+i).filter(eligible)}
function scope(){return (current()?.id||'')+'|'+el('date').value}
function sessionKey(){return tokenPrefix+'session:'+scope()}
function persistentKey(){return tokenPrefix+'confirmed-v2:'+scope()}
function tokenKey(){return tokenPrefix+'tokens:'+current()?.id}
function tokenMap(){try{return JSON.parse(localStorage.getItem(tokenKey())||'{}')}catch{return{}}}
function normalizedNumbers(value){return Array.isArray(value)?value.map(Number).filter(Number.isSafeInteger):[]}
function saveSession(action,number){
 const payload={schemaVersion:2,qr:[...scanned],manual:[...manual],savedAt:new Date().toISOString()};
 try{
  localStorage.setItem(persistentKey(),JSON.stringify(payload));hadSaveError=false;
  if(action&&number!=null)appendAudit(action,number);
  return true;
 }catch(e){hadSaveError=true;message('端末への保存に失敗しました。CSVで結果を保存し、空き容量を確認してください。');return false}
}
function appendAudit(action,number){
 try{
  const key=tokenPrefix+'audit:'+scope();
  const history=JSON.parse(localStorage.getItem(key)||'[]');
  history.push({at:new Date().toISOString(),action,number});
  localStorage.setItem(key,JSON.stringify(history.slice(-300)));
 }catch(e){console.warn('QR確認操作ログを保存できませんでした')}
}
function restoreSession(){
 scanned=new Set();manual=new Set();hadSaveError=false;
 try{
  const saved=localStorage.getItem(persistentKey());
  if(saved){
   const data=JSON.parse(saved);
   scanned=new Set(normalizedNumbers(data.qr));
   manual=new Set(normalizedNumbers(data.manual));
  }else{
   // One-time migration from previous short-lived pilot sessions.
   const old=sessionStorage.getItem(sessionKey());
   if(old){scanned=new Set(normalizedNumbers(JSON.parse(old)));saveSession();sessionStorage.removeItem(sessionKey())}
  }
 }catch(e){message('保存した確認情報を読み込めませんでした。現在の情報を上書きせず、ページを閉じて管理者に相談してください。');hadSaveError=true}
}
function cryptotoken(){const b=new Uint8Array(24);crypto.getRandomValues(b);return 'ATTQR1-'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
function makeCards(){const c=current();if(!c)return message('クラスを選択してください');const nums=numbers(),tokens=tokenMap();for(const n of nums)if(!tokens[n])tokens[n]=cryptotoken();localStorage.setItem(tokenKey(),JSON.stringify(tokens));const host=el('card-grid');host.replaceChildren();for(const n of nums){const card=document.createElement('article');card.className='qr-card';const title=document.createElement('strong');title.textContent=(schools().find(x=>x.id===c.schoolId)?.name||'')+' / '+c.name+' / No.'+n;const wrap=document.createElement('div');const q=qrcode(0,'M');q.addData(tokens[n]);q.make();wrap.innerHTML=q.createSvgTag({cellSize:4,margin:12,scalable:true});card.append(title,wrap);host.append(card)}el('status').textContent=nums.length+'人分のQRカードを準備しました（端末内保存）';render()}
function readQR(token){const t=String(token||'').trim();if(t===lastToken&&Date.now()-lastAt<1300)return;lastToken=t;lastAt=Date.now();const map=tokenMap(),entry=Object.entries(map).find(([,value])=>value===t);if(!entry){message('このクラスに登録されていないQRコードです');return}const n=Number(entry[0]);if(!eligible(n)){message('No.'+n+' は授業日の在籍対象外です');return}if(scanned.has(n)){message('No.'+n+' は確認済みです（二重登録しません）');return}const hadManual=manual.delete(n);scanned.add(n);if(!saveSession('QR確認',n)){scanned.delete(n);if(hadManual)manual.add(n);return}message('No.'+n+' のQRを確認しました');render()}
function verifyManual(n){
 if(hadSaveError)return message('保存エラーがあるため操作を停止しています');
 if(!eligible(n))return message('在籍対象外です');
 if(scanned.has(n)||manual.has(n))return;
 if(!confirm('No.'+n+' を教員による手動確認として記録しますか？\\n本人の出席を確認した場合のみ実行してください。'))return;
 manual.add(n);
 if(!saveSession('教員手動確認',n)){manual.delete(n);return}
 message('No.'+n+'：手動確認を記録しました');render()
}
function undo(n){
 if(hadSaveError)return message('保存エラーがあるため操作を停止しています');
 if(!confirm('No.'+n+' のQR/手動確認を取り消しますか？\n正式な出席簿は変更されません。'))return;
 const wasQr=scanned.delete(n),wasManual=manual.delete(n);
 if(!saveSession('確認取消',n)){if(wasQr)scanned.add(n);if(wasManual)manual.add(n);return}
 message('No.'+n+' を未確認に戻しました');render()
}
function render(){
 const nums=numbers(),qrCount=nums.filter(n=>scanned.has(n)).length,manualCount=nums.filter(n=>manual.has(n)&&!scanned.has(n)).length;
 el('summary').textContent='在籍対象 '+nums.length+'人 / QR確認 '+qrCount+'人 / 手動確認 '+manualCount+'人 / 未確認 '+(nums.length-qrCount-manualCount)+'人';
 const host=el('roster');host.replaceChildren();
 for(const n of nums){
  const byQR=scanned.has(n),byManual=manual.has(n)&&!byQR;
  const b=document.createElement('div');b.className='pupil '+(byQR||byManual?'ok':'missing');
  const label=document.createElement('div');label.textContent='No.'+n+' '+(byQR?'QR確認済':byManual?'手動確認':'未確認');b.append(label);
  const button=document.createElement('button');button.type='button';button.className='small-action';
  button.textContent=byQR||byManual?'取消':'手動確認';button.disabled=hadSaveError;
  button.onclick=()=>byQR||byManual?undo(n):verifyManual(n);b.append(button);host.append(b);
 }
}
function refreshClasses(){const c=classes();el('class').replaceChildren(...c.map(x=>new Option(x.name,x.id)));changeScope()}
function changeScope(){stop();message('');restoreSession();el('card-grid').replaceChildren();render()}
async function start(){if(!current())return message('対象クラスを選択してください');if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){message('この端末・ブラウザではカメラを使えません');return}if(typeof jsQR!=='function'){message('QR読取ライブラリが読み込めません');return}try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}},audio:false});el('camera').srcObject=stream;el('camera').style.display='block';await el('camera').play();active=true;el('start').disabled=true;el('stop').disabled=false;scan()}catch(e){message('カメラを開始できません: '+(e.name||e.message));stop()}}
function scan(timestamp){if(!active)return;if(timestamp-lastFrame<100){frame=requestAnimationFrame(scan);return}lastFrame=timestamp;const v=el('camera');if(v.readyState>=2&&v.videoWidth){const c=el('scratch');c.width=v.videoWidth;c.height=v.videoHeight;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(v,0,0,c.width,c.height);const p=cx.getImageData(0,0,c.width,c.height);const qr=jsQR(p.data,p.width,p.height,{inversionAttempts:'dontInvert'});if(qr)readQR(qr.data)}frame=requestAnimationFrame(scan)}
function stop(){active=false;if(frame)cancelAnimationFrame(frame);frame=null;if(stream)stream.getTracks().forEach(x=>x.stop());stream=null;el('camera').srcObject=null;el('camera').style.display='none';el('start').disabled=false;el('stop').disabled=true}
function csv(){const nums=numbers();const c=current();if(!c)return message('クラスを選択してください');const lines=[['日付','学校','クラス','出席番号','QR確認状態'],...nums.map(n=>[el('date').value,schools().find(s=>s.id===c.schoolId)?.name||'',c.name,n,scanned.has(n)?'QR確認済':manual.has(n)?'手動確認':'未確認'])];const quote=v=>'"'+String(v).replaceAll('"','""')+'"';const text='\uFEFF'+lines.map(x=>x.map(quote).join(',')).join('\r\n');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='qr-check-'+el('date').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function init(){el('date').value=iso();try{state=await dbRead();if(!state?.classes?.length)throw new Error('このブラウザには出席簿データがありません');el('school').replaceChildren(...schools().map(x=>new Option(x.name,x.id)));refreshClasses();el('status').textContent='既存の出席簿を読み取り専用で参照しています。手動確認とQR確認は、この端末に保存されます。';}catch(e){el('status').textContent=e.message;message('ホーム画面アプリとは保存領域が異なる場合があります')}el('school').onchange=refreshClasses;el('class').onchange=changeScope;el('date').onchange=changeScope;el('generate').onclick=makeCards;el('cards-print').onclick=()=>window.print();el('start').onclick=start;el('stop').onclick=stop;el('reset').onclick=()=>{if(confirm('この授業日のQR確認だけを消去しますか？出席簿は変更しません。')){const prevQR=new Set(scanned),prevManual=new Set(manual);scanned.clear();manual.clear();if(saveSession('確認全消去',0))render();else{scanned=prevQR;manual=prevManual}}};el('csv').onclick=csv;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});window.addEventListener('pagehide',stop)}
init();
})();