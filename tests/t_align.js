require('./core.js'); const C=globalThis.RadarCore;
const cfg={source:"demo", robots:[{strategy:"overlay",tf:"1m",pairs:["BTC/USD","ETH/USD","SOL/USD","EUR/USD","GBP/USD"]},{strategy:"zigzag",market:"otc",tf:"5m",pairs:["EUR/USD"]}]};
const evs=[];
const e=C.createEngine({cfg, running:[true,true], onEvent:ev=>evs.push(ev)});
(async()=>{ await e.init(); const t0=Date.now();
 const s=e.snapshot({}); const now=Date.now();
 console.log('notice', s.notice[1]); console.log('nextIn', s.robots.map(r=>r.nextIn.toFixed(1)), 'expected', (60-(now/1000)%60).toFixed(1), (300-(now/1000)%300).toFixed(1));
 while(Date.now()-t0<75000){ e.tick(); await new Promise(r=>setTimeout(r,250)); }
 const s2=e.snapshot({}); console.log(evs.filter(x=>x.kind!=="info").map(x=>new Date(x.t).toISOString().slice(11,19)+" "+x.kind+" "+x.text).slice(0,8));
 const op=s2.robots[0].op; if(op) console.log('op left', op.left.toFixed(1), op.started);
 console.log('lastcandle', s2.chart.sym, s2.chart.candles.slice(-3).map(k=>new Date(k[0]).toISOString().slice(11,19)), 'states', s2.robots.map(r=>r.state), s2.robots[0].check.items.map(i=>i.ok)); console.log('hist', s2.hist.slice(0,3).map(h=>[new Date(h.t).toISOString().slice(11,19), h.t%60000]));
 process.exit(0); })();
