import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1280,height:900}, serviceWorkers:'block'})).newPage();
await p.addInitScript(()=>{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('carta.welcomeSeen','1');});
await p.goto('http://localhost:4173/?tab=plan');
await p.locator('.pf-open-start').click();
await p.locator('.pf-past').click();
const form=p.locator('.pasttrip-form');
await form.waitFor();
await form.locator('.pasttrip-input').first().fill('Salzburg');
await p.waitForTimeout(800);
await form.locator('.pasttrip-result').filter({hasText:'Salzburg'}).first().click();
async function pick(which,monthsBack,day){const cell=p.locator('.pasttrip-datecell').nth(which);await cell.locator('.date-field-trigger').click();const cal=p.locator('.cal').last();await cal.waitFor();for(let i=0;i<monthsBack;i++){await cal.getByRole('button',{name:'Previous month'}).click();await p.waitForTimeout(80);}await cal.locator('.cal-day:not(.outside)').filter({hasText:new RegExp('^'+day+'$')}).first().click();await p.waitForTimeout(250);}
console.log(await p.locator('.pasttrip-datecell').count(), await p.locator('.date-field-trigger').count());
await pick(0,1,8); await pick(1,1,12);
await form.locator('.pasttrip-details').click();
await p.waitForTimeout(500);
await form.locator('.pasttrip-fold-head').filter({hasText:'Who came'}).first().click();
for (const n of ['Sofie','Jonas']) { await form.locator('.pasttrip-ghost').filter({hasText:'Add a name'}).click(); await p.waitForTimeout(120); await form.locator('.pasttrip-fold-body .pasttrip-input').last().fill(n); }
await form.locator('.pasttrip-save').click();
await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/claude-0/i.png'});
console.log(p.url());
console.log(await p.locator('.saved-trips-panel').evaluate(f=>[...f.querySelectorAll('button,a,h2,h3,article,li')].filter(e=>e.getClientRects().length).slice(0,40).map(e=>e.tagName+'.'+String(e.className).slice(0,40)+'|'+e.textContent.trim().slice(0,40)).join('\n')));
await b.close();
