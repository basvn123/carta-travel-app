import { chromium } from 'playwright';
import {readFileSync} from 'node:fs';
const b = await chromium.launch(); const page = await (await b.newContext({viewport:{width:1500,height:980}})).newPage();
const PLAN_ID='local:verify';
const STOPS=[{idx:2,name:'Salzburg Cathedral'},{idx:11,name:'Erzabtei Sankt Peter'},{idx:1,name:'Hohensalzburg Fortress'},{idx:4,name:'Schloss Mirabell'}];
eval('(async()=>{'+readFileSync('scripts/.probe_g0/seed.txt','utf8').replace(/\n\s*\}, \{ planId: PLAN_ID, stops: STOPS \}\);/,'}, { planId: PLAN_ID, stops: STOPS });')+'globalThis.__x=1})').call;
