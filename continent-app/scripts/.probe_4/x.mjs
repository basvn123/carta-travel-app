import { chromium } from 'playwright';
const b = await chromium.launch();
const c = await b.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block'});
const p = await c.newPage();
await p.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false});localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('continent.homeSeen.v1','1');localStorage.setItem('carta.welcomeSeen','1');});
await p.goto('http://localhost:4173/');
const d = p.locator('.xstart[role="dialog"]');
await d.waitFor({timeout:20000});
await d.locator('.taste-next').click();
await d.locator('.pf-like[data-like="hiking"]').click();
await d.locator('.taste-skip').click();
await p.waitForTimeout(1000);

await p.waitForTimeout(1000);
await p.getByText('See all').first().click();await p.waitForTimeout(1500);await p.screenshot({path:'/tmp/claude-0/p4.png'});await p.locator('.sdock-filters').click();await p.waitForTimeout(1000);console.log(await p.locator('.sdock-round').count(), await p.locator('.taste-door').allTextContents(), await p.locator('.taste-door:visible').first().isVisible());
await p.locator('.taste-door:visible').first().click({timeout:3000}).catch(e=>console.log('click fail'));
await p.waitForTimeout(1500);
console.log(await p.locator('.taste-sheet .taste-q').allTextContents());
await b.close();
