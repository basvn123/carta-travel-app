import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const APP = process.env.APP;
const DIST = path.join(APP, process.env.DISTDIR || 'dist');
const { chromium } = createRequire(path.join(APP, 'package.json'))('playwright');
const PORT = Number(process.env.PORT || 5202), BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res)=>{
  const u = decodeURIComponent(new URL(req.url,BASE).pathname);
  let f = u==='/'?path.join(DIST,'index.html'):path.join(DIST,u.slice(1));
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){ if(path.extname(u)){res.writeHead(404).end('nf');return;} f=path.join(DIST,'index.html'); }
  res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const PROBE=()=>{window.__e=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId)window.__e.push({d:e.duration,n:e.name})}).observe({type:'event',buffered:true,durationThreshold:0})}catch{}};
const SEEDS=()=>{try{localStorage.setItem('continent.lang.v1','en');localStorage.setItem('continent.guestMode.v1','1');localStorage.setItem('carta.welcomeSeen.v1','1')}catch{}};
const browser = await chromium.launch();
const DEV=[{k:'desktop',vp:{width:1440,height:900},cpu:1},{k:'phone',vp:{width:390,height:844},cpu:4,m:true}];
const out=[];
for(const dev of DEV){ const S=[];
 for(let r=0;r<RUNS;r++){
  const ctx=await browser.newContext({viewport:dev.vp,isMobile:!!dev.m,hasTouch:!!dev.m,serviceWorkers:'block'});
  const page=await ctx.newPage(); const hosts=new Set(); let fontBytes=0, fontReq=0;
  page.on('request',q=>{const h=new URL(q.url()).host; if(!h.startsWith('127.0.0.1'))hosts.add(h)});
  page.on('response',async rs=>{if(/\/fonts\/[^/]*\.(woff2|ttf)$/.test(rs.url())){fontReq++;try{fontBytes+=(await rs.body()).length}catch{}} else if(/fonts\.g/.test(rs.url())){fontReq++;try{fontBytes+=(await rs.body()).length}catch{}}});
  await page.addInitScript(PROBE); await page.addInitScript(SEEDS);
  if(dev.cpu>1){const c=await ctx.newCDPSession(page);await c.send('Emulation.setCPUThrottlingRate',{rate:dev.cpu});}
  await page.goto(BASE+'/?tab=map',{waitUntil:'domcontentloaded'});
  await page.locator('.xcard').first().waitFor({timeout:180000}); await page.waitForTimeout(2500);
  const fonts=await page.evaluate(async()=>{await document.fonts.ready;return [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight).slice(0,12)});
  const mark=()=>page.evaluate(()=>window.__e.length);
  const inpFrom=async(i)=>{const ev=await page.evaluate(i=>window.__e.slice(i),i);return {n:ev.length,max:ev.length?Math.max(...ev.map(e=>e.d)):null}};
  // slider: the trip-length slider on the Destinations tab (the only live range input)
  await page.goto(BASE+'/?tab=places',{waitUntil:'domcontentloaded'});
  let slider={n:0,max:null,found:0};
  const sl=page.locator('.trip-slider-input:visible');
  await page.locator('.places-cat',{hasText:/^trips$/i}).click({timeout:120000}).catch(()=>{}); await page.waitForTimeout(1600);
  await page.locator('.jcomposed-card').click({timeout:30000}).catch(()=>{}); await page.waitForTimeout(2500);
  await sl.first().waitFor({timeout:30000}).catch(()=>{});
  let i0=await mark(); const nsl=await sl.count(); slider.found=nsl;
  if(nsl){ const el=sl.first(); await el.focus(); for(let k=0;k<10;k++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(120);}
    const bb=await el.boundingBox(); if(bb){await page.mouse.move(bb.x+bb.width*0.1,bb.y+bb.height/2);await page.mouse.down();for(let k=0;k<14;k++){await page.mouse.move(bb.x+bb.width*(0.1+k*0.06),bb.y+bb.height/2);await page.waitForTimeout(40);}await page.mouse.up();}
    await page.waitForTimeout(1200); slider={...(await inpFrom(i0)),found:nsl}; }
  await page.goto(BASE+'/?tab=map',{waitUntil:'domcontentloaded'});
  await page.locator('.xcard').first().waitFor({timeout:180000}); await page.waitForTimeout(2000);
  // map
  i0=await mark(); const tg=page.locator('.xbar .xview-toggle button'); let map={n:0,max:null,found:await tg.count()};
  if(await tg.count()>1){ await tg.nth(1).click().catch(()=>{}); await page.locator('.xcontent-map .maplibregl-canvas').waitFor({timeout:60000}).catch(()=>{}); await page.waitForTimeout(3000);
    const cv=page.locator('.xcontent-map .maplibregl-canvas').first(); const b=await cv.boundingBox({timeout:3000}).catch(()=>null);
    if(b){const cx=b.x+b.width/2,cy=b.y+b.height/2; for(let g=0;g<3;g++){await page.mouse.move(cx,cy);await page.mouse.down();for(let k=1;k<=10;k++){await page.mouse.move(cx+k*14,cy+k*8);await page.waitForTimeout(16);}await page.mouse.up();await page.waitForTimeout(500);} await page.mouse.dblclick(cx,cy); await page.waitForTimeout(1500);}
    map={...(await inpFrom(i0)),found:2}; }
  console.log(JSON.stringify({dev:dev.k,r,slider,map,fontReq,fontBytes}));S.push({slider,map,fontReq,fontBytes,hosts:[...hosts],fonts}); await ctx.close();
 }
 const med=a=>{a=a.filter(x=>x!=null).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)/2)]:null};
 const row={device:dev.k,slider_inp:med(S.map(s=>s.slider.max)),slider_n:med(S.map(s=>s.slider.n)),map_inp:med(S.map(s=>s.map.max)),map_n:med(S.map(s=>s.map.n)),fontReq:med(S.map(s=>s.fontReq)),fontBytes:med(S.map(s=>s.fontBytes)),hosts:[...new Set(S.flatMap(s=>s.hosts))],samples:S};
 out.push(row); console.log(JSON.stringify({...row,samples:undefined}));
}
fs.writeFileSync(process.env.OUT,JSON.stringify(out,null,1));
await browser.close(); server.close();
