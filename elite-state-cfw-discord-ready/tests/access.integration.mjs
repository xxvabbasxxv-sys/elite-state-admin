// Real PostgreSQL (PGlite), mocked Supabase/Next request cookies. No external accounts or data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const root=new URL('../',import.meta.url);
const pg=new PGlite();
const ids={owner:'111111111111111111',alice:'222222222222222222',bob:'333333333333333333',outsider:'444444444444444444',guild:'555555555555555555',staff:'666666666666666666',moderator:'777777777777777777',manager:'888888888888888888',serverOwner:'999999999999999999'};
const env={DATABASE_URL:'postgres://test-only',DISCORD_GUILD_ID:ids.guild,DISCORD_OWNER_ID:ids.owner,DISCORD_BOT_TOKEN:'test-only-bot',NEXT_PUBLIC_APP_URL:'https://elite.example.test',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-only'};
let user=null,hasCookie=false,authError=null,providerCalls=0,discordMode='ok',discordCalls=0;
const makeUser=(name)=>({id:'auth-'+name,email:name+'@example.test',identities:[{provider:'discord',id:ids[name],user_id:'auth-'+name,identity_data:{sub:ids[name]}}]});
const owner=makeUser('owner'),alice=makeUser('alice'),bob=makeUser('bob'),outsider=makeUser('outsider');
const memberships=new Map([[ids.owner,[]],[ids.alice,[ids.staff]],[ids.bob,[ids.moderator]],[ids.outsider,[]]]);
function actor(value){user=value;hasCookie=!!value;authError=null;discordMode='ok'}
async function discordFetch(url,options){
 discordCalls++;assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bot test-only-bot');assert.equal(options.redirect,'error');
 assert(url.startsWith('https://discord.com/api/v10/guilds/'+ids.guild+'/members/'));
 if(discordMode==='network')throw new Error('Network down');
 if(discordMode==='429')return Response.json({},{status:429});
 if(discordMode==='401')return Response.json({},{status:401});
 if(discordMode==='bad-json')return new Response('{',{status:200});
 const id=url.split('/').at(-1),roles=memberships.get(id);
 if(!roles)return Response.json({},{status:404});
 return Response.json({roles:discordMode==='bad-roles'?['invalid']:roles,pending:discordMode==='pending',user:{id:discordMode==='wrong-user'?ids.owner:id,username:'Discord '+id,bot:false}});
}
function wrap(executor){return {
 async unsafe(query,params){const result=await executor.query(query,params);return Object.assign(result.rows,{count:/^\s*SELECT\b/i.test(query)?result.rows.length:result.affectedRows})},
 async begin(callback){return pg.transaction(tx=>callback(wrap(tx)))}
}}
async function load(path,imports){
 const source=await readFile(new URL(path,root),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports','process','fetch',compiled)(name=>{if(!(name in imports))throw new Error('Unexpected import: '+name);return imports[name]},module,module.exports,{env},discordFetch);
 return module.exports;
}
const auth=await load('lib/supabase/server.ts',{
 'server-only':{},
 'next/headers':{cookies:async()=>({getAll:()=>hasCookie?[{name:'sb-test-auth-token',value:'mock-cookie'}]:[],set(){}})},
 '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>{providerCalls++;return {data:{user},error:authError}}}})}
});
const {database}=await load('lib/database.ts',{'server-only':{},postgres:()=>wrap(pg)});
const domain=await load('lib/domain.ts',{});
const discord=await load('lib/discord.ts',{'server-only':{}});
const requestSecurity=await load('lib/request-security.ts',{});
const route=await load('app/api/admin/route.ts',{'@/lib/database':{database},'@/lib/supabase/server':auth,'@/lib/domain':domain,'@/lib/request-security':requestSecurity,'@/lib/discord':discord});
async function call(method='GET',payload,options={}){
 const headers={...(method==='POST'?{'content-type':'application/json',origin:'https://elite.example.test'}:{}),...options.headers};
 const request=new Request('https://elite.example.test/api/admin'+(options.search||''),{method,headers,...(method==='POST'?{body:options.raw??JSON.stringify(payload)}:{})});
 const response=await route[method](request);
 assert.equal(response.headers.get('cache-control'),'no-store');
 return {status:response.status,data:await response.json()};
}
const post=(payload,options)=>call('POST',payload,options);
const expectStatus=(r,status)=>assert.equal(r.status,status,JSON.stringify(r.data));
const countAudit=async()=>Number((await pg.query('SELECT count(*) AS n FROM elite.audit')).rows[0].n);
const item=(kind,title,extra={})=>({action:'saveItem',kind,title,body:'Test details',category:'عام',status:kind==='rules'||kind==='announcements'?'draft':'open',audience:'all',priority:'normal',pinned:false,...extra});
let aliceMember,bobMember,report,announcement;

test('Elite State access and PostgreSQL integration',async t=>{
 try{
  await pg.exec(await readFile(new URL('database/001-initial.sql',root),'utf8'));
  await pg.exec(await readFile(new URL('database/002-discord.sql',root),'utf8'));
  await pg.exec(await readFile(new URL('database/002-discord.sql',root),'utf8'));
  await t.test('anonymous and forged legacy identity headers cannot access or bootstrap',async()=>{
   actor(null);const headers={'oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email};
   expectStatus(await call('GET',undefined,{headers}),401);
   expectStatus(await post({action:'setup'},{headers}),401);assert.equal(providerCalls,0);
  });
  await t.test('password-only, forged metadata, mismatched identity and provider errors are denied',async()=>{
   actor({...owner,identities:[],user_metadata:{provider:'discord',sub:ids.owner,role:'owner'}});expectStatus(await call(),401);
   actor({...owner,identities:[{provider:'discord',id:ids.owner,user_id:'wrong-user'}]});expectStatus(await call(),401);
   actor(owner);authError=new Error('Rejected session');expectStatus(await call(),401);
   actor({...outsider,identities:[{provider:'discord',id:ids.outsider,user_id:outsider.id,identity_data:{sub:ids.owner,provider_id:ids.owner}}]});expectStatus(await post({action:'setup'}),403);
  });
  await t.test('only protected Discord owner ID can initialize; unmapped ranks grant no access',async()=>{
   actor(outsider);expectStatus(await call(),403);expectStatus(await post({action:'setup'}),403);
   actor(owner);const ready=await call();expectStatus(ready,200);assert.equal(ready.data.setup,true);
   expectStatus(await post({action:'setup'}),200);expectStatus(await post({action:'setup'}),409);
   const mine=await call();assert.equal(mine.data.me.roleId,'owner');assert.equal(mine.data.permissions.length,domain.permissionKeys.length);
   assert(mine.data.roles.filter(r=>r.id!=='owner').every(r=>r.discordRoleId===null));
   actor(alice);expectStatus(await call(),403);expectStatus(await post({action:'join'}),403);
   actor(owner);
   for(const [id,discordRoleId] of [['staff',ids.staff],['moderator',ids.moderator],['manager',ids.manager]]){const role=mine.data.roles.find(r=>r.id===id);expectStatus(await post({...role,action:'saveRole',permissions:JSON.parse(role.permissions),discordRoleId}),200)}
  });
  await t.test('signup identity alone grants no data or membership',async()=>{
   actor(outsider);const r=await call();expectStatus(r,403);assert(!r.data.join);assert.equal(r.data.items,undefined);
   expectStatus(await post({action:'join'}),403);expectStatus(await post(item('reports','Forbidden')),403);
  });
  await t.test('current Discord roles authorize opt-in; membership binds protected IDs, not emails',async()=>{
   actor(alice);const ready=await call();expectStatus(ready,403);assert.equal(ready.data.join,true);
   expectStatus(await post({action:'join'}),200);expectStatus(await post({action:'join'}),403);
   aliceMember=(await call()).data.me;assert.equal(aliceMember.discordId,ids.alice);assert.equal(aliceMember.email,null);
   actor(bob);expectStatus(await post({action:'join'}),200);bobMember=(await call()).data.me;
  });
  await t.test('staff cannot self-promote, grant membership, publish or change settings',async()=>{
   actor(alice);
   expectStatus(await post({action:'saveRole',id:'staff',name:'Owner',permissions:['roles.manage']}),403);
   expectStatus(await post({action:'saveMember',name:'Bad',email:outsider.email,roleId:'owner'}),403);
   expectStatus(await post(item('announcements','Forbidden publish',{status:'published'})),403);
   expectStatus(await post({action:'settings',name:'Bad',discord:'',connect:''}),403);
  });
  await t.test('private directory exposes only referenced metadata without email/role',async()=>{
   actor(alice);const {data}=await call();assert.equal(data.members.length,1);assert.equal(data.members[0].id,aliceMember.id);
   assert.equal(data.members[0].email,undefined);assert.equal(data.members[0].roleId,undefined);assert.deepEqual(data.audit,[]);
  });
  await t.test('published audience rules and drafts are filtered on server',async()=>{
   actor(owner);
   expectStatus(await post(item('announcements','Owner draft')),200);
   expectStatus(await post(item('announcements','Manager only',{status:'published',audience:['manager']})),200);
   const shared=await post(item('announcements','Shared',{status:'published'}));expectStatus(shared,200);announcement=shared.data.id;
   actor(alice);const rows=(await call()).data.items;assert.equal(rows.length,1);assert.equal(rows[0].title,'Shared');
   expectStatus(await post({action:'comment',id:announcement,body:'No'}),404);
  });
  await t.test('report CRUD, assignment scope, internal comments and foreign rows are guarded',async()=>{
   actor(alice);const created=await post(item('reports','Alice report'));expectStatus(created,200);report=created.data.id;
   expectStatus(await post(item('reports','Invalid assignment',{assignee:bobMember.id})),403);
   expectStatus(await post({action:'comment',id:report,body:'Alice public reply'}),200);
   expectStatus(await post({action:'comment',id:report,body:'Hidden?',internal:true}),403);
   actor(bob);expectStatus(await post({action:'comment',id:report,body:'Management only',internal:true}),200);
   expectStatus(await post(item('reports','Bob private report')),200);
   const internal=await call('GET',undefined,{search:'?comments='+report});assert.equal(internal.data.length,2);
   const foreign=(await call()).data.items.find(i=>i.title==='Bob private report');
   actor(alice);const own=await call();assert(!own.data.items.some(i=>i.id===foreign.id));
   const publicComments=await call('GET',undefined,{search:'?comments='+report});assert.equal(publicComments.data.length,1);assert.equal(publicComments.data[0].internal,0);
   expectStatus(await call('GET',undefined,{search:'?comments='+foreign.id}),404);
  });
  await t.test('optimistic versions reject stale writes without extra audit',async()=>{
   actor(owner);let original=(await call()).data.items.find(i=>i.id===announcement);
   expectStatus(await post({...original,action:'saveItem',title:'Shared updated'}),200);
   const before=await countAudit();expectStatus(await post({...original,action:'saveItem',title:'Stale'}),409);assert.equal(await countAudit(),before);
   let latest=(await call()).data.items.find(i=>i.id===announcement);assert.equal(latest.title,'Shared updated');assert.equal(latest.version,2);
   expectStatus(await post({...latest,action:'saveItem',status:'archived'}),200);
   actor(alice);assert(!(await call()).data.items.some(i=>i.id===announcement));
   actor(owner);latest=(await call()).data.items.find(i=>i.id===announcement);expectStatus(await post({...latest,action:'saveItem',status:'published'}),200);
  });
  await t.test('adapter stale atomic mutation skips audit and failed batch rolls back',async()=>{
   const before=await countAudit();
   const result=await database.writeAndAudit(database.prepare('UPDATE items SET title=? WHERE id=? AND version=?').bind('Invalid',announcement,-1),database.prepare('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind('should-not-exist','x','x','x','x'));
   assert.equal(result[0].meta.changes,0);assert.equal(await countAudit(),before);
   await assert.rejects(database.batch([database.prepare('INSERT INTO roles(id,name,permissions) VALUES(?,?,?)').bind('rollback-test','Temp','[]'),database.prepare('INSERT INTO roles(id,name,permissions) VALUES(?,?,?)').bind('owner','Duplicate','[]')]));
   assert.equal(await database.prepare('SELECT id FROM roles WHERE id=?').bind('rollback-test').first(),null);
  });
  await t.test('owner role cannot be altered and revoked members lose access on next request',async()=>{
   actor(owner);const data=(await call()).data;
   expectStatus(await post({action:'saveRole',id:'owner',name:'Bad',permissions:[]}),403);
   expectStatus(await post({action:'saveMember',id:data.me.id,name:'Bad',roleId:'staff',active:false}),403);
   expectStatus(await post({action:'saveMember',id:aliceMember.id,name:'Alice',active:false}),200);
   actor(alice);expectStatus(await call(),403);expectStatus(await post({action:'comment',id:report,body:'After revocation'}),403);
  });
  await t.test('revoked local access cannot be bypassed with join, email or rank changes',async()=>{
   actor(alice);expectStatus(await post({action:'join'}),403);
   actor(owner);expectStatus(await post({action:'saveMember',id:aliceMember.id,name:'Alice',active:true,roleId:'owner'}),400);
   expectStatus(await post({action:'saveMember',id:aliceMember.id,name:'Alice',active:true}),200);
   actor(alice);expectStatus(await call(),200);
  });
  await t.test('role removal denies the very next request; restoring it restores eligible access',async()=>{
   actor(alice);memberships.set(ids.alice,[]);const denied=await call();expectStatus(denied,403);assert.equal(denied.data.items,undefined);
   expectStatus(await post({action:'comment',id:report,body:'After removal'}),403);
   memberships.set(ids.alice,[ids.staff]);expectStatus(await call(),200);
  });
  await t.test('highest matching priority wins without combining permissions; downgrade is enforced',async()=>{
   actor(alice);memberships.set(ids.alice,[ids.staff,ids.moderator]);let r=await call();expectStatus(r,200);assert.equal(r.data.me.roleId,'moderator');
   assert(!r.data.permissions.includes('roles.manage'));assert(!r.data.permissions.includes('announcements.publish'));
   memberships.set(ids.alice,[ids.staff]);r=await call();assert.equal(r.data.me.roleId,'staff');assert(!r.data.permissions.includes('reports.view_all'));
  });
  await t.test('Discord outage, rate limits, missing member and pending membership fail closed',async()=>{
   actor(alice);
   for(const mode of ['network','429','401','bad-json','bad-roles','wrong-user']){discordMode=mode;const r=await call();expectStatus(r,503);assert.equal(r.data.items,undefined)}
   discordMode='pending';expectStatus(await call(),403);discordMode='ok';
   memberships.delete(ids.alice);expectStatus(await call(),403);memberships.set(ids.alice,[ids.staff]);
  });
  await t.test('everyone, duplicate Discord role IDs and owner-only capabilities cannot be mapped',async()=>{
   actor(owner);const role=(await call()).data.roles.find(r=>r.id==='staff'),payload={...role,action:'saveRole',permissions:JSON.parse(role.permissions)};
   expectStatus(await post({...payload,discordRoleId:ids.guild}),400);
   expectStatus(await post({...payload,discordRoleId:ids.moderator}),409);
   expectStatus(await post({...payload,permissions:['staff.manage']}),400);
   expectStatus(await post({...payload,permissions:['roles.manage']}),400);
   expectStatus(await post({...payload,priority:10001}),400);
  });
  await t.test('Discord role named Owner never transfers site ownership',async()=>{
   actor(owner);const role=(await call()).data.roles.find(r=>r.id==='server_owner');
   expectStatus(await post({...role,action:'saveRole',permissions:JSON.parse(role.permissions),discordRoleId:ids.serverOwner}),200);
   memberships.set(ids.outsider,[ids.serverOwner]);actor(outsider);expectStatus(await post({action:'join'}),200);
   const r=await call();assert.equal(r.data.me.roleId,'server_owner');assert(r.data.permissions.includes('announcements.publish'));assert(!r.data.permissions.includes('roles.manage'));
   expectStatus(await post({action:'saveRole',id:'staff',name:'Bad',permissions:[],priority:0,discordRoleId:''}),403);
   expectStatus(await post({action:'saveMember',id:aliceMember.id,name:'Bad',active:false}),403);
  });
  await t.test('Discord identifiers are checked every API call; the bot token is never returned',async()=>{
   actor(alice);const before=discordCalls;const one=await call(),two=await call();expectStatus(one,200);expectStatus(two,200);assert.equal(discordCalls-before,2);
   assert(!JSON.stringify(one.data).includes(env.DISCORD_BOT_TOKEN));
  });
  await t.test('malformed JSON, cross-origin writes and oversized requests fail safely',async()=>{
   assert(requestSecurity.isSameOrigin(new Request('http://internal:3000',{headers:{origin:env.NEXT_PUBLIC_APP_URL}})));
   assert(!requestSecurity.isSameOrigin(new Request('https://attacker.example',{headers:{origin:'https://attacker.example'}})));
   actor(owner);
   expectStatus(await post(null),400);expectStatus(await post([]),400);expectStatus(await post({}, {raw:'{' }),400);
   expectStatus(await post({action:'settings'},{headers:{origin:'https://attacker.example'}}),403);
   expectStatus(await post({}, {headers:{'content-type':'text/plain'}}),415);
   expectStatus(await post({action:'x',body:'x'.repeat(51000)}),413);
   expectStatus(await post({action:'unknown'}),400);
  });
  await t.test('schema denies public-role data and parameter binding preserves literal text',async()=>{
   await pg.exec('CREATE ROLE test_public; SET ROLE test_public');
   await assert.rejects(pg.query('SELECT * FROM elite.members'),/permission denied/i);
   await pg.exec('RESET ROLE');
   actor(owner);const hostile="Text ' ; DROP TABLE elite.items; --";
   expectStatus(await post(item('rules',hostile)),200);assert((await call()).data.items.some(i=>i.title===hostile));
   await assert.rejects(database.prepare('SELECT 1; SELECT 2').all(),/one prepared statement/);
  });
 }finally{await pg.close()}
});
