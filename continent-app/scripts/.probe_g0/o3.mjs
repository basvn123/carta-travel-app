import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.welcomeSeen','continent.mapGuideDismissed.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
await p.goto('http://localhost:4173/?tab=explore&cat=beaches&dn=SE&dc=beaches'); await p.waitForTimeout(5000);
console.log(await p.locator('.places-list .places-bcard .score-chip').allInnerTexts().then(a=>a.slice(0,25).map(x=>x.split('\n')[0]).join(',')));
console.log(await p.evaluate(()=>[...document.querySelectorAll('.places-bcard')].slice(0,6).map(e=>e.querySelector('.places-card-name')?.innerText+'|'+(e.querySelector('.places-bcard-where')?.innerText||'').replace(/\n/g,' '))));
await b.close();
