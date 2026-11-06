import { chromium } from 'playwright';
import { startNewTrip, stepToTitle } from '../lib/verify_planflow.mjs';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1280,height:900}, serviceWorkers:'block'})).newPage();
await p.addInitScript(()=>{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('carta.welcomeSeen','1');localStorage.setItem('carta.fareNoticeSeen','1');});
await startNewTrip(p,'http://localhost:4173/?paymock'.replace('?paymock',''));
await stepToTitle(p,/When do you want/);
const days=p.locator('.cal-inline .cal-day:not(.outside):not(.disabled)');
await days.nth(3).click(); await days.nth(8).click();
await stepToTitle(p,/New trip/);
await p.locator('.btn-primary.btn-block:visible').first().click();
await p.waitForTimeout(1500);
await p.locator('.btn-primary.btn-block:visible').first().click();
await p.waitForTimeout(1500);
for (let i=0;i<12;i++){
  const t=await p.locator('h2.pf-title, h1.guide-title, .guide-title').first().textContent().catch(()=>'?');
  console.log(i,t, p.url().slice(0,60));
  const pc=p.locator('.pf-pc').first();
  if(await pc.count()){await pc.click();await p.waitForTimeout(700);}
  const nx=p.locator('.btn-primary.btn-block:visible, .guide-next:visible').first();
  if(!(await nx.count()))break;
  await nx.click({timeout:4000}).catch(()=>{});
  await p.waitForTimeout(2500);
}
await p.screenshot({path:'/tmp/claude-0/m.png'});
await b.close();
