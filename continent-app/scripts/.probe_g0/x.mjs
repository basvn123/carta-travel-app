import { chromium } from 'playwright';
const [,, url, w='1400', sel=''] = process.argv;
const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:+w,height:900}})).newPage();
await p.goto(url); await p.waitForTimeout(6000);
console.log(await p.evaluate(()=>{const c=new Set();document.querySelectorAll('[class]').forEach(e=>e.className.toString().split(/\s+/).forEach(x=>c.add(x)));return [...c].filter(x=>x).join(' ')}));
console.log('---BODY', (await p.innerText('body')).slice(0,800));
await b.close();
