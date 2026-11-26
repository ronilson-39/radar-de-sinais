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
