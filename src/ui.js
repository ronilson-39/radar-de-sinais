(function(){
"use strict";
const C = window.RadarCore;
const {STRAT_NAME, STRAT_DESC, TF, ALL_PAIRS} = C;
const $=id=>document.getElementById(id);
function el(tag, cls, txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
const ls = { get(k,d){ try{ const v=localStorage.getItem(k); return v==null? d : JSON.parse(v); }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } } };
const UI = Object.assign({sound:true, autoFloat:true, ind:{mm:true, ov:true}}, ls.get("radar-ui",{}));
function hhmm(t, tf){ const d=new Date(t); return TF[tf||"5m"]>=86400e3? d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) : d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
function mmss(sec){ sec=Math.max(0,Math.ceil(sec||0)); const m=Math.floor(sec/60), s=sec%60; return (m>59? Math.floor(m/60)+"h"+String(m%60).padStart(2,"0") : String(m).padStart(2,"0"))+":"+String(s).padStart(2,"0"); }
function digitsFor(v){ const a=Math.abs(v); return a>=1000?2: a>=50?3: 5; }
function fmt(v){ if(v==null||!isFinite(v)) return "—"; const d=digitsFor(v); return v.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}); }
const DIR = d => d==="buy"?"COMPRA":"VENDA";

/* ============ Fonte: motor local ou servidor na nuvem ============ */
let vm=null, selC=[{sym:null},{sym:null}], lastSeen=null, remote=null, engine=null, pin=ls.get("radar-pin","");
async function api(path, body){
  const r=await fetch(path,{method:body?"POST":"GET", headers:{"content-type":"application/json","x-radar-pin":pin||""}, body:body?JSON.stringify(body):undefined, cache:"no-store"});
  if(r.status===401){ askPin(); throw new Error("PIN necessário"); }
  if(!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}
async function detectRemote(){
  if(!/^https?:$/.test(location.protocol)) return null;
  try{ const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),2500);
    const r=await fetch("api/ping",{cache:"no-store", signal:ctl.signal}); clearTimeout(tm);
    if(!r.ok) return null; const j=await r.json(); return j&&j.radar? j : null; }catch(e){ return null; }
}
const Src = {
  async start(i){ if(remote) await api("api/robot",{i,action:"start"}); else { engine.start(i); saveLocal(); } refresh(); },
  async stop(i){ if(remote) await api("api/robot",{i,action:"stop"}); else { engine.stop(i); saveLocal(); } refresh(); },
  async setConfig(c, keepKey){ if(remote) await api("api/config",{cfg:c, keepKey}); else { await engine.setConfig(c, keepKey); saveLocal(); } refresh(); },
  async clear(){ if(remote) await api("api/clear",{}); else { engine.clearHistory(); saveLocal(); } refresh(); }
};
let saveT=null;
function saveLocal(){ clearTimeout(saveT); saveT=setTimeout(()=>{ if(engine) ls.set("radar-local-v4", engine.persist()); },400); }
let busy=false;
async function refresh(){
  if(busy) return; busy=true;
  try{
    if(remote){ const q="api/state?s1="+encodeURIComponent(selC[0].sym||"")+"&s2="+encodeURIComponent(selC[1].sym||""); vm=await api(q); }
    else if(engine){ engine.tick(); vm=engine.snapshot({c:selC}); }
    if(vm){ handleNewEvents(); render(); }
  }catch(e){ if(remote) setConn(false,"Sem conexão com o servidor"); }
  finally{ busy=false; }
}

/* ============ Eventos: som e notificações ============ */
function handleNewEvents(){
  const log=vm.log||[]; const top=log.length? log[0].id : 0;
  if(lastSeen==null){ lastSeen=top; return; }
  const fresh=log.filter(e=>e.id>lastSeen).reverse(); lastSeen=Math.max(lastSeen,top);
  for(const ev of fresh){
    playFor(ev);
    if(curPage!=="informacoes") unread++;
    if(!remote) localNotify(ev);
  }
}
function playFor(ev){ const map={alert:"alert", signal:ev.dir, galeOn:ev.dir, att:"att", gale:"gale", win:"win", loss:"loss", draw:"draw"}; if(map[ev.kind]) alarm(map[ev.kind]); }
const NOTIFY_KINDS=["signal","win","loss","gale"];
function notifTitle(ev){ const r=vm&&ev.robot!=null&&vm.robots[ev.robot]; return (ev.kind==="win"?"WIN 🤑":ev.kind==="loss"?"LOSS 😢":ev.kind==="gale"?"GALE 🔁":"Sinal: "+DIR(ev.dir))+(r?" · "+r.rc.name:""); }
async function localNotify(ev){
  if(!NOTIFY_KINDS.includes(ev.kind) || !("Notification" in window) || Notification.permission!=="granted" || !document.hidden) return;
  try{ const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); const opts={body:ev.text, tag:"radar-"+ev.id, icon:"icon-192.png", badge:"icon-192.png"};
    if(reg) reg.showNotification(notifTitle(ev),opts); else new Notification(notifTitle(ev),opts); }catch(e){}
}
let actx=null;
function tone(freq, at, dur, type){ const o=actx.createOscillator(), g=actx.createGain(); o.type=type||"square"; o.frequency.value=freq; g.gain.setValueAtTime(0.0001,at); g.gain.exponentialRampToValueAtTime(0.16,at+0.015); g.gain.exponentialRampToValueAtTime(0.0001,at+dur); o.connect(g).connect(actx.destination); o.start(at); o.stop(at+dur+0.02); }
function alarm(kind){
  if(!UI.sound) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume();
    const t=actx.currentTime+0.02, seq={
      alert:[[988,0],[988,.22],[988,.44]], buy:[[523,0],[659,.12],[784,.24],[1047,.36]], sell:[[1047,0],[784,.12],[659,.24],[523,.36]],
      att:[[440,0],[440,.3]], gale:[[1245,0],[1245,.12],[1245,.24],[1245,.36],[1245,.48],[1245,.6]],
      win:[[784,0],[988,.1],[1175,.2],[1568,.32]], loss:[[392,0],[330,.25],[262,.5]], draw:[[600,0]]
    }[kind]||[[700,0]];
    seq.forEach(([f,d])=>tone(f,t+d,kind==="loss"?0.3:0.15, kind==="win"||kind==="loss"?"triangle":"square"));
  }catch(e){}
}
function unlockAudio(){ try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume(); }catch(e){} }
document.addEventListener("pointerdown",unlockAudio,{once:true});

/* ============ Navegação ============ */
const PAGES=["inicio","agente","grafico","informacoes"]; let curPage="inicio", unread=0;
function route(){
  const h=(location.hash||"").replace("#",""); curPage=PAGES.includes(h)? h : "inicio";
  PAGES.forEach(p=>{ $("p-"+p).hidden = p!==curPage; });
  document.querySelectorAll("#nav a").forEach(a=>{ const on=a.dataset.p===curPage; a.classList.toggle("on",on); if(on) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  if(curPage==="informacoes") unread=0;
  if(vm) render();
}
window.addEventListener("hashchange",route);
const go = p => { if(location.hash!=="#"+p) location.hash=p; else route(); };

/* ============ Render ============ */
function setConn(live, sub){
  $("conn").className="conn"+(live?" live":""); $("connT").textContent = remote? "Nuvem" : "Este aparelho";
  $("connS").textContent = sub;
}
function render(){
  if(!vm) return;
  setConn(vm.mode==="live"||vm.mode==="mt"||vm.mode==="iq", (vm.mode==="iq"?"IQ Option ao vivo":vm.mode==="mt"?"MetaTrader ao vivo":vm.mode==="live"?"Dados ao vivo":"Simulação")+(remote?" · roda 24 h":" · roda com o app aberto"));
  const n=$("infoCnt"); n.hidden=!unread; n.textContent=unread>99?"99+":String(unread);
  const sn=$("srcNotice"); sn.textContent=""; sn.hidden=!vm.notice; if(vm.notice){ sn.append(el("span",null,"ℹ")); const d=el("div"); d.append(el("b",null,vm.notice[0]), document.createTextNode(vm.notice[1])); sn.append(d); }
  if(curPage==="inicio") renderHome();
  if(curPage==="agente"){ renderRobots(); renderHist($("hist"),100); }
  if(curPage==="grafico"){ renderChartControls(); renderWatch(); drawChart(); }
  renderFloat();
  if(curPage==="informacoes"){ renderLog(); renderNotifBox($("notifBox")); }
}
function renderHome(){
  const s=vm.stats; $("sWin").textContent=s.win; $("sGale").textContent=s.gale; $("sLoss").textContent=s.loss;
  $("sWinS").textContent= s.win? s.winDirect+" diretos · "+s.winGale+" no gale" : "indicações corretas";
  const tot=s.win+s.loss; $("sRate").textContent= tot? Math.round(s.win/tot*100)+"%" : "—";
  $("mW").style.width=(tot? s.win/tot*100:0)+"%"; $("mL").style.width=(tot? s.loss/tot*100:0)+"%";
  $("sTot").textContent= tot? tot+" operações encerradas"+(s.draw?" · "+s.draw+" empate(s)":"") : "nenhuma operação encerrada";
  renderHist($("homeHist"),5);
  const w=$("whereBox"); w.textContent="";
  if(remote){ w.append(el("p",null,"Os robôs rodam no seu servidor na nuvem, 24 horas, mesmo com o app fechado. Eles só param quando você clica em Parar.")); }
  else { w.append(el("p",null,"Os robôs estão rodando neste aparelho e param se o app for fechado. Para rodar 24 horas e receber notificações com o app fechado, publique o servidor gratuito (passo a passo no arquivo LEIA-ME do pacote).")); }
  renderNotifBox(w,true);
}
function renderNotifBox(box, append){
  if(!append) box.textContent="";
  const p=el("p"); const st=("Notification" in window)? Notification.permission : "indisponível";
  p.textContent = st==="granted"? (remote? (pushOn?"Notificações ativas neste aparelho: você recebe sinal, WIN e LOSS mesmo com o app fechado.":"Permissão concedida. Toque em Ativar para registrar este aparelho no servidor.") : "Notificações ativas enquanto o app estiver aberto ou em segundo plano. Com o app fechado, só pelo servidor na nuvem.")
    : st==="denied"? "As notificações foram bloqueadas no navegador. Libere nas configurações do site para receber alertas."
    : st==="indisponível"? "Este navegador não oferece notificações aqui. Instale o app (no iPhone, pela opção Adicionar à Tela de Início)."
    : "Ative para receber avisos de sinal, WIN e LOSS.";
  box.append(p);
  if(st!=="denied" && st!=="indisponível" && !(st==="granted"&&(!remote||pushOn))){ const b=el("button","btn primary","🔔 Ativar notificações"); b.type="button"; b.addEventListener("click",enableNotif); box.append(b); }
  if(remote && pushOn){ const b=el("button","btn small","Enviar notificação de teste"); b.type="button"; b.addEventListener("click",()=>api("api/test-push",{}).then(()=>toast("Notificação de teste enviada")).catch(e=>toast(e.message))); box.append(b); }
}

/* ----- Robôs (Agente) ----- */
const RE=[];
function buildRobots(){
  const box=$("robots"); box.textContent=""; RE.length=0;
  [0,1].forEach(i=>{
    const card=el("article","card robot r"+(i+1)); card.setAttribute("aria-live","polite");
    const head=el("div","r-head"), id=el("div","r-id"), badge=el("div","r-badge",String(i+1)), nm=el("div"), h2=el("h2"), sub=el("small"); nm.append(h2,sub); id.append(badge,nm);
    const score=el("div","score"), sw=el("span","w"), sl=el("span","l"), sp=el("span"); score.append(sw,sl,sp);
    const run=el("button","btn run"); run.type="button"; run.addEventListener("click",()=>{ unlockAudio(); const r=vm.robots[i]; if(!r.running) maybeAutoFloat(); r.running? Src.stop(i) : Src.start(i); });
    head.append(id,score,run);
    const stage=el("div","stage"); stage.tabIndex=0; stage.setAttribute("role","button"); stage.setAttribute("aria-label","Abrir o par deste robô no gráfico");
    const pick=()=>{ const r=vm.robots[i]; const s=(r.op&&r.op.sym)||(r.pend&&r.pend.sym)||(r.result&&r.result.sym); if(s){ selC[i].sym=s; V[i].off=0; V[i].lastT=0; } go("grafico"); refresh(); setTimeout(()=>{ const p=$("cp"+i); p&&p.scrollIntoView({block:"start"}); },60); };
    stage.addEventListener("click",pick); stage.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); pick(); } });
    const det=el("details","ck"), sum=el("summary"), sumT=el("span",null,"Checklist"), ul=el("ul","checklist"); sum.append(sumT); det.append(sum,ul);
    card.append(head,stage,det); box.append(card);
    RE[i]={card,h2,sub,sw,sl,sp,run,stage,sumT,ul,key:""};
  });
}
function renderRobots(){
  vm.robots.forEach(r=>{
    const e=RE[r.i], rc=r.rc;
    e.h2.textContent=rc.name;
    e.sub.textContent=stratLabel(rc)+" · "+r.active+(r.active===1?" ativo":" ativos")+" · "+C.MT[rc.tf]+" · expira no fim da vela · gale "+rc.gale;
    const tot=r.w+r.l; e.sw.textContent="W "+r.w; e.sl.textContent="L "+r.l; e.sp.textContent= tot? Math.round(r.w/tot*100)+"%" : "—";
    e.run.textContent= r.running? "■ Parar" : "▶ Iniciar"; e.run.classList.toggle("on",r.running); e.card.classList.toggle("running",r.running);
    const recent = r.result && r.result.age<8 && (r.state==="op"||r.state==="pend");
    const key=r.state+"|"+(r.op?r.op.key+r.op.alert:"")+"|"+(r.pend?r.pend.sym+r.pend.t:"")+"|"+(r.result?r.result.id:"")+"|"+(r.flash?r.flash.id:"")+"|"+(recent?"R":"")+"|"+JSON.stringify(r.check);
    if(key!==e.key){ e.key=key; buildStage(r,e,recent); }
    if(r.state==="op" && e.t){
      e.t.textContent=mmss(r.op.left); e.tl.textContent= r.op.started? "Expira em" : "Entrada em";
      e.bar.style.width= r.op.started? Math.min(100,Math.max(0,(1-r.op.left/r.op.total)*100))+"%" : "0%";
      e.px.textContent=r.op.priceTxt; e.px.className="v"+(r.op.losing?" down":"");
    } else if(r.state==="pend" && e.t){
      e.t.textContent=mmss(r.pend.left); e.bar.style.width=Math.min(100,Math.max(0,(1-r.pend.left/r.pend.total)*100))+"%";
    } else if(r.state==="scan" && e.t){ e.t.textContent="Próxima vela em "+mmss(r.nextIn); }
  });
}
function buildStage(r,e,recent){
  const s=e.stage, rc=r.rc, tf=rc.tf; s.textContent=""; s.className="stage"; e.t=e.bar=e.px=e.tl=null;
  if(recent){ const x=r.result; s.append(el("div","alert "+(x.kind==="win"?"win":x.kind==="loss"?"gale":"ok"), (x.kind==="win"?"🤑 WIN":x.kind==="loss"?"😢 LOSS":"😐 EMPATE")+" na operação anterior: "+x.sym+(x.gale?" (gale "+x.gale+")":""))); }
  const timer=(label)=>{ const w=el("div","timer"), lb=el("div"), tl=el("div","label",label), t=el("div","t"); lb.append(tl,t); const b=el("div","bar"), i=el("i"); b.append(i); w.append(lb,b); e.t=t; e.tl=tl; e.bar=i; return w; };
  if(r.state==="stopped"||r.state==="scan"){
    const w=el("div","idle"); w.append(el("div","radar"));
    if(r.state==="stopped") w.append(el("b",null,"Parado"), el("div",null,"Clique em Iniciar para analisar "+r.active+(r.active===1?" ativo":" ativos")+" no "+tf+"."));
    else { w.append(el("b",null,"Analisando "+r.active+(r.active===1?" ativo":" ativos"))); const t=el("div","num"); e.t=t; w.append(t); }
    s.append(w);
  } else if(r.state==="skip"){
    const w=el("div","idle"); w.append(el("div","radar"), el("b",null,r.flash.sym+": entrada descartada"), el("div",null,"A vela fechou sem confirmar. O robô continua procurando.")); s.append(w);
  } else if(r.state==="pend"){
    s.classList.add("pending");
    const row=el("div","s-row"), l=el("div"); l.append(el("div","s-pair",r.pend.sym), el("div","s-sub","Oportunidade identificada. A indicação aparece se a vela das "+hhmm(r.pend.confT,tf)+" fechar confirmando."));
    row.append(l, el("div","s-dir","AGUARDE")); s.append(row, timer("Confirmação em"));
  } else if(r.state==="op"){
    const op=r.op; s.classList.add(op.dir);
    const row=el("div","s-row"), l=el("div");
    l.append(el("div","s-pair",op.sym), el("div","s-sub",STRAT_NAME[rc.strategy]+" · "+op.setup+(op.statsTxt?" · acerto histórico "+op.statsTxt:"")));
    row.append(l, el("div","s-dir", op.dir==="buy"?"COMPRA ▲":"VENDA ▼"));
    const meta=el("div","s-meta"), m1=el("div"), m2=el("div"), m3=el("div"), px=el("div","v",op.priceTxt);
    m1.append(el("div","label","Entrada"), el("div","v",op.entryTxt)); m2.append(el("div","label","Preço atual"), px); m3.append(el("div","label",op.gale?"Gale "+op.gale:"Valor"), el("div","v",op.stakeTxt));
    meta.append(m1,m2,m3); e.px=px; s.append(row, meta, timer("Expira em"));
    const nd=DIR(op.dir), A=op.alert;
    const msg = A==="att"? ["att","⚠ Atenção para o gale: faltam 10 s e a operação está contra a indicação."]
      : A==="gale"? ["gale","🔁 GALE "+(op.gale+1)+": se fechar assim, entre de novo em "+nd+" na próxima vela com "+op.nextStakeTxt+"."]
      : A==="risk"? ["att","⚠ Operação contra a indicação a 3 s do fim. Sem gale disponível."]
      : A==="galeOn"? ["att","🔁 Gale "+op.gale+" em andamento: "+nd+" com "+op.stakeTxt+"."]
      : A==="ok"? ["ok","✓ O preço voltou a favor da indicação."] : null;
    if(msg) s.append(el("div","alert "+msg[0], msg[1]));
  } else if(r.state==="result"){
    const x=r.result; s.classList.add(x.kind==="draw"?"x":x.kind);
    const w=el("div","result");
    w.append(el("div","emo", x.kind==="win"?"🤑":x.kind==="loss"?"😢":"😐"), el("div","big", x.kind==="win"?"WIN":x.kind==="loss"?"LOSS":"EMPATE"), el("div","s-sub", x.sym+" · "+DIR(x.dir)+(x.gale?" · no gale "+x.gale:" · sem gale")));
    s.append(w);
  }
  e.sumT.textContent = r.check.label? "Checklist · "+r.check.label : "Checklist"; e.ul.textContent="";
  ["Contexto","Sinal","Confirmação","Invalidação","Risco"].forEach((k,i)=>{
    const it=r.check.items? r.check.items[i] : null, li=el("li"), cls=!it?"":it.ok===true?"ok":it.ok===null?"wait":"no";
    li.append(el("span","cb "+cls, !it?"·":it.ok===true?"✓":it.ok===null?"…":"✕"), el("span","k",k), el("span","d",it?it.d:"—")); e.ul.append(li);
  });
}
function renderHist(ul, max){
  ul.textContent=""; const H=vm.hist||[];
  if(ul.id==="hist"){ const s=vm.stats; $("histCount").textContent= s.total? s.win+" WIN · "+s.loss+" LOSS" : "nenhuma ainda"; }
  if(!H.length){ ul.append(el("li","empty","As operações indicadas pelos robôs e o resultado de cada uma aparecem aqui.")); return; }
  for(const h of H.slice(0,max)){
    const li=el("li"), rb=el("span","rb r"+(h.robot+1),String(h.robot+1)), nm=el("span","nm"); nm.append(el("b","num",h.sym), el("span","tag "+h.dir,DIR(h.dir)));
    const res = h.result==="win"? el("span","res win","WIN 🤑"+(h.gale?" G"+h.gale:"")) : h.result==="loss"? el("span","res loss","LOSS 😢") : h.result==="draw"? el("span","res draw","EMPATE") : el("span","res run",h.gale?"Gale "+h.gale+"…":"Em curso…");
    li.append(el("span","num",hhmm(h.at||h.t,h.tf)), rb, nm, res, el("span","sub",(STRAT_NAME[h.strategy]||"")+" · "+h.setup+" · "+(C.MT[h.tf]||h.tf)));
    ul.append(li);
  }
}

/* ----- Gráfico 1 e Gráfico 2 (um por robô), com zoom e rolagem ----- */
const V=[0,1].map(()=>({n:80, off:0, lastT:0, cw:8, total:0}));
function clampView(v){ v.n=Math.max(15,Math.min(Math.max(15,v.total),Math.round(v.n))); v.off=Math.max(0,Math.min(Math.max(0,v.total-v.n),v.off)); }
function resetView(i){ V[i].n=80; V[i].off=0; drawChart(); }
function renderChartControls(){
  (vm.charts||[]).forEach((ch,i)=>{
    const r=vm.robots[i]; $("ct"+i).textContent="Gráfico "+(i+1)+" · "+r.rc.name+" · "+ch.sym+" · "+C.MT[ch.tf];
    const pc=$("pc"+i), key=(ch.pairs||[]).join(",")+"|"+ch.sym;
    if(pc.dataset.k===key) return; pc.dataset.k=key; pc.textContent="";
    (ch.pairs||[]).forEach(s=>{ const b=el("button",ch.sym===s?"on":"",s); b.type="button"; b.addEventListener("click",()=>{ selC[i].sym=s; V[i].off=0; V[i].lastT=0; refresh(); }); pc.append(b); });
  });
}
function renderWatch(){
  const tb=$("watch"); tb.textContent=""; const shown=(vm.charts||[]).map(c=>c.sym);
  for(const w of vm.watch){
    const tr=el("tr"); if(shown.includes(w.sym)) tr.className="sel"; tr.tabIndex=0;
    const pick=()=>{ const i=vm.robots.findIndex(r=>r.rc.pairs.includes(w.sym)); const k=i<0?0:i; selC[k].sym=w.sym; V[k].off=0; V[k].lastT=0; refresh(); $("cp"+k).scrollIntoView({behavior:"smooth",block:"start"}); };
    tr.addEventListener("click",pick); tr.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(); } });
    const t1=el("td"); t1.append(el("b","num",w.sym));
    tr.append(t1, el("td","num",w.priceTxt), el("td","num",w.pays.map(p=>p==null?"—":p+"%").join(" · ")));
    w.st.forEach(s=>{ const td=el("td"); td.append(el("span","pill "+s.cls,s.txt)); tr.append(td); });
    tb.append(tr);
  }
}
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function drawChart(){ if(vm&&vm.charts) vm.charts.forEach((ch,i)=>drawOne(ch,i)); }
function drawOne(ch,i){
  const cv=$("cv"+i); if(!cv) return; const box=cv.parentElement, dpr=window.devicePixelRatio||1, W=box.clientWidth, H=box.clientHeight; if(!W||!H) return;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){ cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); }
  const g=cv.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  g.font="11px "+cssVar("--f-num");
  const v=V[i];
  if(!ch||!ch.candles.length){ g.fillStyle=cssVar("--muted"); g.fillText(ch&&ch.err? ch.err : "Carregando dados…",16,28); $("ch"+i).textContent=""; return; }
  const all=ch.candles, total=all.length, lastT=all[total-1][0];
  if(v.lastT && lastT>v.lastT && v.off>0){ let k=0; for(let j=total-1;j>=0&&all[j][0]>v.lastT;j--) k++; v.off+=k; }
  v.lastT=lastT; v.total=total; clampView(v);
  const end=total-v.off, start=end-v.n, sl=a=>a? a.slice(start,end) : null;
  const c=all.slice(start,end), e20=sl(ch.e20), e200=sl(ch.e200);
  const ov=UI.ind.ov&&ch.ov? Object.fromEntries(["res","sup","mid","tb","up","lo","sig"].map(k=>[k,sl(ch.ov[k])])) : null;
  const showMM=UI.ind.mm;
  let hi=-Infinity, lo=Infinity; c.forEach(k=>{hi=Math.max(hi,k[2]); lo=Math.min(lo,k[3]);});
  if(e20&&showMM) e20.forEach(x=>{ if(x!=null){ hi=Math.max(hi,x); lo=Math.min(lo,x);} });
  if(ov) ["res","sup"].forEach(k=>ov[k].forEach(x=>{ if(x!=null){ hi=Math.max(hi,x); lo=Math.min(lo,x);} }));
  if(!v.off) ch.ops.forEach(o=>{ hi=Math.max(hi,o.entry); lo=Math.min(lo,o.entry); });
  const pad=(hi-lo)*(ov?0.12:0.08)||1e-4; hi+=pad; lo-=pad;
  const L=8, Rm=78, T=10, B=20, cw=(W-L-Rm)/c.length, y=p=>T+(hi-p)/(hi-lo)*(H-T-B); v.cw=cw;
  g.strokeStyle=cssVar("--grid"); g.lineWidth=1; g.fillStyle=cssVar("--muted");
  for(let k=0;k<=4;k++){ const p=lo+(hi-lo)*k/4, yy=Math.round(y(p))+.5; g.beginPath(); g.moveTo(L,yy); g.lineTo(W-Rm,yy); g.stroke(); g.fillText(fmt(p),W-Rm+6,yy+4); }
  const buy=cssVar("--buy"), sell=cssVar("--sell"), mut=cssVar("--muted");
  const isLast = k => v.off===0 && ch.forming && k===c.length-1;
  c.forEach((k,j)=>{ const x=L+j*cw+cw/2, col=k[4]>=k[1]?buy:sell; g.globalAlpha=isLast(j)?0.65:1; g.strokeStyle=col; g.fillStyle=col; g.beginPath(); g.moveTo(Math.round(x)+.5,y(k[2])); g.lineTo(Math.round(x)+.5,y(k[3])); g.stroke(); const bw=Math.max(1,cw*0.64); g.fillRect(x-bw/2,y(Math.max(k[1],k[4])),bw,Math.max(1,Math.abs(y(k[1])-y(k[4])))); });
  g.globalAlpha=1;
  const line=(arr,color,w)=>{ if(!arr) return; g.strokeStyle=color; g.lineWidth=w; g.beginPath(); let st=false; arr.forEach((p,j)=>{ if(p==null) return; const x=L+j*cw+cw/2; if(!st){g.moveTo(x,y(p)); st=true;} else g.lineTo(x,y(p)); }); g.stroke(); g.lineWidth=1; };
  if(showMM){ line(e200,mut,1.2); line(e20,cssVar("--warn"),1.6); }
  if(ov){
    line(ov.up,"#FF8A80",1); line(ov.lo,"#B9F6CA",1);
    g.setLineDash([5,4]); line(ov.mid,"#787B86",1); g.setLineDash([]);
    line(ov.res,"#FF3B30",2); line(ov.sup,"#00E676",2);
    for(let j=1;j<ov.tb.length;j++){ if(ov.tb[j]==null||ov.tb[j-1]==null) continue; const x0=L+(j-1)*cw+cw/2, x1=L+j*cw+cw/2; g.strokeStyle=ov.tb[j]-ov.tb[j-1]>=0?"#00B0FF":"#FF5252"; g.lineWidth=2; g.beginPath(); g.moveTo(x0,y(ov.tb[j-1])); g.lineTo(x1,y(ov.tb[j])); g.stroke(); }
    g.lineWidth=1;
    ov.sig.forEach((d,j)=>{ if(!d) return; const x=L+j*cw+cw/2, k=c[j], s=Math.max(4,Math.min(9,cw*0.8));
      g.fillStyle=d==="buy"?"#00C800":"#FF0000"; g.beginPath();
      if(d==="buy"){ const yy=y(k[3])+6; g.moveTo(x,yy); g.lineTo(x-s,yy+s*1.4); g.lineTo(x+s,yy+s*1.4); }
      else { const yy=y(k[2])-6; g.moveTo(x,yy); g.lineTo(x-s,yy-s*1.4); g.lineTo(x+s,yy-s*1.4); }
      g.closePath(); g.fill(); });
  }
  ch.ops.forEach(o=>{ const yy=Math.round(y(o.entry))+.5; if(yy<T||yy>H-B) return; const idx=c.findIndex(k=>k[0]===o.entryT), x0=idx>=0? L+idx*cw : L;
    g.strokeStyle=cssVar("--fg"); g.setLineDash([5,4]); g.beginPath(); g.moveTo(x0,yy); g.lineTo(W-Rm,yy); g.stroke(); g.setLineDash([]);
    g.fillStyle=o.dir==="buy"?buy:sell; g.fillRect(W-Rm+2,yy-8,Rm-4,16); g.fillStyle="#fff"; g.fillText((o.dir==="buy"?"▲ ":"▼ ")+fmt(o.entry),W-Rm+5,yy+4); });
  const lp=c[c.length-1][4]; g.fillStyle=cssVar("--fg"); g.fillRect(W-Rm+2,y(lp)-8,Rm-4,16); g.fillStyle=cssVar("--bg"); g.fillText(fmt(lp),W-Rm+6,y(lp)+4);
  g.fillStyle=mut; const ticks=Math.max(2,Math.min(6,Math.floor((W-Rm)/110)));
  for(let k=0;k<ticks;k++){ const j=Math.round(k*(c.length-1)/(ticks-1)), lbl=hhmm(c[j][0],ch.tf), x=L+j*cw+cw/2, wd=g.measureText(lbl).width; g.fillText(lbl,Math.max(L,Math.min(W-Rm-wd,x-wd/2)),H-5); }
  $("ch"+i).textContent = v.n+" velas na tela"+(v.off? " · "+v.off+" velas atrás do momento atual" : " · acompanhando a vela atual");
}
function zoom(i,f){ const v=V[i]; const keepRight=v.off; v.n=v.n*f; v.off=keepRight; clampView(v); drawChart(); }
function pan(i,k){ const v=V[i]; v.off+=k; clampView(v); drawChart(); }
function bindChart(i){
  const cv=$("cv"+i), P=new Map(); let drag=null, pinch=null;
  cv.addEventListener("wheel",e=>{ e.preventDefault(); const v=V[i];
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey){ const d=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY); pan(i, d>0? -Math.max(1,Math.round(v.n*0.08)) : Math.max(1,Math.round(v.n*0.08))); }
    else zoom(i, e.deltaY>0? 1.15 : 1/1.15); },{passive:false});
  cv.addEventListener("pointerdown",e=>{ cv.setPointerCapture(e.pointerId); P.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(P.size===1) drag={x:e.clientX, off:V[i].off};
    if(P.size===2){ const [a,b]=[...P.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1, n:V[i].n}; drag=null; } });
  cv.addEventListener("pointermove",e=>{ if(!P.has(e.pointerId)) return; P.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch && P.size===2){ const [a,b]=[...P.values()], d=Math.hypot(a.x-b.x,a.y-b.y)||1; V[i].n=pinch.n*pinch.d/d; clampView(V[i]); drawChart(); }
    else if(drag){ V[i].off=drag.off+Math.round((e.clientX-drag.x)/(V[i].cw||8)); clampView(V[i]); drawChart(); } });
  const up=e=>{ P.delete(e.pointerId); if(P.size<2) pinch=null; if(!P.size) drag=null; else if(P.size===1){ const [a]=[...P.values()]; drag={x:a.x, off:V[i].off}; } };
  cv.addEventListener("pointerup",up); cv.addEventListener("pointercancel",up);
  cv.addEventListener("dblclick",()=>resetView(i));
  cv.addEventListener("keydown",e=>{ const m={"+":()=>zoom(i,1/1.25),"=":()=>zoom(i,1/1.25),"-":()=>zoom(i,1.25),"ArrowLeft":()=>pan(i,Math.max(1,Math.round(V[i].n*0.15))),"ArrowRight":()=>pan(i,-Math.max(1,Math.round(V[i].n*0.15))),"Home":()=>resetView(i)}[e.key]; if(m){ e.preventDefault(); m(); } });
  document.querySelectorAll('#cp'+i+' [data-z]').forEach(b=>b.addEventListener("click",()=>{ const z=b.dataset.z, st=Math.max(1,Math.round(V[i].n*0.25));
    if(z==="in") zoom(i,1/1.25); else if(z==="out") zoom(i,1.25); else if(z==="left") pan(i,st); else if(z==="right") pan(i,-st); else resetView(i); }));
}
[0,1].forEach(bindChart);

/* ----- Informações ----- */
const LOG_F={todos:null, sinais:["signal","alert","skip"], resultados:["win","loss","draw"], gale:["att","gale","galeOn"], sistema:["info","error"]};
const LOG_N={todos:"Todos", sinais:"Sinais", resultados:"Resultados", gale:"Gale", sistema:"Sistema"};
let logF="todos";
const ICO={signal:"📍", alert:"🔔", skip:"⏭", win:"🤑", loss:"😢", draw:"😐", att:"⚠", gale:"🔁", galeOn:"🔁", info:"ℹ", error:"⛔"};
function renderLog(){
  const fc=$("logFilter"); fc.textContent="";
  Object.keys(LOG_F).forEach(k=>{ const b=el("button",k===logF?"on":"",LOG_N[k]); b.type="button"; b.addEventListener("click",()=>{ logF=k; renderLog(); }); fc.append(b); });
  const ul=$("log"); ul.textContent=""; const f=LOG_F[logF];
  const L=(vm.log||[]).filter(e=>!f||f.includes(e.kind));
  if(!L.length){ ul.append(el("li","empty","Nenhuma mensagem ainda. Inicie um robô no menu Agente.")); return; }
  for(const e of L.slice(0,150)){
    const li=el("li","k-"+e.kind), rb=el("span","rb "+(e.robot==null?"sys":"r"+(e.robot+1)), e.robot==null?"•":String(e.robot+1));
    const tx=el("span","txt"); tx.append(el("span","ico",(ICO[e.kind]||"•")+" "), document.createTextNode(e.text||""));
    li.append(el("span","num",new Date(e.t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})), rb, tx);
    ul.append(li);
  }
}

/* ============ Notificações ============ */
let pushOn=false;
function b64ToU8(b){ const p="=".repeat((4-b.length%4)%4), s=atob((b+p).replace(/-/g,"+").replace(/_/g,"/")); return Uint8Array.from(s,ch=>ch.charCodeAt(0)); }
async function checkPush(){
  pushOn=false;
  if(!remote||!("serviceWorker" in navigator)||!("PushManager" in window)) return;
  try{ const reg=await navigator.serviceWorker.getRegistration(); const sub=reg&&await reg.pushManager.getSubscription();
    if(sub){ const key=ls.get("radar-push-key",""); if(key!==remote.vapidPublicKey){ await sub.unsubscribe(); return; } await api("api/subscribe",{subscription:sub.toJSON()}); pushOn=true; } }catch(e){}
}
async function enableNotif(){
  if(!("Notification" in window)) return toast("Este navegador não permite notificações aqui. Instale o app primeiro.");
  const perm=await Notification.requestPermission();
  if(perm!=="granted") return toast("Permissão de notificação negada");
  if(remote){
    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(remote.vapidPublicKey)});
      await api("api/subscribe",{subscription:sub.toJSON()}); ls.set("radar-push-key",remote.vapidPublicKey); pushOn=true;
      toast("Notificações ativadas neste aparelho");
    }catch(e){ toast("Não foi possível ativar: "+(e.message||e)); }
  } else toast("Notificações ativas enquanto o app estiver aberto");
  render();
}
$("btnNotif").addEventListener("click",()=>{ go("informacoes"); });

/* ============ Configurações: uma aba por robô + Geral ============ */
let D=null, cfgTab=0, catOf=[ "forex","forex" ];
const ASSETS=C.ASSETS, classOf=C.classOf;
const IQ_CATS={forex:"Forex", otc:"OTC", crypto:"Cripto", other:"Ações e outros"};
const iqCatOf = s => { const a=vm.iqCat&&vm.iqCat.find(x=>x[0]===s); return a? a[1] : "other"; };
const stratLabel = rc => STRAT_NAME[rc.strategy]+(rc.strategy==="overlay"?" ("+rc.ov.sr+"/"+rc.ov.trend+")":"");
function buildTabs(){
  const t=$("cfgTabs"); t.textContent="";
  const names=D.robots.map(r=>r.name).concat(["Geral"]);
  names.forEach((n,i)=>{ const b=el("button"); b.type="button"; b.setAttribute("role","tab"); b.setAttribute("aria-selected",String(i===cfgTab));
    if(i<2){ const sw=el("span","sw"); sw.style.background="var(--r"+(i+1)+")"; b.append(sw); } b.append(document.createTextNode(n));
    b.addEventListener("click",()=>{ cfgTab=i; buildTabs(); showTab(); }); t.append(b); });
}
function showTab(){
  $("cfgGeneral").hidden = cfgTab!==2; $("cfgRobot").hidden = cfgTab===2;
  if(cfgTab<2) buildRobotTab(cfgTab);
  creditHint();
}
function field(label, input, id){ const f=el("div","field"), l=el("label",null,label); l.htmlFor=id; input.id=id; f.append(l,input); return f; }
function selectOf(opts,val,onch){ const s=el("select"); opts.forEach(([v,t])=>{ const o=el("option",null,t); o.value=v; if(String(v)===String(val)) o.selected=true; s.append(o); }); s.addEventListener("change",()=>onch(s.value)); return s; }
function numOf(val,min,max,step,onch){ const i=el("input"); i.type="number"; i.min=min; i.max=max; i.step=step; i.value=val; i.addEventListener("input",()=>{ const v=parseFloat(i.value); if(isFinite(v)) onch(v); }); return i; }
function buildRobotTab(i){
  const R=D.robots[i], box=$("cfgRobot"), p="c"+R.id; box.textContent="";
  // Estratégia
  const s1=el("div","sect r"+(i+1)); s1.append(el("h3",null,R.name+": estratégia"));
  const hint=el("div","hint",STRAT_DESC[R.strategy]);
  const fz=field("Mercado (ZigZag)", selectOf([["open","Mercado aberto: só em tendência"],["otc","OTC: em tendência e em lateralização"]],R.market,v=>R.market=v), p+"-mk");
  const fo=el("div","grid3");
  fo.append(field("Período Suporte/Resistência", numOf(R.ov.sr,5,100,1,v=>R.ov.sr=Math.round(v)), p+"-sr"),
            field("Período Canal/Tendência", numOf(R.ov.trend,10,200,1,v=>R.ov.trend=Math.round(v)), p+"-tr"),
            field("Desvio do canal", numOf(R.ov.mult,0.5,5,0.1,v=>R.ov.mult=v), p+"-mu"));
  const sync=()=>{ hint.textContent=STRAT_DESC[R.strategy]; fz.hidden=true; fo.hidden=R.strategy!=="overlay"; };
  s1.append(field("Estratégia", selectOf(Object.keys(STRAT_NAME).map(k=>[k,STRAT_NAME[k]]),R.strategy,v=>{ R.strategy=v; sync(); }), p+"-st"), hint, fz, fo); sync();
  const f2=el("div","field"); f2.append(el("span","flabel","Tempo gráfico"));
  const seg=el("div","seg"); Object.keys(TF).forEach(k=>{ const lb=el("label"), r=el("input"); r.type="radio"; r.name=p+"-tf"; r.value=k; r.checked=k===R.tf; r.addEventListener("change",()=>{ R.tf=k; creditHint(); }); lb.append(r,el("span",null,C.MT[k])); seg.append(lb); });
  f2.append(seg);
  const g=el("div","grid2");
  const ex=el("div","field"); ex.append(el("span","flabel","Expiração"), el("div","hint","Igual ao tempo gráfico: a operação expira no fechamento da vela, no mesmo horário da vela do MetaTrader (ex.: M5 fecha em :00, :05, :10…)."));
  g.append(ex,
           field("Gale (martingale)", selectOf([[0,"Sem gale"],[1,"Até 1 gale"],[2,"Até 2 gales"]],R.gale,v=>R.gale=+v), p+"-gale"));
  const g2=el("div","grid2");
  g2.append(field("Valor por entrada (% do saldo)", numOf(R.riskPct,0.1,10,0.1,v=>R.riskPct=v), p+"-risk"),
            field("Payout mínimo (%)", numOf(R.minPayout,1,100,1,v=>{ R.minPayout=v; markLow(); }), p+"-minp"));
  s1.append(f2,g,g2);
  // Ativos
  const s2=el("div","sect r"+(i+1)); s2.append(el("h3",null,R.name+": ativos e payout"));
  const row=el("div","cat-row"), chips=el("div","chips"), all=el("button","btn small","Marcar todos"), none=el("button","btn small","Desmarcar todos"), copy=el("button","btn small","Copiar do "+D.robots[1-i].name);
  [all,none,copy].forEach(b=>b.type="button"); row.append(chips,all,none,copy);
  const list=el("div","pairs"), add=el("div","row-add"), ai=el("input"), ab=el("button","btn","Adicionar"); ai.type="text"; ai.maxLength=12; ai.setAttribute("aria-label","Adicionar ativo"); ab.type="button"; add.append(ai,ab);
  // Com a IQ Option conectada, a lista de ativos é a da própria corretora
  const IQ=vm.iqCat, CATS=IQ? IQ_CATS : Object.fromEntries(Object.keys(ASSETS).map(k=>[k,ASSETS[k].name]));
  const catOfSym = s => IQ? iqCatOf(s) : classOf(s);
  const iqA = s => IQ && IQ.find(a=>a[0]===s);
  const iqPayOf = s => { const a=iqA(s); return a? (C.TF[R.tf]>300e3? (a[4]||a[3]) : (a[3]||a[4])) : null; };
  const symsOf = cat => IQ? IQ.filter(a=>a[1]===cat).map(a=>a[0]) : Array.from(new Set(ASSETS[cat].list.concat(R.known.filter(s=>classOf(s)===cat), R.pairs.filter(s=>classOf(s)===cat))));
  const drawChips=()=>{ chips.textContent=""; Object.keys(CATS).forEach(k=>{ const n=R.pairs.filter(s=>catOfSym(s)===k).length, b=el("button",catOf[i]===k?"on":""); b.type="button"; b.append(document.createTextNode(CATS[k]+" "), el("small",null,n+"/"+symsOf(k).length)); b.addEventListener("click",()=>{ catOf[i]=k; drawChips(); drawList(); }); chips.append(b); }); };
  function markLow(){ list.querySelectorAll(".prow").forEach(r=>{ const s=r.dataset.sym; const v=(IQ&&D.iqPay&&iqPayOf(s))||(R.payouts[s]??C.DEFAULT_PAY[s]??80); r.classList.toggle("low",v<R.minPayout); }); }
  const drawList=()=>{
    list.textContent=""; const cat=catOf[i];
    ai.placeholder = cat==="forex"? "Adicionar par (ex.: EUR/NZD)" : cat==="crypto"? "Adicionar cripto (ex.: AVAX/USD)" : "Adicionar ação (ex.: AMD)";
    symsOf(cat).forEach(s=>{
      const r=el("div","prow"), lb=el("label"), c=el("input"); r.dataset.sym=s; c.type="checkbox"; c.id=p+"-a-"+s.replace(/\W/g,""); c.checked=R.pairs.includes(s);
      c.addEventListener("change",()=>{ if(c.checked){ if(!R.pairs.includes(s)) R.pairs.push(s); } else R.pairs=R.pairs.filter(x=>x!==s); drawChips(); creditHint(); });
      lb.append(c,document.createTextNode(s)); const a=iqA(s); if(a&&!a[2]) lb.append(el("small","closed","fechado"));
      const pi=el("input"); pi.type="number"; pi.min="1"; pi.max="100"; pi.step="1"; pi.value=(IQ&&D.iqPay&&iqPayOf(s))||(R.payouts[s]??C.DEFAULT_PAY[s]??80); pi.setAttribute("aria-label","Payout de "+s);
      if(IQ&&D.iqPay&&iqPayOf(s)){ pi.disabled=true; pi.title="Payout atual da IQ Option"; }
      pi.addEventListener("input",()=>{ const v=parseFloat(pi.value); if(v>0){ R.payouts[s]=v; markLow(); } });
      r.append(lb,pi,el("span","pct","%")); list.append(r);
    });
    markLow();
  };
  all.addEventListener("click",()=>{ symsOf(catOf[i]).forEach(s=>{ if(!R.pairs.includes(s)) R.pairs.push(s); }); drawChips(); drawList(); creditHint(); });
  none.addEventListener("click",()=>{ const set=symsOf(catOf[i]); R.pairs=R.pairs.filter(s=>!set.includes(s)); drawChips(); drawList(); creditHint(); });
  copy.addEventListener("click",()=>{ const O=D.robots[1-i]; R.pairs=O.pairs.slice(); R.known=Array.from(new Set(R.known.concat(O.known))); R.payouts=Object.assign({},O.payouts); drawChips(); drawList(); creditHint(); toast("Ativos e payouts copiados do "+O.name); });
  ab.addEventListener("click",()=>{
    const cat=catOf[i]; let v=ai.value.toUpperCase().replace(/[^A-Z0-9/.]/g,"");
    if(cat==="stocks"){ v=v.replace(/\//g,""); if(!/^[A-Z0-9.]{1,10}$/.test(v)) return toast("Digite o código da ação, ex.: AMD"); }
    else { if(!v.includes("/")) v = cat==="crypto"? v+"/USD" : (v.length===6? v.slice(0,3)+"/"+v.slice(3) : v); if(!/^[A-Z0-9]{2,6}\/[A-Z]{3,4}$/.test(v)) return toast(cat==="crypto"?"Digite a cripto, ex.: AVAX/USD":"Digite o par com 6 letras, ex.: EUR/NZD"); }
    if(classOf(v)!==cat){ catOf[i]=classOf(v); }
    if(!R.known.includes(v)) R.known.push(v); if(!R.pairs.includes(v)) R.pairs.push(v); ai.value=""; drawChips(); drawList(); creditHint();
  });
  ai.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); ab.click(); } });
  add.hidden=!!IQ;
  s2.append(el("div","hint", IQ? "Lista de ativos da IQ Option (opções binárias e turbo), com o payout atual da corretora. Marque os que este robô deve analisar. Ativos abaixo do payout mínimo ficam fora da análise." : "Escolha o tipo de ativo, marque os que este robô deve analisar e informe o payout da sua corretora. Ativos abaixo do payout mínimo ficam fora da análise."), row, list, add);
  drawChips(); drawList();
  box.append(s1,s2);
}
function creditPlan(){
  const tfs={}; D.robots.forEach(r=>{ (tfs[r.tf]=tfs[r.tf]||new Set()); r.pairs.forEach(s=>tfs[r.tf].add(s)); });
  let day=0, perMin=0; Object.keys(tfs).forEach(tf=>{ const n=tfs[tf].size; day+=n*86400e3/TF[tf]; perMin+=n; });
  return {day, perMin};
}
function creditHint(){
  const h=$("creditHint"); if(!D || $("source").value!=="live"){ h.textContent=""; h.className="hint"; return; }
  const {day,perMin}=creditPlan();
  h.textContent="Consumo estimado na Twelve Data (os dois robôs): cerca de "+Math.round(day).toLocaleString("pt-BR")+" créditos por dia de mercado aberto, mais 2 por operação. O plano gratuito permite 8 por minuto e 800 por dia."+(perMin>8?" Hoje são "+perMin+" ativos por vela: reduza para no máximo 8 somando os dois robôs.":day>800?" Use um tempo gráfico maior ou menos ativos para não esgotar o limite diário.":"");
  h.className="hint"+((perMin>8||day>800)?" warn":"");
}
function openCfg(){
  if(!vm) return;
  D=JSON.parse(JSON.stringify(vm.cfg));
  catOf=D.robots.map(r=>{ const c=r.pairs.map(s=>vm.iqCat? iqCatOf(s) : classOf(s)); return c[0]||"forex"; });
  $("capital").value=D.capital; $("source").value=D.source; $("demoSpeed").value=D.demoSpeed||"real"; $("speedField").hidden=D.source!=="demo"; $("mtSuffix").value=D.mtSuffix||""; $("mtField").hidden=D.source!=="mt"; $("iqOtc").checked=!!D.iqOtc; $("iqPay").checked=D.iqPay!==false; $("iqField").hidden=D.source!=="iq"; $("apiKey").value=""; $("apiKey").placeholder= D.hasKey? "chave salva (deixe em branco para manter)" : "cole sua chave gratuita";
  $("sound").checked=!!UI.sound; $("autoFloat").checked=UI.autoFloat!==false;
  $("pinField").hidden=!remote; $("pin").value=pin||"";
  if(cfgTab>2) cfgTab=0; buildTabs(); showTab(); $("modal").hidden=false;
}
$("source").addEventListener("change",()=>{ const v=$("source").value; $("speedField").hidden=v!=="demo"; $("mtField").hidden=v!=="mt"; $("iqField").hidden=v!=="iq"; if(v==="mt"&&!(remote&&remote.mt)) toast(remote? "Configure API2TRADE_API_KEY e API2TRADE_ACCOUNT_ID no servidor" : "O MetaTrader funciona só no servidor na nuvem"); if(v==="iq"&&!(remote&&remote.iq)) toast(remote? "Configure IQ_EMAIL e IQ_PASSWORD no servidor" : "A IQ Option funciona só no servidor na nuvem"); creditHint(); });
$("btnCfg").addEventListener("click",openCfg);
document.querySelectorAll('[data-act="cfg"]').forEach(b=>b.addEventListener("click",openCfg));
document.querySelectorAll('[data-act="notif"]').forEach(b=>b.addEventListener("click",()=>go("informacoes")));
document.querySelectorAll('[data-act="install"]').forEach(b=>b.addEventListener("click",()=>$("btnInstall").click()));
const closeModal=id=>{ $(id).hidden=true; };
$("cfgCancel").addEventListener("click",()=>closeModal("modal"));
$("modal").addEventListener("click",e=>{ if(e.target===$("modal")) closeModal("modal"); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ closeModal("modal"); closeModal("infoModal"); } });
let clearArm=0;
$("btnClear").addEventListener("click",async ()=>{
  if(Date.now()-clearArm>4000){ clearArm=Date.now(); $("btnClear").textContent="Confirmar: zerar"; setTimeout(()=>{ $("btnClear").textContent="Zerar placar"; },4000); return; }
  clearArm=0; $("btnClear").textContent="Zerar placar"; try{ await Src.clear(); toast("Placar zerado"); }catch(e){ toast(e.message); }
});
$("cfgForm").addEventListener("submit", async e=>{
  e.preventDefault();
  for(let i=0;i<2;i++){ const R=D.robots[i];
    if(!R.pairs.length){ cfgTab=i; buildTabs(); showTab(); return toast(R.name+": escolha ao menos um ativo"); }
    if(!(R.riskPct>0)){ cfgTab=i; buildTabs(); showTab(); return toast(R.name+": informe o valor por entrada em %"); }
    if(!(R.minPayout>0 && R.minPayout<=100)){ cfgTab=i; buildTabs(); showTab(); return toast(R.name+": payout mínimo entre 1% e 100%"); } }
  const src=$("source").value, cap=parseFloat($("capital").value);
  if(src==="live" && creditPlan().perMin>8) return toast("No plano gratuito da Twelve Data use no máximo 8 ativos por vela somando os dois robôs");
  if(!(cap>0)){ cfgTab=2; buildTabs(); showTab(); return toast("Informe um saldo maior que zero"); }
  if(remote){ pin=$("pin").value.trim(); ls.set("radar-pin",pin); }
  UI.sound=$("sound").checked; UI.autoFloat=$("autoFloat").checked; ls.set("radar-ui",UI);
  const key=$("apiKey").value.trim();
  const c=Object.assign({},D,{capital:cap, source:src, apiKey:key, demoSpeed:$("demoSpeed").value, mtSuffix:$("mtSuffix").value.trim(), iqOtc:$("iqOtc").checked, iqPay:$("iqPay").checked, tz:(()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||""; }catch(e){ return ""; } })()}); delete c.hasKey;
  closeModal("modal");
  try{ await Src.setConfig(c, !key); toast(remote? "Configurações salvas no servidor" : "Configurações salvas"); }catch(err){ toast("Não foi possível salvar: "+err.message); }
});

/* ============ PIN e instalação ============ */
function infoModal(title, build){ $("imTitle").textContent=title; const b=$("imBody"); b.textContent=""; build(b); $("infoModal").hidden=false; }
$("imClose").addEventListener("click",()=>closeModal("infoModal"));
$("infoModal").addEventListener("click",e=>{ if(e.target===$("infoModal")) closeModal("infoModal"); });
let pinAsked=false;
function askPin(){
  if(pinAsked) return; pinAsked=true;
  infoModal("PIN do servidor", b=>{
    b.append(el("p",null,"Este servidor está protegido. Digite o PIN (APP_PIN) que você configurou na hospedagem."));
    const i=el("input"); i.type="password"; i.id="pinAsk"; i.setAttribute("aria-label","PIN"); b.append(i);
    const ok=el("button","btn primary","Entrar"); ok.type="button"; ok.addEventListener("click",()=>{ pin=i.value.trim(); ls.set("radar-pin",pin); pinAsked=false; closeModal("infoModal"); refresh(); checkPush(); }); b.append(ok);
    setTimeout(()=>i.focus(),0);
  });
}
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); deferredPrompt=e; });
window.addEventListener("appinstalled",()=>{ deferredPrompt=null; toast("Radar de Sinais instalado"); });
const hasManifest = !!document.querySelector('link[rel="manifest"]');
if(hasManifest && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
$("btnInstall").addEventListener("click", async ()=>{
  if(deferredPrompt){ deferredPrompt.prompt(); try{ await deferredPrompt.userChoice; }catch(e){} deferredPrompt=null; return; }
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const steps=(arr)=>{ const ol=el("ol","steps"); arr.forEach(t=>ol.append(el("li",null,t))); return ol; };
  infoModal("Instalar o Radar de Sinais", b=>{
    if(standalone) b.append(el("p",null,"O app já está instalado e aberto em modo aplicativo."));
    else if(hasManifest && /^https:$/.test(location.protocol)){
      b.append(el("p",null,"Este endereço já pode ser instalado:"));
      b.append(steps(ios? ["Abra esta página no Safari.","Toque em Compartilhar (quadrado com seta).","Escolha Adicionar à Tela de Início."] : ["No Chrome ou Edge, abra o menu ⋮.","Toque em Instalar app ou Adicionar à tela inicial.","No computador, use também o ícone de instalar na barra de endereço."]));
    } else {
      b.append(el("p",null,"Esta visualização não permite instalar apps. Publique o servidor gratuito do pacote radar-servidor.zip (passo a passo no LEIA-ME) e abra o endereço gerado no celular ou no computador para instalar."));
    }
  });
});

let toastT=null;
function toast(m){ const t=$("toast"); t.textContent=m; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{t.hidden=true;},3400); }
window.addEventListener("resize",()=>{ if(curPage==="grafico") drawChart(); });
try{ matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>drawChart()); new MutationObserver(()=>drawChart()).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]}); }catch(e){}

/* ============ Indicadores do gráfico ============ */
function syncInd(){ $("indMM").checked=!!UI.ind.mm; $("indOV").checked=!!UI.ind.ov; $("legMM").hidden=!UI.ind.mm; $("legOV").hidden=!UI.ind.ov; }
["indMM","indOV"].forEach(id=>$(id).addEventListener("change",()=>{ UI.ind={mm:$("indMM").checked, ov:$("indOV").checked}; ls.set("radar-ui",UI); syncInd(); drawChart(); }));
syncInd();

/* ============ Janela flutuante ============
   Computador (Chrome/Edge 116+): Document Picture-in-Picture, uma mini janela HTML sempre por cima.
   Android e outros: um vídeo gerado de um canvas em modo imagem sobre imagem.
   Os navegadores só abrem essas janelas a partir de um toque do usuário. */
const Float={kind:null, win:null, video:null, canvas:null};
const hasDocPip = "documentPictureInPicture" in window;
const hasVidPip = !!(document.pictureInPictureEnabled && window.HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream);
const isStandalone = () => { try{ return matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone===true; }catch(e){ return false; } };
function floatInfo(r){
  const name=r.rc.name+" · "+C.MT[r.rc.tf];
  if(r.state==="op"){ const o=r.op, A=o.alert;
    const sub = A==="gale"? "GALE "+(o.gale+1)+": entre de novo com "+o.nextStakeTxt : A==="att"? "Atenção para o gale" : A==="risk"? "Contra a indicação, sem gale" : A==="galeOn"? "Gale "+o.gale+" em andamento" : (o.started?"Expira em ":"Entrada em ")+mmss(o.left);
    return {cls:o.dir, name, main:(o.dir==="buy"?"COMPRA ▲ ":"VENDA ▼ ")+o.sym, sub, hot:A==="gale"||A==="att"||A==="risk"}; }
  if(r.state==="pend") return {cls:"pending", name, main:"AGUARDE "+r.pend.sym, sub:"Confirmação em "+mmss(r.pend.left)};
  if(r.state==="result"){ const x=r.result; return {cls:x.kind==="draw"?"":x.kind, name, main:(x.kind==="win"?"WIN 🤑 ":x.kind==="loss"?"LOSS 😢 ":"EMPATE ")+x.sym, sub:x.gale?"no gale "+x.gale:"sem gale"}; }
  if(r.state==="skip") return {cls:"", name, main:"Analisando", sub:r.flash.sym+": entrada descartada"};
  if(r.running) return {cls:"", name, main:"Analisando "+r.active+(r.active===1?" ativo":" ativos"), sub:"Próxima vela em "+mmss(r.nextIn)};
  return {cls:"", name, main:"Parado", sub:"Abra o app e clique em Iniciar"};
}
function renderFloat(){
  if(!Float.kind||!vm) return;
  const rows=vm.robots.map(floatInfo);
  if(Float.kind==="doc" && Float.win){
    const d=Float.win.document, box=d.getElementById("fl"); if(!box) return; box.textContent="";
    rows.forEach((f,i)=>{ const r=d.createElement("div"); r.className="fl-r r"+(i+1)+(f.cls?" "+(f.cls==="pending"?"pending":f.cls):"");
      const n=d.createElement("div"); n.className="fl-n"; n.textContent=f.name;
      const m=d.createElement("div"); m.className="fl-m"; m.textContent=f.main;
      const s=d.createElement("div"); s.className="fl-s"+(f.hot?" hot":""); s.textContent=f.sub; r.append(n,m,s); box.append(r); });
  } else if(Float.kind==="video" && Float.canvas){
    const cv=Float.canvas, g=cv.getContext("2d"), W=cv.width, H=cv.height, half=H/2;
    const bg={buy:"#0e2f25", sell:"#3a1720", pending:"#3a2a10", win:"#0e2f25", loss:"#3a1720"}, fg={buy:"#22c98a", sell:"#ff5d68", pending:"#f5a524", win:"#22c98a", loss:"#ff5d68"};
    g.fillStyle="#080c14"; g.fillRect(0,0,W,H);
    rows.forEach((f,i)=>{ const y0=i*half;
      g.fillStyle=bg[f.cls]||"#111827"; g.fillRect(8,y0+8,W-16,half-16);
      g.fillStyle=i?"#f2a23a":"#38b6f5"; g.fillRect(8,y0+8,10,half-16);
      g.textBaseline="top"; g.fillStyle="#8b98b0"; g.font="700 26px system-ui,sans-serif"; g.fillText(f.name.toUpperCase(),34,y0+22);
      g.fillStyle=fg[f.cls]||"#e8edf6"; g.font="800 50px system-ui,sans-serif"; g.fillText(f.main,34,y0+58,W-60);
      g.fillStyle=f.hot?"#ff5d68":"#aeb9cc"; g.font=(f.hot?"700 ":"500 ")+"28px system-ui,sans-serif"; g.fillText(f.sub,34,y0+122,W-60); });
  }
  renderFloatBtn();
}
function renderFloatBtn(){
  const b=$("btnFloat"); b.textContent = Float.kind? "✕ Fechar janela flutuante" : "⧉ Janela flutuante";
  const h=$("floatHint"), running=vm&&vm.robots.some(r=>r.running);
  const show = !Float.kind && running && isStandalone() && (hasDocPip||hasVidPip);
  h.hidden=!show;
  if(show && !h.childNodes.length){ h.append(el("span",null,"⧉")); const d=el("div"); d.append(el("b",null,"Vai minimizar o app? "), document.createTextNode("Toque em Janela flutuante para continuar vendo as indicações e os resultados por cima das outras telas.")); h.append(d); }
}
function closeFloat(){
  if(Float.kind==="doc" && Float.win){ try{ Float.win.close(); }catch(e){} }
  if(Float.kind==="video"){ try{ if(document.pictureInPictureElement) document.exitPictureInPicture(); }catch(e){} }
  floatGone();
}
function floatGone(){
  if(Float.video){ try{ const st=Float.video.srcObject; st&&st.getTracks().forEach(t=>t.stop()); }catch(e){} Float.video.remove(); }
  Float.kind=null; Float.win=null; Float.video=null; Float.canvas=null; renderFloatBtn();
}
async function openFloat(){
  if(Float.kind){ closeFloat(); return; }
  if(hasDocPip){
    try{
      const w=await window.documentPictureInPicture.requestWindow({width:340, height:250});
      const d=w.document; d.title="Radar de Sinais";
      document.querySelectorAll("style").forEach(st=>{ const c=d.createElement("style"); c.textContent=st.textContent; d.head.append(c); });
      const th=document.documentElement.getAttribute("data-theme"); if(th) d.documentElement.setAttribute("data-theme",th);
      d.body.style.margin="0"; const box=d.createElement("div"); box.className="fl"; box.id="fl"; d.body.append(box);
      Float.win=w; Float.kind="doc"; w.addEventListener("pagehide",()=>{ if(Float.win===w) floatGone(); });
      renderFloat(); return;
    }catch(e){ if(!hasVidPip){ toast("Não foi possível abrir a janela flutuante: "+(e.message||e)); return; } }
  }
  if(hasVidPip){
    try{
      const cv=document.createElement("canvas"); cv.width=640; cv.height=360;
      const v=document.createElement("video"); v.muted=true; v.playsInline=true; v.setAttribute("playsinline",""); v.style.cssText="position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;bottom:0;right:0";
      document.body.append(v); Float.canvas=cv; Float.video=v; Float.kind="video"; renderFloat();
      v.srcObject=cv.captureStream(4); await v.play(); await v.requestPictureInPicture();
      v.addEventListener("leavepictureinpicture",()=>{ if(Float.video===v) floatGone(); });
      return;
    }catch(e){ floatGone(); toast("Não foi possível abrir a janela flutuante: "+(e.message||e)); return; }
  }
  infoModal("Janela flutuante", b=>{
    b.append(el("p",null,"Este navegador não oferece janela flutuante para sites e apps instalados."));
    b.append(el("p",null,"Funciona no Chrome e no Edge do computador e no Chrome do Android. No iPhone e no Firefox, use as notificações: com o servidor na nuvem você recebe sinal, gale, WIN e LOSS mesmo com o app fechado."));
  });
}
function maybeAutoFloat(){ if(UI.autoFloat!==false && isStandalone() && !Float.kind && (hasDocPip||hasVidPip)) openFloat(); }
$("btnFloat").addEventListener("click",()=>{ unlockAudio(); openFloat(); });
try{ if("mediaSession" in navigator) navigator.mediaSession.setActionHandler("enterpictureinpicture",()=>{ if(!Float.kind) openFloat(); }); }catch(e){}

/* ============ Início ============ */
async function boot(){
  buildRobots(); route();
  remote = await detectRemote();
  if(!remote){
    const saved=ls.get("radar-local-v4",null) || {cfg:ls.get("radar-sinais-v3",null)};
    engine=C.createEngine({cfg:saved.cfg, hist:saved.hist, log:saved.log, running:saved.running, demoMs:window.__RADAR_DEMO_MS, onChange:saveLocal});
    vm=engine.snapshot({c:selC}); render();
    await engine.init(); saveLocal();
  } else { await checkPush(); }
  await refresh();
  setInterval(refresh, remote? 1000 : 500);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refresh(); });
}
window.__radarUI={get vm(){return vm;}, get remote(){return remote;}, get float(){return Float.kind;}};
boot();
})();
