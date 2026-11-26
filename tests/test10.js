const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage();
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
 await pg.addInitScript(()=>localStorage.setItem('radar-pin','"1234"'));
 await pg.goto('http://localhost:3998/#grafico'); await pg.waitForTimeout(3000);
 console.log('titles', await pg.evaluate(()=>[0,1].map(i=>document.getElementById('ct'+i).textContent)));
 await pg.screenshot({path:'iq-graficos.png'});
 await pg.click('#btnCfg'); await pg.waitForTimeout(800);
 console.log('robot tab', (await pg.locator('#cfgRobot').innerText()).slice(0,700));
 await pg.screenshot({path:'iq-cfg.png'});
 console.log('closed tags', await pg.locator('#cfgRobot .closed').count(), 'disabled pays', await pg.locator('#cfgRobot input[type=number][disabled]').count());
 console.log('errs',errs.slice(0,8));
 await b.close();
})();
