import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1280,height:900}, serviceWorkers:'block'})).newPage();
await p.addInitScript(()=>{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('carta.welcomeSeen','1');});
await p.goto('http://localhost:4173/?tab=trips');
await p.waitForTimeout(5000);
await p.screenshot({path:'/tmp/claude-0/o.png'});
console.log(await p.locator('.saved-trips-panel button, .saved-trips-panel a, .saved-trips-panel h1,.saved-trips-panel h2,.saved-trips-panel [role=tab]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.tagName+'.'+String(e.className).slice(0,40)+'|'+(e.getAttribute('aria-label')||e.textContent).trim().slice(0,40)).join('\n')));
await b.close();
