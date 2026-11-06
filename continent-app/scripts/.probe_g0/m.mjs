import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1280,height:900}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.fareNoticeSeen','carta.welcomeSeen','continent.onboardingSeen.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
await p.goto('http://localhost:4173/?tab=plan&mode=new'); await p.waitForTimeout(4000);
await p.locator('.pf-open-start').click(); await p.waitForTimeout(1000);
await p.getByRole('button',{name:/^continue$/i}).click(); await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.pf-rail-step')].map(e=>e.className+'|'+e.innerText.replace(/\s+/g,' '))));
for (let i=0;i<16;i++){ const t=(await p.locator('.pf-title').innerText().catch(()=>'?')).slice(0,50); console.log(i,t, p.url().slice(0,60));
 if(await p.locator('.cal-day:not(.disabled):not(.outside)').count()){ const d=p.locator('.cal-day:not(.disabled):not(.outside)'); await d.nth(3).click(); await d.nth(9).click(); await p.waitForTimeout(300);} 
 if(await p.locator('input.guide-search').count()){ await p.locator('input.guide-search').first().fill('Ghent'); await p.waitForTimeout(1500); const h=p.locator('.guide-city-btn').first(); if(await h.count()) await h.click(); await p.waitForTimeout(500);} 
 const btns=await p.evaluate(()=>[...document.querySelectorAll('.pf-stage button, .pf-foot button')].filter(e=>e.offsetParent).map(e=>e.innerText.replace(/\s+/g,' ').slice(0,40)).filter(Boolean)); console.log('  ',btns.slice(-8).join(' / '));
 await p.getByRole('button',{name:/^(continue|skip|next)/i}).last().click({timeout:4000}).catch(e=>console.log('noNext')); await p.waitForTimeout(1500);}
await b.close();
