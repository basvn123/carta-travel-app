import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','continent.mapGuideDismissed.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
await p.goto('http://localhost:4173/?tab=trips'); await p.waitForTimeout(3500);
await p.locator('.account-door[aria-label^="Account"]').click(); await p.waitForTimeout(1200);
console.log(p.url().slice(0,50), await p.locator('.account-panel').isVisible());
await p.goBack(); await p.waitForTimeout(3000); console.log(p.url().slice(0,60), await p.locator('.account-panel').count(), await p.locator('.account-panel').isVisible().catch(()=>'x'));
console.log(await p.evaluate(()=>{const e=document.querySelector('.account-panel');let n=e,out=[];while(n&&n!==document.body){out.push(n.className+' hidden='+n.hidden+' disp='+getComputedStyle(n).display);n=n.parentElement}return out}));
await b.close();
