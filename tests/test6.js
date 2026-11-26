const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage();
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
 const html=fs.readFileSync('radar.html','utf8');
 fs.writeFileSync('local.html','<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>window.__RADAR_DEMO_MS=8000</script>'+html+'</body></html>');
 await pg.goto('file://'+process.cwd()+'/local.html'); await pg.waitForTimeout(2500);
 await pg.screenshot({path:'b-inicio.png'});
 await pg.click('#btnCfg'); await pg.waitForTimeout(300);
 await pg.selectOption('#cr1-st','overlay');
 await pg.click('#cfgRobot .chips button:nth-child(2)'); await pg.click('text=Marcar todos'); await pg.waitForTimeout(200);
 await pg.screenshot({path:'b-cfg-r1.png'});
 await pg.click('#cfgRobot .chips button:nth-child(1)'); await pg.click('text=Desmarcar todos');
 await pg.click('#cfgTabs button:nth-child(2)');
 await pg.click('#cfgRobot .chips button:nth-child(3)'); await pg.click('text=Marcar todos');
 await pg.fill('#cfgRobot .row-add input','AMD'); await pg.click('#cfgRobot .row-add button');
 await pg.screenshot({path:'b-cfg-r2.png'});
 await pg.click('#cfgTabs button:nth-child(3)'); await pg.selectOption('#source','demo'); await pg.screenshot({path:'b-cfg-g.png'});
 await pg.click('#cfgSave'); await pg.waitForTimeout(2500);
 console.log('cfg', JSON.stringify(await pg.evaluate(()=>window.__radarUI.vm.cfg.robots.map(r=>[r.strategy,r.market,r.pairs]))));
 await pg.goto(pg.url().split('#')[0]+'#agente'); await pg.waitForTimeout(500);
 for(const r of await pg.$$('#robots .run')) await r.click();
 const seen={}; let shot=0;
 for(let i=0;i<25;i++){ await pg.waitForTimeout(1000); const st=await pg.evaluate(()=>window.__radarUI.vm.robots.map(r=>r.state)); st.forEach(s=>seen[s]=(seen[s]||0)+1);
   if(st.includes('result') && shot<1){ shot++; await pg.screenshot({path:'b-agente-result.png'}); }
   if(i===15) await pg.screenshot({path:'b-agente.png'}); }
 console.log(JSON.stringify(seen));
 await pg.click('#btnFloat'); await pg.waitForTimeout(1000); console.log('float', await pg.evaluate(()=>window.__radarUI.float));
 await pg.goto(pg.url().split('#')[0]+'#grafico'); await pg.waitForTimeout(1200); await pg.screenshot({path:'b-grafico.png'});
 await pg.setViewportSize({width:375,height:812});
 for(const p of ['inicio','agente','grafico']){ await pg.goto(pg.url().split('#')[0]+'#'+p); await pg.waitForTimeout(900); console.log(p,'scrollW',await pg.evaluate(()=>document.documentElement.scrollWidth)); }
 await pg.evaluate(()=>document.getElementById('btnCfg').click()); await pg.waitForTimeout(300); await pg.screenshot({path:'m-cfg.png'});
 console.log('hist',JSON.stringify(await pg.evaluate(()=>window.__radarUI.vm.hist.slice(0,6).map(h=>h.sym+' '+h.setup+' '+h.result))));
 console.log('errs',errs.slice(0,8));
 await b.close();
})();
