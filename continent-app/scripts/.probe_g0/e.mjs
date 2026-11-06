import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:1500,height:980}})).newPage();
const planId='local:verify';
await p.addInitScript((planId)=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.fareNoticeSeen','carta.welcomeSeen','continent.onboardingSeen.v1'])localStorage.setItem(k,'1');
localStorage.setItem('carta.dayplans.v1',JSON.stringify([{id:planId,label:'Salzburg day',startDate:'2026-12-04',stops:[{destinationId:'SZG',days:1}]}]));
localStorage.setItem('carta.dayplan.'+planId,JSON.stringify({0:{0:[2,11,1,4]}}));},planId);
await p.goto('http://localhost:4173/?tab=day&o=CRL'); await p.waitForTimeout(6000);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.dtcard')].map(e=>e.tagName+'.'+e.className+':'+e.innerText.replace(/\s+/g,' '))));
console.log(await p.evaluate(()=>{const e=[...document.querySelectorAll("*")].find(x=>x.children.length===0&&x.textContent==="Salzburg day");return e.parentElement.parentElement.parentElement.outerHTML.slice(0,1500)}));await b.close();process.exit()
console.log(await p.evaluate(()=>{const c=new Set();document.querySelectorAll('[class]').forEach(e=>e.className.toString().split(/\s+/).forEach(x=>c.add(x)));return [...c].filter(x=>/^(dayws|dayr|day-|dayp)/.test(x)).join(' ')}));
console.log((await p.innerText('body')).slice(0,600));
await b.close();
