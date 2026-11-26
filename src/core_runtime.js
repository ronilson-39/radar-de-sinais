
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
