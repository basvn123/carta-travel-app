import { chromium } from 'playwright';
const [,, url, w='1280'] = process.argv;
const b = await chromium.launch();
const c = await b.newContext({ viewport:{width:+w,height:900}, serviceWorkers:'block'});
const p = await c.newPage();
await p.addInitScript(()=>{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('carta.welcomeSeen','1');localStorage.setItem('carta.fareNoticeSeen','1');localStorage.setItem('continent.onboardingSeen.v1','1');});
await p.goto(url);
const dump = async (n)=>{await p.waitForTimeout(1500);await p.screenshot({path:`/tmp/claude-0/p4_${n}.png`});console.log('---',n,p.url().slice(0,150));console.log(await p.evaluate(()=>[...document.querySelectorAll('main a,main button,main [role=tab],main h1,main h2,main h3,main input,[role=dialog] button')].filter(e=>e.offsetParent).map(b=>b.tagName+'.'+String(b.className).slice(0,50)+'|'+(b.getAttribute('aria-label')||b.textContent).trim().slice(0,40)).join('\n')));};
await p.locator('.pf-open-start').click();
await dump(1);
for (let i=2;i<=12;i++){ const nx=p.getByRole('button',{name:/^(Continue|Skip|Next)/}).first(); if(!(await nx.count())) break; await nx.click({timeout:3000}).catch(()=>{}); await dump(i);}
await b.close();
