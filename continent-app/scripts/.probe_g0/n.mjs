import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:1000}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.welcomeSeen'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
for (const id of ['FCO','TOS']){
await p.goto('http://localhost:4173/#dest='+id); await p.waitForTimeout(5000);
console.log(id, await p.locator('.destp').count(), await p.locator('.crowd-badge').count(), await p.locator('.destp .crowd-badge').count(), p.url().slice(0,80));
console.log(await p.evaluate(()=>[...document.querySelectorAll('.crowd-badge')].map(e=>e.closest('[class]').parentElement.className+' > '+e.className+' '+e.title)));
}
await b.close();
