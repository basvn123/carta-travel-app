import {start} from './walk.mjs';
const {b,p}=await start();
p.on('response',r=>{const u=r.url(); if(!/node_modules|\/src\//.test(u)) console.log(r.status(),u.slice(0,120))});
await p.locator('.day-ideas-input').fill('colosseo'); await p.waitForTimeout(3000);
await b.close();
