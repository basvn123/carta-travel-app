import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1280,height:800}});
await p.addInitScript(()=>{for(const k of ['continent.guestMode.v1','continent.homeSeen.v1','carta.fareNoticeSeen','carta.welcomeSeen','continent.onboardingSeen.v1'])localStorage.setItem(k,'1');localStorage.setItem('continent.lang.v1','en')});
await p.goto('http://localhost:4173/?tab=map'); await p.waitForTimeout(6000);
await p.locator('.xquick-filters').click(); await p.waitForTimeout(1000);
await p.locator('.xpane-chips .ui-chip',{hasText:'Beach'}).first().click(); await p.waitForTimeout(3000);
console.log(p.url().replace(/&d=.*/,'')); console.log(await p.evaluate(()=>({names:[...document.querySelectorAll('.xrow .xrow-name')].slice(0,5).map(e=>e.innerText),vis:[...document.querySelectorAll('.xrow')].filter(e=>e.offsetParent).length,chips:[...document.querySelectorAll('.xchips .xchip')].map(e=>e.className+':'+e.innerText),badge:document.querySelector('.xfilters-n')?.innerText,sel:[...document.querySelectorAll('.ui-chip.is-selected')].map(e=>e.innerText), shell:document.querySelector('.explore-shell').className})));
await b.close();
