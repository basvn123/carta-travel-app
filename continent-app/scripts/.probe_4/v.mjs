import { chromium } from 'playwright';
import { startNewTrip, stepToTitle } from '../lib/verify_planflow.mjs';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1500,height:950}, serviceWorkers:'block'})).newPage();
await p.addInitScript(()=>{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('carta.welcomeSeen','1');localStorage.setItem('carta.fareNoticeSeen','1');});
await startNewTrip(p,'http://localhost:4173');
const dump = async (n)=>{await p.waitForTimeout(1500);await p.screenshot({path:`/tmp/claude-0/v_${n}.png`});console.log('---',n);console.log(await p.evaluate(()=>[...document.querySelectorAll('main a,main button,main h1,main h2,main h3,main input,[role=dialog] button')].filter(e=>e.offsetParent).map(b=>b.tagName+'.'+String(b.className).slice(0,45)+'|'+(b.getAttribute('aria-label')||b.textContent).trim().slice(0,40)).filter(l=>!/pf-rail|cal-day/.test(l)).join('\n')));};
await stepToTitle(p,/When do you want/);
// pick dates
const days=p.locator('.cal-inline .cal-day:not(.outside):not(.disabled)');
await days.nth(3).click(); await days.nth(8).click();
await p.locator('.btn-primary.btn-block:visible').first().click();
let n=0;
for(let i=0;i<8;i++){ await dump(++n); const bt=p.locator('.btn-primary.btn-block:visible').first(); if(!(await bt.count()))break; await bt.click().catch(()=>{}); }
await b.close();
