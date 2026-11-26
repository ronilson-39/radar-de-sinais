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
  const P=prep(candles), F=buildFeat(P), ST=buildStats(P,F,rc.expiry);
  const A={P,F,ST}; const n=candles.length;
  A.conf = evalStrategy(A,sym,n-2,n-1,rc);
  A.pend = evalStrategy(A,sym,n-1,null,rc);
  return A;
}

