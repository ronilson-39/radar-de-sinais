
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
