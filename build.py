import os, shutil, json
os.chdir(os.path.dirname(os.path.abspath(__file__)))
eng = open('src/engine.js').read()
a = """  const P=prep(candles), F=buildFeat(P), ST=buildStats(P,F,rc.expiry);
  const A={P,F,ST}; const n=candles.length;"""
assert a in eng
eng = eng.replace(a, """  const n=candles.length;
  if(rc.strategy==="overlay"){ const P=prep(candles), O=ovCalc(candles,rc.ov), A={P,O}; A.OS=ovStats(P,O,rc.expiry); A.conf=ovEval(A,sym,n-1,true,rc); A.pend=ovEval(A,sym,n-1,false,rc); return A; }
  if(rc.strategy==="zigzag"){ const P=prep(candles), A={P, ZS:zzStats(P,rc.market,rc.expiry)}; A.conf=zzEval(A,sym,n-2,n-1,rc); A.pend=zzEval(A,sym,n-1,null,rc); return A; }
  const P=prep(candles), F=buildFeat(P), ST=buildStats(P,F,rc.expiry);
  const A={P,F,ST};""")
core = open('src/core_head.js').read() + eng + open('src/zigzag.js').read() + open('src/overlay.js').read() + open('src/core_runtime.js').read()
open('server/core.js', 'w').write(core)
head = open('src/head.html').read(); ui = open('src/ui.js').read()
safe = lambda s: s.replace('</script', '<\\/script')
scripts = "\n<script>\n" + safe(core) + "\n</script>\n<script>\n" + safe(ui) + "\n</script>\n"
open('radar-de-sinais.html', 'w').write(head + scripts)
i = head.index('<div class="app">')
top = head[:i].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
index = '''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Dois robôs educacionais de sinais para forex e opções binárias, com alertas, gale, resultados e notificações.">
<meta name="theme-color" content="#0b111b">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Radar">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:0}body{margin:0}img{max-width:100%}</style>
''' + top + '</head>\n<body>\n' + head[i:] + scripts + '</body>\n</html>\n'
manifest = json.load(open('src/icons/manifest.webmanifest'))
manifest['description'] = 'Dois robôs educacionais de sinais para forex e opções binárias.'
manifest['shortcuts'] = [{"name": "Agente", "url": "./#agente"}, {"name": "Gráfico", "url": "./#grafico"}, {"name": "Informações", "url": "./#informacoes"}]
for d in ['app', 'server/public']:
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    open(d + '/index.html', 'w').write(index)
    shutil.copy('src/sw.js', d + '/sw.js')
    json.dump(manifest, open(d + '/manifest.webmanifest', 'w'), ensure_ascii=False, indent=2)
    for f in ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png']:
        shutil.copy('src/icons/' + f, d + '/' + f)

print('ok', len(index))
