import { chromium } from 'playwright';
const GEO=[{display_name:'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy',lat:'41.9',lon:'12.49',category:'tourism',type:'hotel',address:{country:'Italy',country_code:'it'}}];
export async function start(w=1400){
 const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:w,height:900}})).newPage();
 await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.fareNoticeSeen','carta.welcomeSeen','continent.onboardingSeen.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en');});
 await p.route('**/nominatim.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(GEO)}));
 await p.goto('http://localhost:4173/?tab=day&o=CRL');
 await p.locator('.day-stay-input').waitFor({timeout:120000}); await p.waitForTimeout(900);
 await p.locator('.day-stay-input').fill('Hotel Artemide Rome'); await p.locator('.day-stay-input').press('Enter');
 await p.locator('.day-stay-result').first().click(); await p.locator('.dayw-chosen').waitFor();
 await p.locator('.guide-next').click(); await p.locator('.dayw-when').waitFor(); await p.locator('.guide-next').click();
 await p.locator('.day-ideas-input').waitFor(); await p.waitForTimeout(500);
 return {b,p};
}
export const classes=(p)=>p.evaluate(()=>{const c=new Set();document.querySelectorAll('[class]').forEach(e=>e.className.toString().split(/\s+/).forEach(x=>c.add(x)));return [...c].filter(x=>x&&!/^(xrail|xpane|xov|xrow|storyr|ui-|icon)/.test(x)).join(' ')});
