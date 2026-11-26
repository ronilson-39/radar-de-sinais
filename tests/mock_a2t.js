// Servidor falso da API2Trade, só para teste local
const http=require('http'); const px={}; let hits=0; const seen=new Set();
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'); hits++;
  if(req.headers['x-api-key']!=='K1'){ res.writeHead(401); return res.end('{}'); }
  if(u.pathname==='/GetQuote' && u.searchParams.get('id')==='ACC'){
    const s=u.searchParams.get('symbol'); seen.add(s);
    px[s]=(px[s]||1.1)*(1+(Math.random()-0.5)*0.0006);
    res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({symbol:s,bid:+px[s].toFixed(5),ask:+(px[s]+0.00002).toFixed(5)}));
  }
  if(u.pathname==='/stats'){ res.writeHead(200); return res.end(JSON.stringify({hits,seen:[...seen]})); }
  res.writeHead(404); res.end('{}');
}).listen(4001);
