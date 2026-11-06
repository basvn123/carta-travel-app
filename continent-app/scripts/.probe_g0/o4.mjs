import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.welcomeSeen','continent.mapGuideDismissed.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
await p.goto('http://localhost:4173/?tab=explore&cat=beaches&dc=beaches'); await p.waitForTimeout(5000);
await p.locator('.places-bcard .card-open').first().click(); await p.waitForTimeout(2500);
console.log(p.url().replace(/&d=.*/,''));
console.log(await p.evaluate(()=>{const c=new Set();document.querySelectorAll('[class]').forEach(e=>{if(e.offsetParent)e.className.toString().split(/\s+/).forEach(x=>c.add(x))});return [...c].filter(x=>/^(bpage|ipage|ihead|dsk|pgal|tpage|jpage|destp)/.test(x)).join(' ')}));
await b.close();
