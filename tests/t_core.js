require('./core.js'); const C=globalThis.RadarCore;
const cfg={source:"demo", robots:[{strategy:"overlay",tf:"5m",pairs:["EUR/USD","BTC/USD","AAPL"]},{strategy:"zigzag",market:"otc",tf:"1m",pairs:["GBP/USD","ETH/USD"]}]};
const kinds={};
const e=C.createEngine({cfg, demoMs:300, running:[true,true], onEvent:ev=>{kinds[ev.kind]=(kinds[ev.kind]||0)+1;}});
(async()=>{ await e.init(); const t0=Date.now(); while(Date.now()-t0<25000){ e.tick(); await new Promise(r=>setTimeout(r,50)); }
 const s=e.snapshot({}); console.log(kinds, JSON.stringify(s.stats), s.robots.map(r=>r.state+" "+r.active), s.watch.map(w=>w.sym+":"+w.priceTxt+":"+w.st.map(x=>x.txt).join("|")).join("  "));
 console.log(Object.keys(s.charts[0].ov), s.charts[0].ov.sig.filter(Boolean).length, s.hist.slice(0,4).map(h=>h.sym+" "+h.setup+" "+h.result));
 const leg=C.normalizeCfg({pairs:["EUR/USD"],minPayout:70,riskPct:2,robots:[{strategy:"pa"},{strategy:"candle"}]}); console.log(JSON.stringify(leg.robots.map(r=>[r.strategy,r.pairs,r.minPayout,r.riskPct,r.ov])));
 process.exit(0); })();
