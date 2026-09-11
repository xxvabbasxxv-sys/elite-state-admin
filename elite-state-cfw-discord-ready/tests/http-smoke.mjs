import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:3100';
async function check(path,options={}){return fetch(new URL(path,base),options)}
for(const path of ['/','/login','/reset-password']){
 const r=await check(path);assert.equal(r.status,200,path);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 const html=await r.text();assert(html.includes('lang="ar"'));assert(html.includes('dir="rtl"'));assert(!html.includes('DATABASE_URL'));assert(!html.includes('oai-authenticated-user'));console.log('PASS page',path);
}
for(const options of [{},{headers:{'oai-authenticated-user-id':'forged-owner','oai-authenticated-user-email':'forged@example.test'}}]){
 const r=await check('/api/admin',options);assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.json();assert(!body.me&&!body.items);console.log('PASS anonymous/forged identity denied');
}
let r=await check('/api/admin',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({action:'setup'})});assert.equal(r.status,401);console.log('PASS unauthenticated owner setup denied');
r=await check('/api/admin',{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.example'},body:'{"action":"setup"}'});assert.equal(r.status,403);console.log('PASS cross-origin write denied');
r=await check('/api/auth/logout',{method:'POST',headers:{origin:'https://attacker.example'}});assert.equal(r.status,403);console.log('PASS cross-origin logout denied');
r=await check('/auth/callback?next=https://attacker.example',{redirect:'manual'});assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location')).pathname,'/login');console.log('PASS invalid callback does not redirect off-site');
