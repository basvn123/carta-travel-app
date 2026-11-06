import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900}, serviceWorkers:'block'})).newPage();
await p.addInitScript(()=>{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('continent.mapGuideDismissed.v1','1');});
await p.goto('http://localhost:4173/?tab=plan&mode=day');
await p.waitForTimeout(8000);
console.log(await p.locator('.header-nav-item').first().isVisible(), await p.locator('.header-nav-item').first().boundingBox(), await p.evaluate(()=>document.querySelectorAll('.header-nav-item').length));
console.log(await p.evaluate(()=>{const e=document.querySelector('.header-nav-item');const cs=getComputedStyle(e);let a=e,o=[];while(a){const c=getComputedStyle(a);o.push(a.tagName+'.'+a.className+' '+c.display+' '+c.visibility+' '+c.opacity);a=a.parentElement;}return o.slice(0,8).join('\n')}));
await b.close();
