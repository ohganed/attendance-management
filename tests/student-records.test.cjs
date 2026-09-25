const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const root = path.join(__dirname, '..');
let browser, server, url;
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
// Mirror the Pages workflow: the checked-in bundle cannot run inline.
const tag = '<script type="module" crossorigin>';
const start = html.indexOf(tag), end = html.lastIndexOf('</script>');
const bundle = html.slice(start + tag.length, end);
const published = (html.slice(0, start) + '<script type="module" src="app.bundle.js"></script>' + html.slice(end + 9))
  .replace('</body>', '<script src="attendance-enhancements.js"></script></body>');
before(async () => {
  server = createServer((req, res) => {
    const files = {'/': ['text/html', published], '/blank': ['text/html', '<!doctype html>'], '/app.bundle.js': ['text/javascript', bundle],
      '/attendance-enhancements.js': ['text/javascript', readFileSync(path.join(root, 'attendance-enhancements.js'), 'utf8')]};
    const result = files[req.url];
    res.writeHead(result ? 200 : 404, {'Content-Type': result?.[0] || 'text/plain'});
    res.end(result?.[1] || 'Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch({headless:true});
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
function fixture() {
  const now = new Date(), date = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  const classes = [{id:'a13',schoolId:'a',name:'1-1',studentNumberStart:1,studentNumberEnd:3},
    {id:'b11',schoolId:'b',name:'1-1',studentNumberStart:1,studentNumberEnd:3},
    {id:'a110',schoolId:'a',name:'1-10',studentNumberStart:1,studentNumberEnd:3}];
  return {schemaVersion:2,schools:[{id:'a',name:'高校A',observePublicHolidays:false},{id:'b',name:'高校B',observePublicHolidays:false}],classes,
    terms:[],customPeriods:[],enrollments:[],baseEntries:[],
    overrides:classes.map((c,i)=>({id:`o${i}`,date,schoolId:c.schoolId,classId:c.id,newPeriod:i+1,overrideType:'ADD'})),
    lessons:classes.map((c,i)=>({id:`l${i}`,date,schoolId:c.schoolId,classId:c.id,period:i+1,source:'EXTRA',executionStatus:'COMPLETED'})),
    attendance:[],studentRecords:[
      {id:'old',classId:'a13',schoolId:'a',studentNumber:1,type:'GUIDANCE',date:'2026-09-01',facts:'確認済みの記録',followUp:true,resolvedAt:'2026-09-02'},
      {id:'new',classId:'a13',schoolId:'a',studentNumber:1,type:'GUIDANCE',date:'2026-09-03',facts:'<img src=x onerror=alert(1)> 事実',reaction:'本人の反応',response:'対応の内容',followUp:true,resolvedAt:null},
      {id:'learning',classId:'a13',schoolId:'a',studentNumber:'1',type:'LEARNING',date:'2026-09-04',summary:'学習の記録',nextSupport:'次の支援',followUp:false},
      {id:'other',classId:'b11',schoolId:'b',studentNumber:1,type:'GUIDANCE',facts:'別学校の記録'},
      {id:'prefix',classId:'a110',schoolId:'a',studentNumber:1,type:'GUIDANCE',facts:'1-10の記録'},
      {id:'ambiguous',className:'1-1',studentNumber:1,type:'GUIDANCE',facts:'学校不明の記録'},
      {id:'legacy',className:'1-1',schoolId:'a',studentNumber:2,type:'GUIDANCE',facts:'旧形式の記録'}]};
}
async function setup(t, state=fixture()) {
  const page = await browser.newPage({viewport:{width:820,height:1180}});
  t.after(()=>page.close());
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  t.after(()=>assert.deepEqual(errors, []));
  await page.goto(url+'/blank');
  await page.evaluate(state=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('attendance-v02',2);
    req.onupgradeneeded=()=>{req.result.createObjectStore('state');req.result.createObjectStore('secrets')};
    req.onsuccess=()=>{const tx=req.result.transaction('state','readwrite');tx.objectStore('state').put(state,'main');tx.oncomplete=()=>{req.result.close();resolve()};tx.onerror=()=>reject(tx.error)};
  }),state);
  await page.goto(url);
  await page.getByRole('button',{name:'出席簿',exact:true}).waitFor();
  return page;
}
async function stored(page) {
  return page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('attendance-v02',2);req.onsuccess=()=>{const db=req.result,r=db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>{db.close();resolve(r.result)}}}));
}
test('register opens all matching records without changing saved state; class switches cannot reuse another student’s records', async t=>{
  const page=await setup(t), beforeState=await stored(page);
  await page.getByRole('button',{name:'出席簿',exact:true}).click();
  const first=page.locator('.register tbody tr').first();
  await first.getByRole('button',{name:'記録 3件',exact:true}).click({timeout:3000});
  const dialog=page.getByRole('dialog');
  await dialog.waitFor();
  const text=await dialog.innerText();
  for(const value of ['確認済みの記録','本人の反応','対応の内容','学習の記録','次の支援','<img src=x onerror=alert(1)>']) assert.ok(text.includes(value),value);
  for(const value of ['別学校の記録','1-10の記録','学校不明の記録']) assert.ok(!text.includes(value),value);
  assert.equal(await dialog.locator('img').count(),0);
  assert.ok(text.indexOf('学習の記録') < text.indexOf('確認済みの記録'));
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.deepEqual(await stored(page),beforeState);
  await page.locator('.register .section-title select').selectOption('b11');
  await first.getByRole('button',{name:'記録 1件',exact:true}).click();
  assert.match(await dialog.innerText(),/別学校の記録/);
  assert.ok(!(await dialog.innerText()).includes('対応の内容'));
  await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.locator('.register .section-title select').selectOption('a13');
  await page.locator('.register tbody tr').nth(1).getByRole('button',{name:'記録 1件',exact:true}).click();
  assert.match(await dialog.innerText(),/旧形式の記録/);
});
test('lesson input exposes records, preserves attendance controls and survives reload',async t=>{
  const page=await setup(t);
  const input=page.locator('.lesson-main');
  await input.first().click();
  const row=page.locator('.student').first();
  await row.getByRole('button',{name:'記録 3件',exact:true}).click({timeout:3000});
  await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await row.getByRole('button',{name:'欠席',exact:true}).click();
  await page.waitForFunction(()=>new Promise(resolve=>{const req=indexedDB.open('attendance-v02',2);req.onsuccess=()=>{const db=req.result,r=db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>{db.close();resolve(r.result.attendance.length===1)}}}));
  const saved=await stored(page);
  assert.equal(saved.attendance[0].status,'ABSENT');
  assert.equal(saved.studentRecords.length,7);
  await page.reload();
  await page.locator('.lesson-main').first().click();
  await page.locator('.student').first().getByRole('button',{name:'記録 3件',exact:true}).waitFor();
});
test('old state without records has no badges and still allows attendance input',async t=>{
  const state=fixture();delete state.studentRecords;
  const page=await setup(t,state);
  await page.getByRole('button',{name:'出席簿',exact:true}).click();
  assert.equal(await page.locator('.am-record-link').count(),0);
  await page.getByRole('button',{name:'カレンダー',exact:true}).click();
  await page.locator('.lesson-main').first().click();
  await page.locator('.student').first().getByRole('button',{name:'指導',exact:true}).waitFor();
  assert.equal(await page.locator('.am-record-link').count(),0);
});
