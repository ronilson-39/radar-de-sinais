/* Radar de Sinais — motor dos robôs. Roda igual no navegador e no servidor (Node 18+). */
(function(G){
"use strict";
const TF = {"1m":60e3,"5m":300e3,"15m":900e3,"30m":1800e3,"1h":3600e3,"4h":14400e3,"1d":86400e3};
const MT = {"1m":"M1","5m":"M5","15m":"M15","30m":"M30","1h":"H1","4h":"H4","1d":"D1"};
const TDI = {"1m":"1min","5m":"5min","15m":"15min","30m":"30min","1h":"1h","4h":"4h","1d":"1day"};
const STRAT_NAME = {prob:"Probabilística", pa:"Price action: topos e fundos", candle:"Padrões de vela", zigzag:"ZigZag", overlay:"Overlay (toque no S/R)"};
const STRAT_DESC = {
  prob:"Testa cinco leituras no histórico do próprio ativo e escolhe a de maior acerto. Só indica se até a estimativa pessimista superar o equilíbrio do payout.",
  pa:"Topos e fundos ascendentes ou descendentes, pullback no último fundo/topo, MM20, reteste de rompimento, fundo e topo duplo.",
  candle:"Martelo, engolfos, perfuração, nuvem negra, estrelas, vela elefante, vela de cola, GBI/RBI, Toro/Oso 180, sempre com contexto e confirmação.",
  zigzag:"Alternância de velas. Depois de 2 ou mais velas vermelhas surge uma verde e a vela seguinte fecha vermelha: COMPRA na próxima vela. Depois de 2 ou mais verdes surge uma vermelha e a seguinte fecha verde: VENDA na próxima vela. Vale para mercado aberto e OTC.",
  overlay:"Indicador MElhor: Suporte e Resistência Macro (máxima e mínima dos últimos N períodos), linha guia de tendência e canal. Quando a vela toca a Resistência (vela verde) indica VENDA; quando toca o Suporte indica COMPRA. A entrada é na vela seguinte."
};
const ASSETS = {
  forex:{name:"Forex", list:["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","USD/CHF","NZD/USD","EUR/JPY","GBP/JPY","EUR/GBP","AUD/JPY","AUD/CAD","EUR/AUD","GBP/CHF"]},
  crypto:{name:"Cripto", list:["BTC/USD","ETH/USD","SOL/USD","XRP/USD","BNB/USD","ADA/USD","DOGE/USD","LTC/USD"]},
  stocks:{name:"Ações", list:["AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","NFLX"]}
};
const CRYPTO_CODES = ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","LTC","DOT","AVAX","MATIC","LINK","TRX","SHIB","TON","BCH","XLM","ATOM","UNI","NEAR"];
const FXC = ["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","SGD","HKD","NOK","SEK","DKK","PLN","TRY","ZAR","MXN","BRL","INR","CNH","RUB","THB","HUF","CZK","ILS"];
function classOf(sym){
  if(sym.includes("/")) return CRYPTO_CODES.includes(sym.split("/")[0])? "crypto" : "forex";
  // nomes da IQ Option (EURUSD, EURUSD-OTC, BTCUSD, APPLE...)
  if(typeof IQCAT!=="undefined" && IQCAT){ const a=IQCAT.find(x=>x[0]===sym); if(a){ if(a[1]==="crypto") return "crypto"; if(a[1]==="other") return "stocks"; } }
  const b=sym.split("-")[0];
  if(b.length===6 && FXC.includes(b.slice(0,3)) && FXC.includes(b.slice(3))) return "forex";
  if(CRYPTO_CODES.some(c=>b.startsWith(c) && /(USD|USDT|EUR)$/.test(b))) return "crypto";
  return "stocks";
}
const ALL_PAIRS = ASSETS.forex.list;
const DEFAULT_PAY = {"EUR/USD":87,"GBP/USD":85,"USD/JPY":85,"AUD/USD":82,"USD/CAD":80,"USD/CHF":78,"NZD/USD":75,"EUR/JPY":85,"GBP/JPY":82,"EUR/GBP":80,"AUD/JPY":80,"AUD/CAD":76,"EUR/AUD":78,"GBP/CHF":74,
  "BTC/USD":85,"ETH/USD":85,"SOL/USD":82,"XRP/USD":82,"BNB/USD":80,"ADA/USD":80,"DOGE/USD":80,"LTC/USD":80,
  "AAPL":82,"MSFT":82,"NVDA":82,"TSLA":82,"AMZN":82,"GOOGL":80,"META":80,"NFLX":80};
const OV_DEF = {sr:45, trend:34, mult:1.5};
const ROBOT_DEF = {strategy:"prob", tf:"5m", expiry:1, gale:1, market:"open", pairs:["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","EUR/JPY"], known:[], payouts:{}, minPayout:80, riskPct:1, ov:OV_DEF};
const DEFAULT_ROBOTS = [Object.assign({},ROBOT_DEF,{id:"r1", name:"Robô 1"}), Object.assign({},ROBOT_DEF,{id:"r2", name:"Robô 2", strategy:"zigzag"})];
const DEFAULTS = {capital:1000, source:"live", apiKey:"", robots:DEFAULT_ROBOTS};
const clamp = (v,a,b,d) => { v=+v; return isFinite(v)? Math.max(a,Math.min(b,v)) : d; };
function normalizeCfg(s){
  const c=JSON.parse(JSON.stringify(DEFAULTS));
  if(s && typeof s==="object"){
    if(s.capital) c.capital=s.capital; if(s.demoSpeed) c.demoSpeed=s.demoSpeed; if(s.source) c.source=s.source; if(s.apiKey) c.apiKey=s.apiKey; if(typeof s.mtSuffix==="string") c.mtSuffix=s.mtSuffix; if(s.iqOtc!=null) c.iqOtc=s.iqOtc; if(typeof s.tz==="string") c.tz=s.tz; if(s.iqPay!=null) c.iqPay=s.iqPay;
    // v4 e anteriores: pares, payout e risco eram globais; agora cada robô tem os seus
    const legacy={}; if(Array.isArray(s.pairs)) legacy.pairs=s.pairs; if(s.payouts) legacy.payouts=s.payouts; if(s.minPayout) legacy.minPayout=s.minPayout; if(s.riskPct) legacy.riskPct=s.riskPct;
    if(Array.isArray(s.knownPairs)) legacy.known=s.knownPairs.filter(x=>!Object.values(ASSETS).some(a=>a.list.includes(x)));
    if(Array.isArray(s.robots)&&s.robots.length===2) c.robots=s.robots.map((r,i)=>Object.assign({},DEFAULT_ROBOTS[i],legacy,r));
    else c.robots=c.robots.map(r=>Object.assign(r,legacy));
  }
  c.robots.forEach((r,i)=>{
    r.id=DEFAULT_ROBOTS[i].id; r.name=DEFAULT_ROBOTS[i].name; if(!TF[r.tf]) r.tf="5m"; if(!STRAT_NAME[r.strategy]) r.strategy="prob";
    r.expiry=1; // a expiração é sempre o fechamento da vela do tempo gráfico (igual à vela do MetaTrader) r.gale=clamp(r.gale,0,2,0)|0; r.market=r.market==="otc"?"otc":"open";
    r.pairs=Array.isArray(r.pairs)? Array.from(new Set(r.pairs.filter(x=>typeof x==="string"&&x))) : ROBOT_DEF.pairs.slice();
    r.known=Array.isArray(r.known)? Array.from(new Set(r.known.filter(x=>typeof x==="string"&&x))) : [];
    r.payouts=Object.assign({}, r.payouts||{}); r.minPayout=clamp(r.minPayout,1,100,80); r.riskPct=clamp(r.riskPct,0.1,10,1);
    const o=r.ov||{}; r.ov={sr:clamp(o.sr,5,100,45)|0, trend:clamp(o.trend,10,200,34)|0, mult:clamp(o.mult,0.5,5,1.5)};
  });
  c.capital=+c.capital||1000; c.source=["demo","mt","iq"].includes(c.source)? c.source : "live"; c.iqOtc=!!c.iqOtc; c.tz=/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(c.tz||"")? c.tz : ""; c.iqPay=c.iqPay!==false; c.mtSuffix=String(c.mtSuffix||"").replace(/[^A-Za-z0-9._#-]/g,"").slice(0,10); c.demoSpeed=c.demoSpeed==="fast"?"fast":"real";
  return c;
}
let cfg = normalizeCfg(null);
// Com a IQ Option conectada, o payout vem da corretora (turbo até M5, binária acima); senão vale o informado por você
let IQPAY = null, IQCAT = null;
const IQ_STOCKS = {"AAPL":"APPLE","AMZN":"AMAZON","GOOGL":"GOOGLE","GOOG":"GOOGLE","META":"FACEBOOK","FB":"FACEBOOK","TSLA":"TESLA","NFLX":"NFLX:US"};
const iqName = s => s.includes("/")? s.replace("/","")+(cfg.iqOtc?"-OTC":"") : (IQ_STOCKS[s]||s);
const payOf = (s, rc) => { if(IQPAY && cfg.iqPay && IQPAY[iqName(s)]){ const p=IQPAY[iqName(s)], k=rc&&TF[rc.tf]>300e3? "binary" : "turbo"; const v=p[k]||p.turbo||p.binary; if(v) return v; } return +((rc&&rc.payouts[s]) ?? DEFAULT_PAY[s] ?? 80); };
const breakEven = pay => 1/(1+pay/100);

/* ============ Dados: Twelve Data ============ */
function parseTD(obj){
  if(!obj || obj.status==="error" || !Array.isArray(obj.values)) { const e=new Error((obj&&obj.message)||"Sem dados"); e.code=obj&&obj.code; throw e; }
  return obj.values.map(v=>({t:Date.parse(v.datetime.replace(" ","T")+(v.datetime.length<=10?"T00:00:00Z":"Z")), o:+v.open, h:+v.high, l:+v.low, c:+v.close}))
    .filter(k=>isFinite(k.t)&&isFinite(k.c)).sort((a,b)=>a.t-b.t);
}
async function tdSeries(symbols, tf, size){
  const url="https://api.twelvedata.com/time_series?symbol="+encodeURIComponent(symbols.join(","))+"&interval="+TDI[tf]+"&outputsize="+size+"&timezone=UTC&order=ASC&apikey="+encodeURIComponent(cfg.apiKey);
  const r = await fetch(url,{cache:"no-store"}); const j = await r.json();
  if(j && j.status==="error"){ const e=new Error(j.message||"Erro na API"); e.code=j.code; e.global=true; throw e; }
  const out={};
  if(symbols.length===1){ try{ out[symbols[0]]=parseTD(j); }catch(e){ out[symbols[0]]={err:e.message}; } }
  else for(const s of symbols){ try{ out[s]=parseTD(j[s]); }catch(e){ out[s]={err:(e.message||"Sem dados")}; } }
  return out;
}
async function tdPrice(sym){
  const r=await fetch("https://api.twelvedata.com/price?symbol="+encodeURIComponent(sym)+"&apikey="+encodeURIComponent(cfg.apiKey),{cache:"no-store"});
  const j=await r.json(); const p=parseFloat(j&&j.price); if(!isFinite(p)) throw new Error("sem preço"); return p;
}

/* ============ Dados: MetaTrader via API2Trade (só no servidor: a chave fica nas variáveis de ambiente) ============ */
let MTO = null; // {key, account, base}
const mtSym = s => s.replace("/","") + (cfg.mtSuffix||"");
async function mtQuote(sym){
  const u=MTO.base.replace(/\/$/,"")+"/GetQuote?id="+encodeURIComponent(MTO.account)+"&symbol="+encodeURIComponent(mtSym(sym));
  const r=await fetch(u,{headers:{"x-api-key":MTO.key}, cache:"no-store"});
  if(!r.ok){ const e=new Error("HTTP "+r.status+(r.status===401||r.status===403?" (chave ou conta inválida)":r.status===429?" (limite de uso)":"")); e.status=r.status; throw e; }
  const j=await r.json(); const p=parseFloat(j&&j.bid); if(!isFinite(p)) throw new Error("sem cotação para "+mtSym(sym)); return p;
}

/* ============ Dados: IQ Option (ponte Python local no servidor, biblioteca iqoptionapi) ============ */
let IQO = null; // {base}
async function iqGet(path){
  const r=await fetch(IQO.base+path,{cache:"no-store"}); const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||("HTTP "+r.status)); return j;
}
async function iqCandles(sym, tf, count){
  const j=await iqGet("/candles?sym="+encodeURIComponent(sym)+"&otc="+(cfg.iqOtc?1:0)+"&size="+(TF[tf]/1000)+"&count="+count);
  return j.candles.map(k=>({t:k[0], o:k[1], h:k[2], l:k[3], c:k[4]}));
}

/* ============ Simulador (treino) ============ */
let DEMO_MS = 20000, DEMO_FORCED = false; // simulação acelerada: uma vela dura 20 s reais
const BASE = {"EUR/USD":1.0523,"GBP/USD":1.2641,"USD/JPY":151.42,"AUD/USD":0.6512,"USD/CAD":1.3984,"USD/CHF":0.8821,"NZD/USD":0.5893,"EUR/JPY":159.33,"GBP/JPY":191.4,"EUR/GBP":0.8325,"AUD/JPY":98.61,"AUD/CAD":0.9107,"EUR/AUD":1.6159,"GBP/CHF":1.115,"BTC/USD":94500,"ETH/USD":3350,"SOL/USD":238,"XRP/USD":1.42,"BNB/USD":640,"ADA/USD":0.98,"DOGE/USD":0.39,"LTC/USD":104,"AAPL":234,"MSFT":428,"NVDA":146,"TSLA":338,"AMZN":207,"GOOGL":169,"META":575,"NFLX":880};
const VOLX = {forex:1, crypto:6, stocks:3};
function rng(seed){ let s = seed>>>0 || 1; return ()=>{ s ^= s<<13; s>>>=0; s ^= s>>17; s ^= s<<5; s>>>=0; return s/4294967296; }; }
function hash(str){ let h=2166136261; for(const ch of str){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function makeSim(sym, tf){
  const r = rng(hash(sym+tf+Math.floor(Date.now()/86400e3)));
  const g = ()=>{ let u=0,v=0; while(!u) u=r(); while(!v) v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  const vol = 0.00045 * (VOLX[classOf(sym)]||1) * Math.sqrt(TF[tf]/300e3);
  let price = BASE[sym] || (classOf(sym)==="stocks"? 50+r()*200 : 1 + r()), drift = 0, left = 0;
  return { g, r, next(t){
    if(left--<=0){ const k=r(); drift = k<0.35? vol*0.3 : k<0.7? -vol*0.3 : 0; left = 25 + Math.floor(r()*70); }
    const o = price, c = o*(1 + drift + vol*g()*0.9);
    let h = Math.max(o,c)*(1+Math.abs(g())*vol*0.45), l = Math.min(o,c)*(1-Math.abs(g())*vol*0.45);
    const w = r();
    if(w<0.06) l = Math.min(o,c) - Math.abs(c-o)*(2+r()*2) - o*vol*0.6;
    else if(w<0.12) h = Math.max(o,c) + Math.abs(c-o)*(2+r()*2) + o*vol*0.6;
    price = c; return {t, o, h, l, c};
  }};
}
function digitsFor(v){ const a=Math.abs(v); return a>=1000?2: a>=50?3: 5; }
function fmt(v){ if(v==null||!isFinite(v)) return "—"; const d=digitsFor(v); return v.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}); }
const money = v => "US$ "+v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
/* ============ Indicadores ============ */
function ema(a,p){ const out=new Array(a.length); const k=2/(p+1); let e=a[0]; for(let i=0;i<a.length;i++){ e = i===0? a[0] : a[i]*k + e*(1-k); out[i]=e; } return out; }
function atrArr(c,p=14){ const out=new Array(c.length); let a=0; for(let i=0;i<c.length;i++){ const tr = i===0? c[i].h-c[i].l : Math.max(c[i].h-c[i].l, Math.abs(c[i].h-c[i-1].c), Math.abs(c[i].l-c[i-1].c)); a = i<p? (a*i+tr)/(i+1) : (a*(p-1)+tr)/p; out[i]=a||1e-9; } return out; }
function rsiArr(cl,p=14){ const out=new Array(cl.length).fill(50); let g=0,l=0; for(let i=1;i<cl.length;i++){ const d=cl[i]-cl[i-1]; const up=Math.max(d,0), dn=Math.max(-d,0); if(i<=p){ g+=up/p; l+=dn/p; } else { g=(g*(p-1)+up)/p; l=(l*(p-1)+dn)/p; } out[i] = l===0? 100 : 100-100/(1+g/l); } return out; }
function avgBodyArr(c,p=20){ const out=new Array(c.length); let s=0; for(let i=0;i<c.length;i++){ s+=Math.abs(c[i].c-c[i].o); if(i>=p) s-=Math.abs(c[i-p].c-c[i-p].o); out[i]= s/Math.min(i+1,p); } return out; }
function pivots(c,k=3){ const hi=[], lo=[]; for(let j=k;j<c.length-k;j++){ let isH=true,isL=true; for(let m=1;m<=k;m++){ if(!(c[j].h>c[j-m].h && c[j].h>=c[j+m].h)) isH=false; if(!(c[j].l<c[j-m].l && c[j].l<=c[j+m].l)) isL=false; } if(isH) hi.push(j); if(isL) lo.push(j); } return {hi, lo}; }
const body = x=>Math.abs(x.c-x.o), rng_ = x=>x.h-x.l, upper = x=>x.h-Math.max(x.o,x.c), lower = x=>Math.min(x.o,x.c)-x.l;
const bull = x=>x.c>x.o, bear = x=>x.c<x.o;
function prep(c){ const cl=c.map(x=>x.c); return {c, cl, e20:ema(cl,20), e200:ema(cl,200), atr:atrArr(c), rsi:rsiArr(cl), ab:avgBodyArr(c), pv:pivots(c,3)}; }
function trendUp(P,t){ return P.e20[t]>P.e20[t-5] && P.cl[t]>P.e200[t]; }
function trendDown(P,t){ return P.e20[t]<P.e20[t-5] && P.cl[t]<P.e200[t]; }
function moveDown(P,t){ const c=P.c; let n=0; for(let i=t-5;i<t;i++) if(bear(c[i])) n++; return (c[t-1].c - c[t-6].c) <= -0.8*P.atr[t] || n>=4; }
function moveUp(P,t){ const c=P.c; let n=0; for(let i=t-5;i<t;i++) if(bull(c[i])) n++; return (c[t-1].c - c[t-6].c) >= 0.8*P.atr[t] || n>=4; }
function pivotsBefore(list,t,k=3,back=150){ return list.filter(j=>j+k<=t && j>=t-back); }

/* ============ Padrões de vela ============ */
function patternsAt(P,t){
  const c=P.c, x=c[t], p=c[t-1], pp=c[t-2], ab=P.ab[t]||1e-9, R=rng_(x)||1e-12;
  const up=trendUp(P,t), dn=trendDown(P,t), mD=moveDown(P,t), mU=moveUp(P,t);
  const out=[]; const add=(name,dir,kind,start)=>{ if(!out.some(o=>o.name===name)) out.push({name,dir,kind,start}); };
  const small = body(x) <= 0.35*R;
  if(small && lower(x)>=0.55*R && upper(x)<=0.15*R && lower(x)>=2*body(x)){ if(mD) add("Martelo","buy","rev",t); else if(mU) add("Homem enforcado","sell","rev",t); }
  if(small && upper(x)>=0.55*R && lower(x)<=0.15*R && upper(x)>=2*body(x)){ if(mD) add("Martelo invertido","buy","rev",t); else if(mU) add("Estrela cadente","sell","rev",t); }
  if(bear(p) && bull(x) && x.c>=p.o && x.o<=p.c+1e-12 && body(x)>body(p) && mD) add("Engolfo de alta","buy","rev",t-1);
  if(bull(p) && bear(x) && x.c<=p.o && x.o>=p.c-1e-12 && body(x)>body(p) && mU) add("Engolfo de baixa","sell","rev",t-1);
  if(bear(p) && body(p)>=0.6*ab && bull(x) && x.c>p.c+0.5*body(p) && x.c<p.o && mD) add("Perfuração (piercing line)","buy","rev",t-1);
  if(bull(p) && body(p)>=0.6*ab && bear(x) && x.c<p.c-0.5*body(p) && x.c>p.o && mU) add("Nuvem negra","sell","rev",t-1);
  if(bear(pp) && body(pp)>=ab && body(p)<=0.4*body(pp) && bull(x) && x.c>(pp.o+pp.c)/2 && mD) add("Estrela da manhã","buy","rev",t-2);
  if(bull(pp) && body(pp)>=ab && body(p)<=0.4*body(pp) && bear(x) && x.c<(pp.o+pp.c)/2 && mU) add("Estrela da noite","sell","rev",t-2);
  if(body(x)>=2*ab && body(x)>=0.7*R){ if(bull(x) && up) add("Vela elefante compradora","buy","cont",t); if(bear(x) && dn) add("Vela elefante vendedora","sell","cont",t); }
  if(lower(x)>=0.66*R && up && !out.some(o=>o.dir==="buy")) add("Vela de cola (rejeição inferior)","buy","cont",t);
  if(upper(x)>=0.66*R && dn && !out.some(o=>o.dir==="sell")) add("Vela de cola (rejeição superior)","sell","cont",t);
  if(up && bull(pp) && bear(p) && body(p)<=0.6*ab && bull(x) && x.c>p.h) add("GBI (vela vendedora ignorada)","buy","cont",t-1);
  if(dn && bear(pp) && bull(p) && body(p)<=0.6*ab && bear(x) && x.c<p.l) add("RBI (vela compradora ignorada)","sell","cont",t-1);
  if(up && bear(p) && body(p)>=0.8*ab && bull(x) && body(x)>=0.9*body(p) && x.c>=p.o) add("Toro 180 (virada de fluxo)","buy","cont",t-1);
  if(dn && bull(p) && body(p)>=0.8*ab && bear(x) && body(x)>=0.9*body(p) && x.c<=p.o) add("Oso 180 (correção falhada)","sell","cont",t-1);
  return out;
}

/* ============ Contexto ============ */
function context(P,t,dir){
  const c=P.c, x=c[t], a=P.atr[t], r=[];
  if(dir==="buy"){
    for(const j of pivotsBefore(P.pv.lo,t).reverse()){ const L=c[j].l; if(Math.abs(x.l-L)<=0.6*a || (x.l<L && x.c>L-0.2*a)){ r.push("Teste de suporte (fundo anterior em "+fmt(L)+")"); break; } }
    if(x.l<=P.e20[t]+0.3*a && x.c>=P.e20[t]-0.3*a && P.e20[t]>P.e20[t-5]) r.push("Respeito à MM20 ascendente");
    if(x.l<=P.e200[t]+0.3*a && x.c>=P.e200[t]-0.3*a) r.push("Teste da MM200");
    const H=pivotsBefore(P.pv.hi,t).pop();
    if(H!==undefined && P.cl[t]>P.e200[t]){ const L=pivotsBefore(P.pv.lo,H+3,3,150).filter(j=>j<H).pop(); if(L!==undefined){ const ret=(c[H].h-x.l)/(c[H].h-c[L].l); if(ret>=0.38 && ret<=0.62) r.push("Recuo controlado (~"+Math.round(ret*100)+"% do movimento)"); } }
    let wick=0,nb=0; for(let i=t-3;i<=t;i++){ wick+=lower(c[i]); if(bear(c[i])) nb++; }
    if(nb>=2 && wick>=1.2*a && (x.c-c[t-4].c)>-0.3*a) r.push("Absorção da queda (vendedores sem deslocamento)");
  } else {
    for(const j of pivotsBefore(P.pv.hi,t).reverse()){ const H=c[j].h; if(Math.abs(x.h-H)<=0.6*a || (x.h>H && x.c<H+0.2*a)){ r.push("Teste de resistência (topo anterior em "+fmt(H)+")"); break; } }
    if(x.h>=P.e20[t]-0.3*a && x.c<=P.e20[t]+0.3*a && P.e20[t]<P.e20[t-5]) r.push("Rejeição na MM20 descendente");
    if(x.h>=P.e200[t]-0.3*a && x.c<=P.e200[t]+0.3*a) r.push("Teste da MM200");
    const L=pivotsBefore(P.pv.lo,t).pop();
    if(L!==undefined && P.cl[t]<P.e200[t]){ const H=pivotsBefore(P.pv.hi,L+3,3,150).filter(j=>j<L).pop(); if(H!==undefined){ const ret=(x.h-c[L].l)/(c[H].h-c[L].l); if(ret>=0.38 && ret<=0.62) r.push("Correção controlada (~"+Math.round(ret*100)+"% da queda)"); } }
    let wick=0,nb=0; for(let i=t-3;i<=t;i++){ wick+=upper(c[i]); if(bull(c[i])) nb++; }
    if(nb>=2 && wick>=1.2*a && (x.c-c[t-4].c)<0.3*a) r.push("Exaustão da alta (compradores sem amplitude)");
    if(upper(x)>body(x) && x.c-P.e20[t]>1.5*a) r.push("Perda de momento após alta esticada");
  }
  return r;
}

/* ============ Price action: estrutura ============ */
function paSetup(P,p,dir){
  const c=P.c, a=P.atr[p], x=c[p];
  const H=pivotsBefore(P.pv.hi,p,3,200), L=pivotsBefore(P.pv.lo,p,3,200);
  const h1=H[H.length-2], h2=H[H.length-1], l1=L[L.length-2], l2=L[L.length-1];
  if(h1===undefined || l1===undefined) return null;
  const upS = c[h2].h>c[h1].h && c[l2].l>c[l1].l, dnS = c[h2].h<c[h1].h && c[l2].l<c[l1].l;
  if(dir==="buy"){
    if(upS){
      if(Math.abs(x.l-c[l2].l)<=0.6*a) return {label:"Pullback em fundo ascendente", ctx:"Estrutura de alta: pullback no último fundo ascendente ("+fmt(c[l2].l)+")"};
      if(x.l<=P.e20[p]+0.3*a && x.c>=P.e20[p]-0.3*a) return {label:"Pullback na MM20", ctx:"Estrutura de alta: pullback na MM20"};
      if(Math.abs(x.l-c[h1].h)<=0.5*a && x.c>c[h1].h) return {label:"Reteste de rompimento", ctx:"Reteste do topo rompido ("+fmt(c[h1].h)+") como suporte"};
    }
    if(Math.abs(x.l-c[l2].l)<=0.4*a && p-l2>=5){ let mx=-Infinity; for(let i=l2;i<p;i++) mx=Math.max(mx,c[i].h); if(mx-c[l2].l>=1.5*a) return {label:"Fundo duplo", ctx:"Fundo duplo em "+fmt(c[l2].l)}; }
  } else {
    if(dnS){
      if(Math.abs(x.h-c[h2].h)<=0.6*a) return {label:"Pullback em topo descendente", ctx:"Estrutura de baixa: pullback no último topo descendente ("+fmt(c[h2].h)+")"};
      if(x.h>=P.e20[p]-0.3*a && x.c<=P.e20[p]+0.3*a) return {label:"Pullback na MM20", ctx:"Estrutura de baixa: pullback na MM20"};
      if(Math.abs(x.h-c[l1].l)<=0.5*a && x.c<c[l1].l) return {label:"Reteste de rompimento", ctx:"Reteste do fundo perdido ("+fmt(c[l1].l)+") como resistência"};
    }
    if(Math.abs(x.h-c[h2].h)<=0.4*a && p-h2>=5){ let mn=Infinity; for(let i=h2;i<p;i++) mn=Math.min(mn,c[i].l); if(c[h2].h-mn>=1.5*a) return {label:"Topo duplo", ctx:"Topo duplo em "+fmt(c[h2].h)}; }
  }
  return null;
}
function rejection(P,p,dir){ const x=P.c[p], R=rng_(x)||1e-12, loc=(x.c-x.l)/R; return dir==="buy"? (loc>=0.6 && (bull(x)||lower(x)>=body(x))) : (loc<=0.4 && (bear(x)||upper(x)>=body(x))); }
const confAt = (P,p,t,dir) => dir==="buy"? P.c[t].c>P.c[p].h : P.c[t].c<P.c[p].l;

/* ============ Leituras (regras) e estatística binária ============ */
const RULES = [
  {id:"R1", name:"Padrão de vela em região chave"},
  {id:"R2", name:"Price action (estrutura + rejeição)"},
  {id:"R3", name:"Confluência de fatores (≥4 de 6)"},
  {id:"R4", name:"RSI extremo em suporte/resistência"},
  {id:"R5", name:"Pullback na MM20 a favor da tendência"}
];
function featAt(P,p,pats){
  const out={}, a=P.atr[p], x=P.c[p];
  for(const dir of ["buy","sell"]){
    const ctx=context(P,p,dir), dp=pats.filter(z=>z.dir===dir), pa=paSetup(P,p,dir), rej=rejection(P,p,dir);
    const tr = dir==="buy"? P.cl[p]>P.e200[p] : P.cl[p]<P.e200[p];
    const sl = dir==="buy"? P.e20[p]>P.e20[p-5] : P.e20[p]<P.e20[p-5];
    const rs = dir==="buy"? P.rsi[p]<40 : P.rsi[p]>60;
    const loc = ctx.length>0, pat = dp.length>0;
    const score=(+tr)+(+sl)+(+loc)+(+rs)+(+pat);
    const r5 = dir==="buy"? (trendUp(P,p) && x.l<=P.e20[p]+0.3*a && x.c>=P.e20[p]-0.3*a && bull(x)) : (trendDown(P,p) && x.h>=P.e20[p]-0.3*a && x.c<=P.e20[p]+0.3*a && bear(x));
    out[dir]={ctx,pats:dp,pa,rej,tr,sl,rs,loc,pat,score,
      R:{R1:pat&&loc, R2:!!pa&&rej, R3:score>=3, R4:(dir==="buy"? P.rsi[p]<30 : P.rsi[p]>70)&&loc, R5:r5}};
  }
  return out;
}
function buildFeat(P){ const n=P.c.length, F=new Array(n); for(let p=210;p<n;p++) F[p]=featAt(P,p,patternsAt(P,p)); return F; }
function buildStats(P,F,E){
  const n=P.c.length, S={};
  for(const r of RULES) S[r.id]={buy:{w:0,n:0},sell:{w:0,n:0}};
  for(let t=211;t+E<=n-1;t++){
    const p=t-1, f=F[p]; if(!f) continue;
    for(const dir of ["buy","sell"]){
      if(!confAt(P,p,t,dir)) continue;
      const fin=P.c[t+E].c, ent=P.c[t].c; if(fin===ent) continue;
      const win = dir==="buy"? fin>ent : fin<ent;
      for(const r of RULES) if(f[dir].R[r.id]){ S[r.id][dir].n++; if(win) S[r.id][dir].w++; }
    }
  }
  return S;
}
const post = s => (s.w+1)/(s.n+2);
// limite inferior de Wilson (z=0,84 ≈ 80% de confiança unilateral): a taxa "pior caso razoável" dada a amostra
const wilson = (s,z=0.84) => { if(!s.n) return 0; const p=s.w/s.n, d=1+z*z/s.n; return (p + z*z/(2*s.n) - z*Math.sqrt(p*(1-p)/s.n + z*z/(4*s.n*s.n)))/d; };
const pctTxt = v => Math.round(v*100)+"%";

/* ============ Checklist comum ============ */
function invalidation(P,dir,start,p,ci){
  const c=P.c, last = ci==null? p : ci, a=P.atr[last];
  let stop;
  if(dir==="buy"){ let m=Infinity; for(let i=start;i<=last;i++) m=Math.min(m,c[i].l); stop=m-0.1*a; }
  else { let m=-Infinity; for(let i=start;i<=last;i++) m=Math.max(m,c[i].h); stop=m+0.1*a; }
  const entry = ci==null? (dir==="buy"? c[p].h : c[p].l) : c[ci].c;
  const dist=Math.abs(entry-stop), ok = dist>=0.3*a && dist<=3*a;
  const d = ok? "Leitura invalidada "+(dir==="buy"?"abaixo de ":"acima de ")+fmt(stop)+" ("+(dist/a).toFixed(1)+"× ATR, fora do ruído)"
              : (dist<0.3*a? "Estrutura curta demais ("+(dist/a).toFixed(2)+"× ATR): dentro do ruído" : "Estrutura esticada demais ("+(dist/a).toFixed(1)+"× ATR)");
  return {ok, d, stop, entry};
}
function riskItem(sym, rc){
  const pay=payOf(sym,rc), rp=rc.riskPct, mp=rc.minPayout, stake=cfg.capital*rp/100;
  const ok = pay>=mp && rp>0 && rp<=2;
  const d = pay<mp? "Payout "+pay+"% abaixo do mínimo de "+mp+"%"
          : rp>2? "Valor por entrada de "+rp+"% do saldo acima do limite de 2%"
          : "Payout "+pay+"% (mín. "+mp+"%) · entrada de US$ "+stake.toFixed(2)+" ("+rp+"% do saldo)";
  return {ok, d, stake};
}
function confItem(P,p,ci,dir){
  const c=P.c, lvl = dir==="buy"? c[p].h : c[p].l;
  if(ci==null) return {ok:null, d:"Aguardando o fechamento da vela "+(dir==="buy"?"acima de ":"abaixo de ")+fmt(lvl)};
  const ok=confAt(P,p,ci,dir);
  return {ok, d: ok? "Vela fechou "+(dir==="buy"?"acima da máxima":"abaixo da mínima")+" do gatilho ("+fmt(lvl)+")" : "Vela não fechou "+(dir==="buy"?"acima de ":"abaixo de ")+fmt(lvl)+": entrada descartada"};
}

/* ============ Estratégias: avaliam o gatilho p, com a vela de confirmação ci (ou null = ainda aberta) ============ */
function evalStrategy(A,sym,p,ci,rc){
  const {P,F,ST}=A, f=F[p]; if(!f) return null;
  let best=null;
  for(const dir of ["buy","sell"]){
    const g=f[dir]; let items, setup, stats=null, start=p;
    if(rc.strategy==="candle"){
      if(g.pats.length) start=Math.min(...g.pats.map(z=>z.start));
      stats=ST.R1[dir];
      items=[
        {k:"Contexto", ok:g.loc, d:g.loc? g.ctx.join(" · ") : (dir==="buy"?"Preço fora de suporte, MM ou recuo de tendência":"Preço fora de resistência, MM ou correção de tendência")},
        {k:"Sinal", ok:g.pat, d:g.pat? g.pats.map(z=>z.name+(z.kind==="rev"?" após "+(dir==="buy"?"queda":"alta"):" a favor da tendência")).join(" · ")+" · acerto histórico "+pctTxt(post(stats))+" em "+stats.n : "Nenhum padrão coerente com o movimento prévio"}
      ];
      setup=g.pats.map(z=>z.name).join(" + ")||"—";
    } else if(rc.strategy==="pa"){
      stats=ST.R2[dir];
      items=[
        {k:"Contexto", ok:!!g.pa, d:g.pa? g.pa.ctx : "Sem nível de estrutura no preço"},
        {k:"Sinal", ok:g.rej, d:g.rej? "Vela de rejeição "+(dir==="buy"?"compradora (fechou no terço superior)":"vendedora (fechou no terço inferior)")+(g.pats.length?" · "+g.pats.map(z=>z.name).join(", "):"")+(g.pa?" · acerto histórico "+pctTxt(post(stats))+" em "+stats.n:"") : "Sem rejeição clara no nível"}
      ];
      setup=g.pa? g.pa.label : "—";
    } else {
      const be=breakEven(payOf(sym,rc));
      const fired=RULES.filter(r=>g.R[r.id]).map(r=>({r, s:ST[r.id][dir]})).filter(x=>x.s.n>=20).sort((a,b)=>wilson(b.s)-wilson(a.s));
      const top=fired[0];
      const edge = top && wilson(top.s)>=be;
      stats = top? top.s : null;
      const ctxTxt=[g.tr?(dir==="buy"?"acima da MM200":"abaixo da MM200"):null, g.sl?(dir==="buy"?"MM20 subindo":"MM20 caindo"):null, g.loc?g.ctx[0]:null].filter(Boolean);
      items=[
        {k:"Contexto", ok:g.loc||(g.tr&&g.sl), d: ctxTxt.length? ctxTxt.join(" · ") : "Sem tendência nem região a favor"},
        {k:"Sinal", ok:!!edge, d: top? "Melhor leitura: "+top.r.name+" · acerto histórico "+pctTxt(post(top.s))+" em "+top.s.n+" casos (mínimo provável "+pctTxt(wilson(top.s))+") · equilíbrio com payout "+payOf(sym,rc)+"%: "+pctTxt(be)+(edge?"":" · sem vantagem estatística") : "Nenhuma leitura ativa com amostra suficiente (mín. 20 casos)"}
      ];
      setup = top? top.r.name : "—";
      A.probTop = A.probTop||{}; A.probTop[dir]=top;
    }
    const inv=invalidation(P,dir,start,p,ci), cf=confItem(P,p,ci,dir), rk=riskItem(sym,rc);
    items.push({k:"Confirmação", ok:cf.ok, d:cf.d}, {k:"Invalidação", ok:inv.ok, d:inv.d}, {k:"Risco", ok:rk.ok, d:rk.d});
    const okN=items.filter(i=>i.ok===true).length;
    const cand={dir,items,setup,stats,inv,stake:rk.stake,score:okN+(items[0].ok&&items[1].ok?1:0)+(stats?post(stats)/10:0)};
    if(!best||cand.score>best.score) best=cand;
  }
  const it=best.items;
  best.signal = it.every(i=>i.ok===true);
  best.opportunity = ci==null && it[0].ok && it[1].ok && it[3].ok && it[4].ok;
  return best;
}
function analyze(sym, candles, rc){
  if(candles.length<240) return null;
  const n=candles.length;
  if(rc.strategy==="overlay"){ const P=prep(candles), O=ovCalc(candles,rc.ov), A={P,O}; A.OS=ovStats(P,O,rc.expiry); A.conf=ovEval(A,sym,n-1,true,rc); A.pend=ovEval(A,sym,n-1,false,rc); return A; }
  if(rc.strategy==="zigzag"){ const P=prep(candles), A={P, ZS:zzStats(P,rc.market,rc.expiry)}; A.conf=zzEval(A,sym,n-2,n-1,rc); A.pend=zzEval(A,sym,n-1,null,rc); return A; }
  const P=prep(candles), F=buildFeat(P), ST=buildStats(P,F,rc.expiry);
  const A={P,F,ST};
  A.conf = evalStrategy(A,sym,n-2,n-1,rc);
  A.pend = evalStrategy(A,sym,n-1,null,rc);
  return A;
}

/* ============ ZigZag: alternância de velas ============
   Padrão: duas ou mais velas da mesma cor (T) → surge uma vela contrária (p) → a vela seguinte (ci) volta à cor T
   → entrada na próxima vela, na direção da vela contrária (a alternância continua).
   Ex.: vermelha, vermelha, VERDE, vermelha → COMPRA na vela seguinte. Verde, verde, VERMELHA, verde → VENDA. */
const colorOf = x => x.c>x.o?1 : x.c<x.o?-1 : 0;
const ZZ_COR = T => T===1? "verde" : "vermelha";
const ZZ_CORES = T => T===1? "verdes" : "vermelhas";
// Sequência de velas de cor T que termina em p-1 (quantas seguidas)
function zzRun(P,p){ const T=colorOf(P.c[p-1]); if(!T) return {T:0,n:0}; let n=0; for(let i=p-1;i>=0 && colorOf(P.c[i])===T;i--) n++; return {T,n}; }
function zzSetup(P,p){
  const r=zzRun(P,p); if(!r.T || r.n<2) return null;
  return {T:r.T, n:r.n, contra: colorOf(P.c[p])===-r.T};
}
const zzConf = (P,p,ci,T) => colorOf(P.c[ci])===T;
function zzStats(P,market,E){
  const n=P.c.length, s={w:0,n:0};
  for(let t=12;t+1+E<=n-1;t++){
    const p=t-1, z=zzSetup(P,p); if(!z||!z.contra||!zzConf(P,p,t,z.T)) continue;
    // entrada na vela t+1, na direção da vela contrária
    const ent=P.c[t].c, fin=P.c[t+E].c; if(fin===ent) continue;
    s.n++; if(z.T===1? fin<ent : fin>ent) s.w++;
  }
  return s;
}
function zzEval(A,sym,p,ci,rc){
  const P=A.P, z=zzSetup(P,p), x=P.c[p];
  const run=zzRun(P,p), T = z? z.T : (run.T||1), dir = T===1? "sell" : "buy";
  const items=[
    {k:"Contexto", ok:!!z, d: z? z.n+" velas "+ZZ_CORES(T)+" seguidas antes da alternância" : (run.n===1? "Só 1 vela "+ZZ_COR(run.T)+" antes: são necessárias 2 ou mais da mesma cor" : "Sem sequência de 2 ou mais velas da mesma cor")},
    {k:"Sinal", ok:!!(z&&z.contra), d: z&&z.contra? "Surgiu uma vela "+ZZ_COR(-T)+" depois das "+ZZ_CORES(T)+" · acerto histórico do padrão "+pctTxt(post(A.ZS))+" em "+A.ZS.n+" casos" : "Ainda não surgiu a vela "+ZZ_COR(-T)+" contrária"}
  ];
  let conf;
  if(ci==null) conf={ok:null, d:"Aguardando a próxima vela fechar "+ZZ_COR(T)+" para confirmar a alternância"};
  else { const ok=!!z && zzConf(P,p,ci,z.T); conf={ok, d: ok? "A vela seguinte fechou "+ZZ_COR(T)+": alternância confirmada, entrada de "+(dir==="buy"?"COMPRA":"VENDA")+" na próxima vela" : "A vela seguinte não fechou "+ZZ_COR(T)+": alternância quebrada"}; }
  const last = ci==null? p : ci, a=P.atr[last];
  const inv={ok:true, d:"Velas da alternância com "+((x.h-x.l)/a).toFixed(1)+"× ATR de amplitude; a leitura perde validade se a sequência de cores quebrar"};
  const rk=riskItem(sym,rc);
  items.push({k:"Confirmação", ok:conf.ok, d:conf.d}, {k:"Invalidação", ok:inv.ok, d:inv.d}, {k:"Risco", ok:rk.ok, d:rk.d});
  const best={dir, items, setup:"ZigZag: "+(z?z.n:2)+" "+ZZ_CORES(T)+" + "+ZZ_COR(-T), stats:A.ZS, inv, stake:rk.stake};
  best.signal = items.every(i=>i.ok===true);
  best.opportunity = ci==null && items[0].ok && items[1].ok && items[4].ok;
  return best;
}

/* ============ Overlay: indicador MElhor (toque no Suporte/Resistência Macro) ============ */
function smaArr(a,p){ const out=new Array(a.length).fill(null); let s=0; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=p) s-=a[i-p]; if(i>=p-1) out[i]=s/p; } return out; }
// Mesmo cálculo do script: highest/lowest(period_sr), equilíbrio 50%, sma(close, period_trend), canal = sma(high-low, period_trend) * desvio
function ovCalc(c, o){
  o=o||OV_DEF; const n=c.length, res=new Array(n).fill(null), sup=new Array(n).fill(null), mid=new Array(n).fill(null), sig=new Array(n).fill(null);
  for(let i=o.sr-1;i<n;i++){ let h=-Infinity, l=Infinity; for(let j=i-o.sr+1;j<=i;j++){ if(c[j].h>h) h=c[j].h; if(c[j].l<l) l=c[j].l; } res[i]=h; sup[i]=l; mid[i]=(h+l)/2; }
  const tb=smaArr(c.map(k=>k.c),o.trend), dr=smaArr(c.map(k=>k.h-k.l),o.trend);
  const up=tb.map((v,i)=>v==null||dr[i]==null? null : v+dr[i]*o.mult), lo=tb.map((v,i)=>v==null||dr[i]==null? null : v-dr[i]*o.mult);
  for(let i=1;i<n;i++){
    if(res[i-1]==null) continue;
    // VENDA: vela verde tocou a Resistência Macro do candle anterior; COMPRA: vela tocou o Suporte Macro do candle anterior
    const sell = c[i].h>=res[i-1] && c[i].c>c[i].o, buy = c[i].l<=sup[i-1];
    sig[i] = sell? "sell" : buy? "buy" : null;
  }
  return {res, sup, mid, tb, up, lo, sig};
}
function ovStats(P,O,E){
  const n=P.c.length, s={buy:{w:0,n:0}, sell:{w:0,n:0}, all:{w:0,n:0}};
  for(let t=60;t+E<=n-1;t++){
    const d=O.sig[t]; if(!d) continue;
    const ent=P.c[t].c, fin=P.c[t+E].c; if(fin===ent) continue;
    const win = d==="buy"? fin>ent : fin<ent;
    s[d].n++; s.all.n++; if(win){ s[d].w++; s.all.w++; }
  }
  return s;
}
// confirmed=true: avalia a vela t já fechada (toque confirmado → entrada na próxima vela)
// confirmed=false: avalia se a próxima vela pode tocar o nível (preço perto do S/R) → alerta de oportunidade
function ovEval(A,sym,t,confirmed,rc){
  const P=A.P, O=A.O, c=P.c, x=c[t], a=P.atr[t], o=rc.ov||OV_DEF;
  if(O.res[t]==null || O.tb[t]==null) return null;
  const slope = O.tb[t]-(O.tb[t-1]??O.tb[t]), guide = slope>=0? "Linha guia subindo (LTA)" : "Linha guia caindo (LTB)";
  const chan = x.c>=O.up[t]? "acima do canal (sobrecompra)" : x.c<=O.lo[t]? "abaixo do canal (sobrevenda)" : "dentro do canal";
  let dir, items;
  const rk=riskItem(sym,rc);
  if(confirmed){
    const sg=O.sig[t]; dir = sg || (Math.abs(x.h-O.res[t-1])<Math.abs(x.l-O.sup[t-1])? "sell" : "buy");
    const lvl = dir==="sell"? O.res[t-1] : O.sup[t-1], st=A.OS[dir];
    const touched = dir==="sell"? x.h>=lvl : x.l<=lvl;
    items=[
      {k:"Contexto", ok:touched, d: touched? "Vela tocou "+(dir==="sell"?"a Resistência Macro":"o Suporte Macro")+" ("+fmt(lvl)+", "+o.sr+" períodos) · "+guide+" · preço "+chan : "Preço longe do Suporte e da Resistência Macro · "+guide},
      {k:"Sinal", ok:!!sg, d: sg? (sg==="sell"? "Seta de VENDA: vela verde na Resistência Macro" : "Seta de COMPRA: toque no Suporte Macro")+" · acerto histórico "+pctTxt(post(st))+" em "+st.n+" toques" : (dir==="sell"&&touched? "Tocou a resistência, mas a vela não fechou verde (o indicador exige vela verde para venda)" : "Sem toque no nível")},
      {k:"Confirmação", ok:!!sg, d: sg? "Vela do toque fechada: entrada na vela seguinte" : "Nenhuma vela de toque fechada"},
      {k:"Invalidação", ok:true, d:"Equilíbrio (50%) em "+fmt(O.mid[t])+" · canal entre "+fmt(O.lo[t])+" e "+fmt(O.up[t])},
      {k:"Risco", ok:rk.ok, d:rk.d}
    ];
    const best={dir, items, setup:(dir==="sell"?"Toque na Resistência Macro":"Toque no Suporte Macro"), stats:st, stake:rk.stake};
    best.signal = !!sg && rk.ok; best.opportunity=false; return best;
  }
  // próxima vela: o nível que ela precisa tocar é o S/R calculado até a vela t
  const dR=O.res[t]-x.c, dS=x.c-O.sup[t]; dir = dR<=dS? "sell" : "buy";
  const lvl = dir==="sell"? O.res[t] : O.sup[t], dist = Math.abs(dir==="sell"? dR : dS), near = dist<=0.35*a, st=A.OS[dir];
  items=[
    {k:"Contexto", ok:near, d: (near? "Preço perto " : "Preço a "+(dist/a).toFixed(1)+"× ATR ")+(dir==="sell"?"da Resistência Macro":"do Suporte Macro")+" ("+fmt(lvl)+") · "+guide+" · preço "+chan},
    {k:"Sinal", ok:null, d:"Aguardando a vela tocar "+(dir==="sell"?"a resistência e fechar verde":"o suporte")+" · acerto histórico "+pctTxt(post(st))+" em "+st.n+" toques"},
    {k:"Confirmação", ok:null, d:"A entrada é indicada no fechamento da vela que tocar o nível"},
    {k:"Invalidação", ok:true, d:"Equilíbrio (50%) em "+fmt(O.mid[t])+" · canal entre "+fmt(O.lo[t])+" e "+fmt(O.up[t])},
    {k:"Risco", ok:rk.ok, d:rk.d}
  ];
  const best={dir, items, setup:"Overlay", stats:st, stake:rk.stake};
  best.signal=false; best.opportunity = near && rk.ok; return best;
}

/* ============ Motor em execução ============ */
let mode=null, notice=null;
const DATA = {};
let RB = [], HIST = [], LOG = [], logId = 0, onEvent = ()=>{}, onChange = ()=>{};
const activePairs = R => R.rc.pairs.filter(s=>payOf(s,R.rc)>=R.rc.minPayout);
const tfPairs = tf => Array.from(new Set(cfg.robots.filter(r=>r.tf===tf).flatMap(r=>r.pairs)));
const allPairs = () => Array.from(new Set(cfg.robots.flatMap(r=>r.pairs)));
const RESULT_MS = 8000; // tempo em que o WIN/LOSS fica na tela antes de o robô voltar a analisar
const neededTfs = () => Array.from(new Set(cfg.robots.map(r=>r.tf)));
const fastDemo = () => mode==="demo" && (DEMO_FORCED || cfg.demoSpeed==="fast");
const speed = tf => fastDemo()? TF[tf]/DEMO_MS : 1;
function mNow(tf){ const D=DATA[tf]; if(!fastDemo()||!D) return Date.now(); return D.base + (Date.now()-D.real)*speed(tf); }
const realLeft = (tf, marketT) => (marketT - mNow(tf))/speed(tf)/1000;
const DIRTXT = d => d==="buy"?"COMPRA":"VENDA";
const hm = t => { try{ return new Date(t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:cfg.tz||undefined}); }catch(e){ const d=new Date(t); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); } };

function emit(kind, R, extra){
  const ev=Object.assign({id:++logId, t:Date.now(), kind, robot:R?R.i:null}, extra||{});
  LOG.unshift(ev); if(LOG.length>300) LOG.length=300;
  try{ onEvent(ev); }catch(e){}
  onChange();
}

function newForming(d, t){ const pl=d.sim.next(t); d.plan=pl; d.fh=0.1+d.sim.r()*0.75; d.fl=0.1+d.sim.r()*0.75; d.hitH=false; d.hitL=false; d.dev=0; d.forming={t,o:pl.o,h:pl.o,l:pl.o,c:pl.o}; }
function stepForming(d, frac){
  const pl=d.plan, f=d.forming, R=(pl.h-pl.l)||1e-9;
  d.dev = d.dev*0.8 + d.sim.g()*R*0.12*Math.sqrt(Math.max(0,1-frac));
  let p = pl.o+(pl.c-pl.o)*frac + d.dev;
  if(frac>=d.fh && !d.hitH){ p=pl.h; d.hitH=true; } else if(frac>=d.fl && !d.hitL){ p=pl.l; d.hitL=true; }
  p=Math.min(pl.h,Math.max(pl.l,p)); f.c=p; f.h=Math.max(f.h,p); f.l=Math.min(f.l,p);
}
async function loadTf(tf){
  const D={syms:{}, next:0, tries:0, busy:false}; DATA[tf]=D;
  const syms=tfPairs(tf);
  if(mode==="iq"){
    const now=Date.now();
    for(const s of syms){ try{ const v=await iqCandles(s,tf,500); D.syms[s]={candles:v.filter(k=>k.t+TF[tf]<=now), forming:v.find(k=>k.t+TF[tf]>now)||null}; }catch(e){ D.syms[s]={candles:[], forming:null, err:e.message}; } }
    return;
  }
  if(mode==="mt"){
    let res={}; if(cfg.apiKey){ try{ res=await tdSeries(syms,tf,800); }catch(e){ res={}; } }
    const now=Date.now(); for(const s of syms){ const v=res[s]; D.syms[s]={candles: v&&!v.err? v.filter(k=>k.t+TF[tf]<=now) : [], forming:null}; }
    return;
  }
  if(mode==="demo"){
    const now=Date.now(); D.base=Math.floor(now/TF[tf])*TF[tf]; D.real=now;
    for(const s of syms){ const d={candles:[], sim:makeSim(s,tf)}; for(let i=800;i>=1;i--) d.candles.push(d.sim.next(D.base-i*TF[tf])); newForming(d,D.base); D.syms[s]=d; }
  } else {
    const res=await tdSeries(syms,tf,800), now=Date.now();
    for(const s of syms){ const v=res[s]; if(!v||v.err){ D.syms[s]={candles:[],err:(v&&v.err)||"Sem dados"}; continue; }
      D.syms[s]={candles:v.filter(k=>k.t+TF[tf]<=now), forming:v.find(k=>k.t+TF[tf]>now)||null}; }
    D.next=(Math.floor(now/TF[tf])+1)*TF[tf]+4000;
  }
}
function stepDemo(tf){
  const D=DATA[tf]; if(!D) return; const mt=mNow(tf); let closed=false;
  for(const s of Object.keys(D.syms)){
    const d=D.syms[s]; if(!d.forming) continue;
    while(mt>=d.forming.t+TF[tf]){ d.candles.push(d.plan); if(d.candles.length>800) d.candles.shift(); newForming(d,d.forming.t+TF[tf]); closed=true; }
    stepForming(d,(mt-d.forming.t)/TF[tf]);
  }
  if(closed) onClose(tf);
}
async function fetchLive(tf){
  const D=DATA[tf]; if(!D||D.busy) return; D.busy=true;
  try{
    const ok=Object.keys(D.syms).filter(s=>!D.syms[s].err); if(!ok.length) return;
    const res=await tdSeries(ok,tf,3), now=Date.now(); let added=false;
    for(const s of ok){ const v=res[s]; if(!v||v.err) continue; const d=D.syms[s];
      for(const k of v){ if(k.t+TF[tf]<=now){ if(!d.candles.length||k.t>d.candles[d.candles.length-1].t){ d.candles.push(k); if(d.candles.length>800) d.candles.shift(); added=true; } } else d.forming=k; } }
    const nb=(Math.floor(now/TF[tf])+1)*TF[tf]+4000;
    if(added){ D.tries=0; D.next=nb; onClose(tf); } else { D.tries++; D.next = D.tries<4? now+10000 : nb; }
  }catch(e){ D.next=Date.now()+15000; if(e.global) emit("error",null,{text:"Twelve Data: "+e.message}); }
  finally{ D.busy=false; }
}
async function currentPrice(tf, sym){
  const d=DATA[tf]&&DATA[tf].syms[sym]; if(!d) return null;
  if(mode==="demo"||mode==="mt"||mode==="iq") return d.forming? d.forming.c : null;
  try{ const p=await tdPrice(sym); if(d.forming) d.forming.c=p; return p; }catch(e){ return d.forming? d.forming.c : (d.candles.length? d.candles[d.candles.length-1].c : null); }
}

/* ============ Robôs ============ */
function makeRobots(running){ RB = cfg.robots.map((rc,i)=>({i, rc, running:!!(running&&running[i]), op:null, pend:null, result:null, flash:null, ana:{}, alertedT:{}})); }
function analyzeRobot(R){
  const D=DATA[R.rc.tf]; R.ana={}; if(!D) return;
  for(const s of activePairs(R)){ const d=D.syms[s]; if(d&&d.candles.length) R.ana[s]=analyze(s,d.candles,R.rc); }
}
function onClose(tf){
  for(const R of RB){ if(R.rc.tf!==tf) continue; analyzeRobot(R); if(R.running) robotStep(R); }
  onChange();
}
const rank = A => A.stats? post(A.stats) : 0.5;
function robotStep(R){
  const tf=R.rc.tf, D=DATA[tf]; if(!D) return;
  if(R.op){ settle(R); if(R.op) return; }
  const fresh = s => { const d=D.syms[s]; if(!d||!d.candles.length) return false; const lt=d.candles[d.candles.length-1].t; return (mNow(tf)-(lt+TF[tf]))/speed(tf) < 20000; };
  const lastT = s => { const c=D.syms[s].candles; return c[c.length-1].t; };
  let best=null;
  for(const s of Object.keys(R.ana)){ const A=R.ana[s]; if(A&&A.conf&&A.conf.signal&&fresh(s)){ const sc=rank(A.conf)+(R.pend&&R.pend.sym===s?1:0); if(!best||sc>best.sc) best={s,A,sc}; } }
  if(best){ startOp(R,best.s,best.A); return; }
  if(R.pend){ const s=R.pend.sym; if(D.syms[s] && lastT(s)!==R.pend.t){ R.flash={sym:s, at:Date.now()}; emit("skip",R,{sym:s, text:s+": a vela não confirmou, entrada descartada"}); R.pend=null; } }
  let bp=null;
  for(const s of Object.keys(R.ana)){ const A=R.ana[s]; if(A&&A.pend&&A.pend.opportunity&&fresh(s)){ const sc=rank(A.pend); if(!bp||sc>bp.sc) bp={s,A,sc}; } }
  if(bp){ const lt=lastT(bp.s); if(R.alertedT[bp.s]!==lt){ R.alertedT[bp.s]=lt; R.pend={sym:bp.s, t:lt, items:bp.A.pend.items, dir:bp.A.pend.dir}; R.flash=null; emit("alert",R,{sym:bp.s, text:"Oportunidade em "+bp.s+": aguardando a confirmação da vela"}); } }
}
function startOp(R, sym, A){
  const tf=R.rc.tf, c=DATA[tf].syms[sym].candles, last=c[c.length-1], r=A.conf, E=R.rc.expiry;
  const h={id:Date.now()+"-"+R.i, robot:R.i, sym, dir:r.dir, t:last.t+TF[tf], at:Date.now(), tf, setup:r.setup, strategy:R.rc.strategy, result:null, gale:0};
  HIST.unshift(h); if(HIST.length>500) HIST.length=500;
  R.op={sym, dir:r.dir, entryT:last.t+TF[tf], endT:last.t+TF[tf]+E*TF[tf], entry:last.c, price:last.c, stake:r.stake, gale:0, items:r.items, setup:r.setup, stats:r.stats, alert:null, w10:false, w3:false, h};
  R.pend=null; R.flash=null;
  emit("signal",R,{sym, dir:r.dir, text:DIRTXT(r.dir)+" em "+sym+" · vela "+MT[tf]+" das "+hm(last.t+TF[tf])+" (expira às "+hm(last.t+2*TF[tf])+")"+" · "+money(r.stake)+" · "+r.setup});
}
function settle(R){
  const op=R.op, tf=R.rc.tf, d=DATA[tf].syms[op.sym]; if(!d) return;
  const fin=d.candles.find(k=>k.t===op.endT-TF[tf]); if(!fin) return;
  const close=fin.c, win = op.dir==="buy"? close>op.entry : close<op.entry, draw = close===op.entry;
  if(win||draw){ finish(R, win?"win":"draw"); return; }
  if(op.gale < R.rc.gale){
    op.gale++; op.h.gale=op.gale; op.stake*=2; op.entry=close; op.price=close;
    op.entryT=op.endT; op.endT=op.entryT+R.rc.expiry*TF[tf]; op.w10=op.w3=false; op.alert="galeOn";
    emit("galeOn",R,{sym:op.sym, dir:op.dir, text:"Gale "+op.gale+" em andamento: "+DIRTXT(op.dir)+" em "+op.sym+" com "+money(op.stake)}); return;
  }
  finish(R,"loss");
}
function finish(R, kind){
  const op=R.op; op.h.result=kind;
  R.result={kind, sym:op.sym, dir:op.dir, gale:op.gale, at:Date.now(), id:op.h.id}; R.op=null;
  emit(kind,R,{sym:op.sym, dir:op.dir, gale:op.gale, text:(kind==="win"?"WIN 🤑":kind==="loss"?"LOSS 😢":"EMPATE")+" · "+DIRTXT(op.dir)+" em "+op.sym+(op.gale?" (gale "+op.gale+")":"")});
}
const losing = (op,p) => op.dir==="buy"? p<=op.entry : p>=op.entry;
function checkOp(R){
  const op=R.op, tf=R.rc.tf; if(!op) return;
  if(mode==="demo"){ const d=DATA[tf].syms[op.sym]; if(d&&d.forming&&mNow(tf)>=op.entryT) op.price=d.forming.c; }
  const left=realLeft(tf, op.endT);
  if(left<=10 && !op.w10){ op.w10=true; currentPrice(tf,op.sym).then(p=>{ if(R.op!==op||p==null) return; op.price=p;
      if(losing(op,p)){ op.alert="att"; emit("att",R,{sym:op.sym, dir:op.dir, text:"Atenção para o gale: faltam 10 s e "+op.sym+" está contra a indicação"}); }
      else if(op.alert==="galeOn"){ op.alert=null; onChange(); } }); }
  if(left<=3 && !op.w3){ op.w3=true; currentPrice(tf,op.sym).then(p=>{ if(R.op!==op||p==null) return; op.price=p;
      if(losing(op,p)){ if(op.gale<R.rc.gale){ op.alert="gale"; emit("gale",R,{sym:op.sym, dir:op.dir, text:"GALE "+(op.gale+1)+": entre de novo em "+DIRTXT(op.dir)+" em "+op.sym+" na próxima vela com "+money(op.stake*2)}); } else { op.alert="risk"; onChange(); } }
      else if(op.alert==="att"||op.alert==="galeOn"){ op.alert="ok"; onChange(); } }); }
}

/* ============ Ciclo ============ */
/* MetaTrader: cotações (bid) a cada 2 s viram velas alinhadas ao relógio, como no gráfico do MT */
let mtBusy=false, mtNext=0, mtErrAt=0;
async function pollMT(){
  if(mtBusy || Date.now()<mtNext) return; mtBusy=true; mtNext=Date.now()+2000;
  try{
    const syms=allPairs(), closed=new Set();
    const res=await Promise.all(syms.map(s=>mtQuote(s).then(p=>[s,p],e=>[s,null,e])));
    const now=Date.now();
    for(const [s,p,e] of res){
      if(p==null){ if(now-mtErrAt>60000){ mtErrAt=now; emit("error",null,{text:"MetaTrader: "+mtSym(s)+": "+(e&&e.message||"erro")}); } continue; }
      for(const tf of neededTfs()){ const d=DATA[tf]&&DATA[tf].syms[s]; if(!d) continue; d.err=null;
        const t=Math.floor(now/TF[tf])*TF[tf], f=d.forming;
        if(!f){ d.forming={t,o:p,h:p,l:p,c:p}; continue; }
        if(f.t<t){ d.candles.push(f); if(d.candles.length>800) d.candles.shift(); d.forming={t,o:p,h:p,l:p,c:p}; closed.add(tf); }
        else { f.c=p; if(p>f.h) f.h=p; if(p<f.l) f.l=p; } }
    }
    closed.forEach(tf=>onClose(tf));
  }finally{ mtBusy=false; }
}
/* Catálogo da IQ Option: os mesmos ativos de opções binárias/turbo da corretora, com status e payout */
async function loadIQCatalog(){
  const j=await iqGet("/assets"); const A=Array.isArray(j.assets)? j.assets : [];
  IQCAT=A.map(a=>[a.name, a.cat, !!a.open, a.payout&&a.payout.turbo||null, a.payout&&a.payout.binary||null]);
  IQPAY={}; for(const a of A) IQPAY[a.name]=a.payout||{}; iqPayAt=Date.now();
}
// Ao ligar a IQ Option, os ativos dos robôs passam a ser os nomes da própria IQ (EURUSD, EURUSD-OTC, BTCUSD, APPLE…)
function adoptIQAssets(){
  if(!IQCAT||!IQCAT.length) return;
  const names=new Set(IQCAT.map(a=>a[0])), open=IQCAT.filter(a=>a[2]);
  cfg.robots.forEach(r=>{
    let p=Array.from(new Set(r.pairs.map(iqName))).filter(n=>names.has(n));
    if(!p.length) p=open.filter(a=>a[1]==="forex"||a[1]==="otc").slice(0,6).map(a=>a[0]);
    r.pairs=p; r.known=[];
  });
}
/* IQ Option: velas prontas da corretora (inclui OTC); a última é a vela em formação */
let iqBusy=false, iqNext=0, iqErrAt=0, iqPayAt=0;
async function pollIQ(){
  if(iqBusy || Date.now()<iqNext) return; iqBusy=true; iqNext=Date.now()+2500;
  try{
    for(const tf of neededTfs()){
      const D=DATA[tf]; if(!D) continue; let added=false;
      for(const s of Object.keys(D.syms)){
        let v; try{ v=await iqCandles(s,tf,3); }catch(e){ if(Date.now()-iqErrAt>60000){ iqErrAt=Date.now(); emit("error",null,{text:"IQ Option: "+s+": "+e.message}); } continue; }
        const d=D.syms[s], now=Date.now(); d.err=null;
        for(const k of v){ if(k.t+TF[tf]<=now){ if(!d.candles.length||k.t>d.candles[d.candles.length-1].t){ d.candles.push(k); if(d.candles.length>800) d.candles.shift(); added=true; } } else d.forming=k; }
      }
      if(added) onClose(tf);
    }
    if(Date.now()-iqPayAt>300000){ iqPayAt=Date.now(); try{ await loadIQCatalog(); onChange(); }catch(e){} }
  }finally{ iqBusy=false; }
}
function tick(){
  if(mode==="mt") pollMT();
  if(mode==="iq") pollIQ();
  for(const tf of neededTfs()){ if(!DATA[tf]) continue; if(mode==="demo") stepDemo(tf); else if(mode==="live" && Date.now()>=DATA[tf].next) fetchLive(tf); }
  for(const R of RB) if(R.running&&R.op) checkOp(R);
}
async function init(opts){
  mode=null; notice=null; IQPAY=null; IQCAT=null;
  if(cfg.source==="demo"){ mode="demo"; notice=["Modo simulação. ", fastDemo()? "Dados simulados acelerados para treino: cada vela dura "+Math.round(DEMO_MS/1000)+" segundos." : "Dados simulados em tempo real: as velas abrem e fecham no relógio, como no MetaTrader (M5 fecha em :00, :05, :10…)."]; }
  else if(cfg.source==="iq"){
    if(!IQO){ mode="demo"; notice=["IQ Option indisponível aqui. ","A conexão com a IQ Option funciona só no servidor na nuvem, com as variáveis IQ_EMAIL e IQ_PASSWORD. Enquanto isso, os robôs rodam em simulação."]; }
    else {
      let h=null; for(let k=0;k<15;k++){ try{ h=await iqGet("/health"); if(h.connected) break; }catch(e){ h={reason:"a ponte Python ainda não respondeu"}; } await new Promise(r=>setTimeout(r,2000)); }
      if(h&&h.connected){ mode="iq"; try{ await loadIQCatalog(); adoptIQAssets(); }catch(e){} notice=["IQ Option conectada. ","Velas"+(cfg.iqOtc?" OTC":"")+" e payout direto da sua conta (modo PRÁTICA). O robô só lê os dados e nunca envia ordens."]; }
      else { mode="demo"; notice=["A IQ Option não conectou. ",((h&&h.reason)||"sem resposta")+". Rodando em simulação."]; }
    }
  }
  else if(cfg.source==="mt"){
    if(!MTO){ mode="demo"; notice=["MetaTrader indisponível aqui. ","A conexão com o MetaTrader (API2Trade) funciona só no servidor na nuvem, com as variáveis API2TRADE_API_KEY e API2TRADE_ACCOUNT_ID. Enquanto isso, os robôs rodam em simulação."]; }
    else { try{ await mtQuote(allPairs()[0]||"EUR/USD"); mode="mt"; notice=["MetaTrader conectado. ", cfg.apiKey? "Cotações ao vivo da sua conta MT via API2Trade; o histórico inicial vem da Twelve Data." : "Cotações ao vivo da sua conta MT via API2Trade. Sem histórico inicial: os robôs começam a analisar depois de 240 velas (cole a chave da Twelve Data para carregar o histórico na hora)."]; }
      catch(e){ mode="demo"; notice=["O MetaTrader não respondeu. ", e.message+". Confira a chave, a conta e o sufixo dos símbolos. Rodando em simulação."]; } }
  }
  else if(!cfg.apiKey){ mode="demo"; notice=["Falta a chave da Twelve Data. ","Para analisar os ativos ao vivo, abra Configurações e cole sua chave gratuita. Enquanto isso, os robôs rodam em simulação."]; }
  else {
    try{ await tdSeries([allPairs()[0]||"EUR/USD"],"1m",2); mode="live"; }
    catch(e){ mode="demo"; notice = e.global? ["A Twelve Data recusou a chave. ", e.message+" Rodando em simulação até a chave ser corrigida."] : ["Sem acesso à internet nesta janela. ","Esta visualização bloqueia conexões externas. Para dados ao vivo, instale o app (ou use o servidor na nuvem). Aqui os robôs rodam em simulação."]; }
  }
  if(mode!=="iq"){ const back={APPLE:"AAPL",AMAZON:"AMZN",GOOGLE:"GOOGL",FACEBOOK:"META",TESLA:"TSLA","NFLX:US":"NFLX"};
    cfg.robots.forEach(r=>{ r.pairs=Array.from(new Set(r.pairs.map(s=>{ const b=s.replace(/-OTC$/,""); return back[b]||(/^[A-Z]{6}$/.test(b)&&!/USDT$/.test(b)&&classOf(b.slice(0,3)+"/"+b.slice(3))!=="crypto"&&!CRYPTO_CODES.includes(b.slice(0,3))? b.slice(0,3)+"/"+b.slice(3) : /^[A-Z]{3,5}USD$/.test(b)&&CRYPTO_CODES.includes(b.slice(0,-3))? b.slice(0,-3)+"/USD" : b); }))); }); }
  for(const k of Object.keys(DATA)) delete DATA[k];
  try{ for(const tf of neededTfs()) await loadTf(tf); }
  catch(e){ mode="demo"; notice=["Não foi possível carregar os dados ao vivo. ",(e.message||"")+" Rodando em simulação."]; for(const k of Object.keys(DATA)) delete DATA[k]; for(const tf of neededTfs()) await loadTf(tf); }
  RB.forEach(analyzeRobot);
  for(const R of RB) if(R.running){ R.alertedT={}; robotStep(R); }
  onChange();
}

/* ============ Visão (o que a interface mostra) ============ */
function stateOf(R){
  const now=Date.now();
  if(R.result && !R.op && !R.pend && now-R.result.at<RESULT_MS) return "result";
  if(R.op) return "op";
  if(R.pend) return "pend";
  if(R.flash && now-R.flash.at<7000) return "skip";
  return R.running? "scan" : "stopped";
}
function robotView(R){
  const rc=R.rc, tf=rc.tf, st=stateOf(R), v={i:R.i, rc, running:R.running, state:st, active:activePairs(R).length};
  const h=HIST.filter(x=>x.robot===R.i&&x.result);
  v.w=h.filter(x=>x.result==="win").length; v.l=h.filter(x=>x.result==="loss").length;
  if(DATA[tf]){ const nb=(Math.floor(mNow(tf)/TF[tf])+1)*TF[tf]; v.nextIn=realLeft(tf,nb); }
  if(R.result && Date.now()-R.result.at<RESULT_MS){ v.result={kind:R.result.kind, sym:R.result.sym, dir:R.result.dir, gale:R.result.gale, id:R.result.id, age:(Date.now()-R.result.at)/1000}; }
  if(R.flash) v.flash={sym:R.flash.sym, id:R.flash.at};
  if(R.pend){ const ct=R.pend.t+2*TF[tf]; v.pend={sym:R.pend.sym, t:R.pend.t, confT:R.pend.t+TF[tf], left:realLeft(tf,ct), total:TF[tf]/speed(tf)/1000}; }
  if(R.op){ const op=R.op, started=mNow(tf)>=op.entryT;
    v.op={sym:op.sym, dir:op.dir, entry:op.entry, entryTxt:fmt(op.entry), price:op.price, priceTxt:fmt(op.price), stake:op.stake, stakeTxt:money(op.stake), gale:op.gale, alert:op.alert, setup:op.setup,
      statsTxt: op.stats? pctTxt(post(op.stats)) : null, started, left: started? realLeft(tf,op.endT) : realLeft(tf,op.entryT), total:(op.endT-op.entryT)/speed(tf)/1000,
      losing: started && op.price!==op.entry && losing(op,op.price), nextStakeTxt:money(op.stake*2), key:op.h.id+"-"+op.gale}; }
  let items=(R.op&&R.op.items)||(R.pend&&R.pend.items)||null, label=null;
  if(items) label=(R.op&&R.op.sym)||R.pend.sym;
  else { let best=null; for(const sy of Object.keys(R.ana)){ const A=R.ana[sy]; if(!A||!A.pend) continue; const n=A.pend.items.filter(i=>i.ok===true).length; if(!best||n>best.n) best={n,sy,A}; } if(best){ items=best.A.pend.items; label="melhor leitura agora: "+best.sy; } }
  v.check={label, items:items? items.map(i=>({k:i.k, ok:i.ok, d:i.d})) : null};
  return v;
}
const CHART_N = 300;
function chartFor(R, want){
  const tf=R.rc.tf, D=DATA[tf], pairs=R.rc.pairs;
  const sym = want && pairs.includes(want) ? want : ((R.op&&R.op.sym)||(R.pend&&R.pend.sym)||activePairs(R)[0]||pairs[0]);
  const d=D&&D.syms[sym]; if(!d) return {sym, tf, robot:R.i, candles:[], ops:[], err:null};
  const allc=d.forming? d.candles.concat([d.forming]) : d.candles, c=allc.slice(-CHART_N), off=allc.length-c.length;
  const A=R.ana[sym], P=A&&A.P;
  const ovp=R.rc.strategy==="overlay"? R.rc.ov : OV_DEF;
  let ov=null; if(allc.length>ovp.sr+2){ const O=ovCalc(allc,ovp), cut=a=>a.slice(off); ov={res:cut(O.res), sup:cut(O.sup), mid:cut(O.mid), tb:cut(O.tb), up:cut(O.up), lo:cut(O.lo), sig:cut(O.sig), p:ovp}; if(d.forming) ov.sig[ov.sig.length-1]=null; }
  let e20=null, e200=null; if(c.length){ const cl=allc.map(k=>k.c); e20=ema(cl,20).slice(off); e200=ema(cl,200).slice(off); }
  return {sym, tf, robot:R.i, pairs, err:d.err||null, candles:c.map(k=>[k.t,k.o,k.h,k.l,k.c]), forming:!!d.forming, e20, e200, ov,
    ops:RB.filter(x=>x.op&&x.op.sym===sym&&x.rc.tf===tf).map(x=>({dir:x.op.dir, entry:x.op.entry, entryT:x.op.entryT}))};
}
function snapshot(sel){
  sel=sel||{};
  const tf = sel.tf && DATA[sel.tf] ? sel.tf : cfg.robots[0].tf;
  const tp = tfPairs(tf), all=allPairs();
  const sym = sel.sym && tp.includes(sel.sym) ? sel.sym : (tp[0]||all[0]);
  const watch=all.map(s=>{
    let px=null; for(const t of neededTfs()){ const d=DATA[t]&&DATA[t].syms[s]; if(d&&(d.forming||d.candles.length)){ px=d.forming? d.forming.c : d.candles[d.candles.length-1].c; break; } }
    const st=RB.map(R=>{
      if(!R.rc.pairs.includes(s)) return {txt:"Não usa", cls:""};
      if(payOf(s,R.rc)<R.rc.minPayout) return {txt:"Fora (payout "+payOf(s,R.rc)+"%)", cls:""};
      const dd=DATA[R.rc.tf]&&DATA[R.rc.tf].syms[s];
      if(dd&&dd.err) return {txt:"Sem dados", cls:"sell"};
      if(R.op&&R.op.sym===s) return {txt:DIRTXT(R.op.dir)+" em curso", cls:R.op.dir};
      if(R.pend&&R.pend.sym===s) return {txt:"Aguardando confirmação", cls:"wait"};
      const A=R.ana[s]; if(A&&A.pend) return A.pend.opportunity? {txt:"Oportunidade", cls:"wait"} : {txt:A.pend.items[0].ok?"Contexto ok":"Sem contexto", cls:""};
      return {txt:"—", cls:""};
    });
    return {sym:s, cls:classOf(s), price:px, priceTxt:fmt(px), pays:RB.map(R=>R.rc.pairs.includes(s)? payOf(s,R.rc) : null), st};
  });
  const cs=(sel.c||[]); const charts=RB.map((R,i)=>chartFor(R, cs[i]&&cs[i].sym));
  const done=HIST.filter(h=>h.result);
  const stats={win:done.filter(h=>h.result==="win").length, winDirect:done.filter(h=>h.result==="win"&&!h.gale).length, winGale:done.filter(h=>h.result==="win"&&h.gale).length,
    gale:HIST.filter(h=>h.gale>0).length, loss:done.filter(h=>h.result==="loss").length, draw:done.filter(h=>h.result==="draw").length, total:done.length, open:HIST.length-done.length};
  const pub=JSON.parse(JSON.stringify(cfg)); pub.hasKey=!!cfg.apiKey; delete pub.apiKey;
  return {mode, notice, iqCat: mode==="iq"? IQCAT : null, cfg:pub, robots:RB.map(robotView), watch, charts, sel:{sym,tf}, tfPairs:tp, hist:HIST.slice(0,100), log:LOG.slice(0,150), stats, now:Date.now()};
}

/* ============ API pública ============ */
function createEngine(o){
  o=o||{};
  if(o.demoMs){ DEMO_MS=o.demoMs; DEMO_FORCED=true; }
  IQO = o.iq && o.iq.base ? {base:o.iq.base} : null;
  MTO = o.mt && o.mt.key && o.mt.account ? {key:o.mt.key, account:o.mt.account, base:o.mt.base||"https://api.metatraderapi.dev"} : null;
  cfg=normalizeCfg(o.cfg); HIST=Array.isArray(o.hist)? o.hist.slice(0,500) : []; LOG=Array.isArray(o.log)? o.log.slice(0,300) : [];
  logId = LOG.reduce((m,e)=>Math.max(m,e.id||0),0);
  HIST.forEach(h=>{ if(!h.result) h.result="draw"; });
  onEvent=o.onEvent||(()=>{}); onChange=o.onChange||(()=>{});
  makeRobots(o.running);
  return {
    init:()=>init(),
    tick,
    snapshot,
    start(i){ const R=RB[i]; if(!R||R.running) return; R.running=true; R.alertedT={}; R.flash=null; R.result=null; analyzeRobot(R); robotStep(R); emit("info",R,{text:R.rc.name+" iniciado ("+STRAT_NAME[R.rc.strategy]+", "+R.rc.tf+")"}); },
    stop(i){ const R=RB[i]; if(!R||!R.running) return; R.running=false; if(R.op&&!R.op.h.result){ R.op.h.result="draw"; R.op.h.setup+=" (interrompida)"; } R.op=null; R.pend=null; emit("info",R,{text:R.rc.name+" parado manualmente"}); },
    async setConfig(nc, keepKey){
      const next=normalizeCfg(nc); if(keepKey && !next.apiKey) next.apiKey=cfg.apiKey;
      const sig=()=>JSON.stringify({s:cfg.source, k:cfg.apiKey, t:neededTfs().map(tf=>[tf,tfPairs(tf)])}); const old=sig();
      const running=RB.map(R=>R.running);
      RB.forEach(R=>{ if(R.op&&!R.op.h.result){ R.op.h.result="draw"; R.op.h.setup+=" (interrompida)"; } });
      cfg=next; makeRobots(running);
      emit("info",null,{text:"Configurações atualizadas"});
      if(old!==sig()) await init();
      else { RB.forEach(analyzeRobot); RB.forEach(R=>{ if(R.running) robotStep(R); }); onChange(); }
    },
    clearHistory(){ HIST.length=0; emit("info",null,{text:"Histórico de operações zerado"}); },
    hasMT: ()=>!!MTO,
    hasIQ: ()=>!!IQO,
    persist(){ return {cfg, running:RB.map(R=>R.running), hist:HIST, log:LOG}; },
    get cfg(){ return cfg; }
  };
}
G.RadarCore = {MT, createEngine, normalizeCfg, DEFAULTS, STRAT_NAME, STRAT_DESC, TF, ALL_PAIRS, ASSETS, classOf, DEFAULT_PAY, OV_DEF, breakEven};
})(typeof globalThis!=="undefined"? globalThis : this);
