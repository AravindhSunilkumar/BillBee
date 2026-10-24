import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import handler from './backend.js';
const root=path.resolve('public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api'||url.pathname==='/api/index'){await handler(req,res);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const bytes=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes);
 }catch{res.writeHead(404).end('Not found');}
});
const port=Number(process.env.PORT||4173);
const host=process.env.BILLBEE_HOST||'127.0.0.1';
server.listen(port,host,()=>console.log('BillBee is running at http://'+(host==='0.0.0.0'?'localhost':host)+':'+port));
