import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1360,height:900}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.fareNoticeSeen','carta.welcomeSeen','continent.onboardingSeen.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
await p.goto('http://localhost:4173/?tab=trip&o=CRL&paymock'); await p.waitForTimeout(6000);
console.log(p.url()); console.log((await p.innerText('body')).slice(0,400));
await p.getByRole('button',{name:/start planning/i}).first().click(); await p.waitForTimeout(3000); console.log(p.url().slice(0,70)); console.log((await p.innerText('body')).slice(0,300)); console.log(await p.evaluate(()=>[...document.querySelectorAll('.wbook-tile,.guide-booked-bit,.guide-title')].length));
await b.close();
