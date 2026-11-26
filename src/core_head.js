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
