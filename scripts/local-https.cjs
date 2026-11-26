// LAN-only development gateway. Never use with a production upstream.
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const certificates = path.join(__dirname, '../certificates');
const server = https.createServer({
  key: fs.readFileSync(path.join(certificates, 'phone-key.pem')),
  cert: fs.readFileSync(path.join(certificates, 'phone.pem')),
}, (req, res) => {
  if (req.url === '/local-camera-ca.cer') {
    res.writeHead(200, {'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="QNU-Local-Camera.cer"'});
    return fs.createReadStream(path.join(certificates,'rootCA.der')).pipe(res);
  }
  const auth = /^\/(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|emulator\/auth)\//.test(req.url);
  const firestore = /^\/(google\.firestore\.v1\.Firestore\/|v1\/projects\/demo-webdtntn\/)/.test(req.url);
  const port = auth ? 9099 : firestore ? 8185 : 3001;
  const headers = {...req.headers, host:`127.0.0.1:${port}`, 'x-forwarded-proto':'https', 'x-forwarded-host':req.headers.host||''};
  const upstream = http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers}, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local test server or Firebase emulator is not running.');});
  req.on('aborted',()=>upstream.destroy()); req.pipe(upstream);
});
// Next dev waits for its HMR transport during client startup. Forward upgrades
// as well as ordinary HTTP requests so React can hydrate over this gateway.
server.on('upgrade', (req, socket, head) => {
  const upstream = http.request({hostname:'127.0.0.1',port:3001,path:req.url,headers:{...req.headers,host:'127.0.0.1:3001','x-forwarded-proto':'https'}});
  upstream.on('upgrade', (res, peer, peerHead) => {
    socket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n` + Object.entries(res.headers).map(([key,value])=>`${key}: ${value}\r\n`).join('') + '\r\n');
    if (head.length) peer.write(head);
    if (peerHead.length) socket.write(peerHead);
    peer.pipe(socket); socket.pipe(peer);
    peer.on('error',()=>socket.destroy()); socket.on('error',()=>peer.destroy());
  });
  upstream.on('response',()=>socket.destroy());
  upstream.on('error',()=>socket.destroy());
  upstream.end();
});
fetch('http://127.0.0.1:3001/api/test-environment').then(async r => {
  if (!r.ok || !(await r.json()).localTest) throw Error('Start npm run dev:test first. Only the local demo emulator is allowed.');
  server.listen(3443,'0.0.0.0',()=>{
    // Print every LAN address; the certificate must list the one the phone uses (certificates/phone.ext).
    const lan=Object.values(require('node:os').networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a.address);
    for(const ip of lan)console.log(`Phone test web: https://${ip}:3443 (trusted local CA required)`);
  });
}).catch(error=>{console.error(error.message);process.exitCode=1;});
