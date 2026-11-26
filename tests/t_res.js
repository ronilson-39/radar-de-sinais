require('./core.js'); const C=globalThis.RadarCore;
const cfg={source:"demo", robots:[{strategy:"zigzag",tf:"5m",pairs:["EUR/USD"],gale:0},{strategy:"overlay",tf:"5m",pairs:["GBP/USD"],gale:0}]};
const e=C.createEngine({cfg, demoMs:3000, running:[true,true]});
(async()=>{ await e.init(); const seq=[[],[]]; const t0=Date.now();
 while(Date.now()-t0<150000){ e.tick(); const s=e.snapshot({}); s.robots.forEach((r,i)=>{ if(seq[i][seq[i].length-1]!==r.state) seq[i].push(r.state); }); await new Promise(r=>setTimeout(r,200)); }
 console.log(seq.map(x=>x.join(">")).join("\n")); process.exit(0); })();
