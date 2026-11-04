/* Optional bridge to independent QR Mail Relay; disabled until explicitly configured. */
(()=>{'use strict';
const PREFIX='attendance-qr-relay-v1:',el=id=>document.getElementById(id);
const endpointKey=PREFIX+'endpoint',queueKey=PREFIX+'queue',authKey=PREFIX+'device-token';
let sending=false;
const queue=()=>{try{const x=JSON.parse(localStorage.getItem(queueKey)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
const save=q=>{try{localStorage.setItem(queueKey,JSON.stringify(q));return true}catch{return false}};
function say(t){const node=el('relay-status');if(node)node.textContent=t}
function endpoint(raw){
 try{
  const u=new URL(raw);
  if(!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))return null;
  if(u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/api/v1/scans'))return null;
  return u.toString();
 }catch{return null}
}
function decorate(){
 const holder=document.createElement('section');
 holder.className='no-print';holder.innerHTML='<h2>4. 独立したメール通知アプリとの接続</h2><p class="muted">QRの認識コードのみを通知アプリへ送ります。受信側が登録済みアドレスを照合し、メールを送る仕組みです。未設定では送信しません。</p><label>通知アプリの受信URL<input id="relay-url" type="url" placeholder="https://通知サーバー/api/v1/scans" autocomplete="off" style="width:100%"></label><label>端末専用の認証トークン（この画面を閉じると消去）<input id="relay-token" type="password" autocomplete="off" style="width:100%"></label><div class="controls"><button id="relay-enable">接続を有効にする</button><button id="relay-disable">接続を停止</button><button id="relay-retry">未送信を再送</button></div><p id="relay-status" aria-live="polite" class="muted"></p><p class="muted">受信成功はメール配信完了を意味しません。通信できない場合、端末内に未送信イベントを保存します。端末紛失やデータ消去には注意してください。</p>';
 const cards=el('cards');cards.parentNode.insertBefore(holder,cards);
 el('relay-url').value=localStorage.getItem(endpointKey)||'';
 el('relay-token').value=sessionStorage.getItem(authKey)||'';
 el('relay-enable').onclick=()=>{
  const url=endpoint(el('relay-url').value.trim()),token=el('relay-token').value.trim();
  if(!url||!/^[A-Za-z0-9_-]{32,256}$/.test(token))return say('有効なHTTPS受信URLと端末認証トークンを指定してください');
  if(!confirm('QR読み取りコードを指定した独立アプリへ送信します。学校の承認を得ており、送信先を確認しましたか？'))return;
  try{localStorage.setItem(endpointKey,url);sessionStorage.setItem(authKey,token);say('通知アプリへの転送を有効にしました');flush()}catch{say('設定を保存できません')}
 };
 el('relay-disable').onclick=()=>{sessionStorage.removeItem(authKey);el('relay-token').value='';say('転送を停止しました。未送信イベントは保持しています')};
 el('relay-retry').onclick=flush;
 const pending=queue().length;say(pending+'件の未送信イベントがあります。転送は認証トークンを設定するまで停止します');
}
function receive(ev){
 const data=ev.detail;if(!data||!data.qrCode||!data.eventId)return;
 const url=localStorage.getItem(endpointKey),token=sessionStorage.getItem(authKey);
 if(!url||!token)return; // No automatic transfer until explicit activation.
 const q=queue();if(q.some(x=>x.eventId===data.eventId))return;
 if(q.length>=5000){say('未送信が5000件を超えました。CSV等を保護し、接続を確認してください');return}
 q.push({...data,endpoint:url});
 if(!save(q)){say('送信待ちイベントを保存できませんでした');return}
 flush();
}
async function flush(){
 if(sending)return;
 const token=sessionStorage.getItem(authKey),url=endpoint(localStorage.getItem(endpointKey)||'');
 if(!token||!url)return say('転送には受信URLと認証トークンが必要です');
 sending=true;
 try{
  let items=queue(),sent=0;
  for(const job of items.slice()){
   if(job.endpoint!==url){say('送信先の異なるイベントが残っています。送信先を元に戻してください');break}
   try{
    const res=await fetch(url,{method:'POST',mode:'cors',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({eventId:job.eventId,qrCode:job.qrCode,classId:job.classId,lessonDate:job.lessonDate,observedAt:job.observedAt})});
    if(res.status===200||res.status===202){
     items=items.filter(x=>x.eventId!==job.eventId);if(!save(items)){say('送信結果を保存できませんでした');break}sent++;
    }else{say('転送停止: 受信側の応答 '+res.status+'。認証・登録を確認してください');break}
   }catch{say('ネットワーク未接続。未送信イベントを保持しています');break}
  }
  if(sent)say(sent+'件を受信アプリが受理しました。残り '+queue().length+'件（メール配信完了とは別です）');
 }finally{sending=false}
}
document.addEventListener('DOMContentLoaded',decorate);
window.addEventListener('qr-pilot:recognized',receive);
window.addEventListener('online',()=>{if(sessionStorage.getItem(authKey))flush()});
})();