import {start} from './walk.mjs';
const {b,p}=await start();
await p.waitForTimeout(4000);
for (const q of ['colosseum','colosseo','rome','vatican']){
await p.locator('.day-ideas-input').fill(q); await p.waitForTimeout(2500);
console.log(q,await p.evaluate(()=>[...document.querySelectorAll('.day-ideas-group')].map(g=>g.querySelector('.day-ideas-h')?.textContent+': '+[...g.querySelectorAll('.day-ideas-row')].map(r=>r.innerText.replace(/\s+/g,' ')).join(' | '))));}
await p.locator('.day-ideas-input').fill('');await p.waitForTimeout(500);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.day-ideas-group')].map(g=>g.querySelector('.day-ideas-h')?.textContent+': '+[...g.querySelectorAll('.day-ideas-row')].length)));
await b.close();
