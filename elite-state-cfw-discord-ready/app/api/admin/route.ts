import {database} from '@/lib/database';
import {getAuthenticatedUser,type AuthenticatedUser} from '@/lib/supabase/server';
import {discordConfig,getDiscordMember,isDiscordId,DiscordFailure} from '@/lib/discord';
import {isSameOrigin} from '@/lib/request-security';
import {discordPresets,permissionKeys,statuses,modules,type Item,type Member,type Role} from '@/lib/domain';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
class Failure extends Error{constructor(public status:number,message:string){super(message)}}
function fail(status:number,message:string):never{throw new Failure(status,message)}
const db=()=>database;
const stmt=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
const all=async<T,>(sql:string,...args:any[])=>(await stmt(sql,...args).all<T>()).results;
const first=async<T,>(sql:string,...args:any[])=>await stmt(sql,...args).first<T>();
const memberSQL='SELECT id,user_id AS userId,email,name,role_id AS roleId,active,expires_at AS expiresAt,discord_id AS discordId,last_verified_at AS lastVerifiedAt FROM members';
const roleSQL='SELECT id,name,permissions,discord_role_id AS discordRoleId,priority FROM roles';
const settingsSQL='SELECT owner_id AS ownerId,owner_discord_id AS ownerDiscordId FROM settings WHERE id=1';
type Ownership={ownerId:string;ownerDiscordId:string|null};
const itemSQL='SELECT id,kind,title,body,category,status,audience,pinned,priority,assignee,due,created_by AS createdBy,created_at AS createdAt,updated_at AS updatedAt,version FROM items';
async function identity(){return (await getAuthenticatedUser())??fail(401,'سجّل دخولك بواسطة Discord أولًا.')}
async function effectiveRole(user:AuthenticatedUser,guild:Awaited<ReturnType<typeof getDiscordMember>>,ownership:Ownership){
 if(!ownership.ownerDiscordId)fail(503,'تحتاج ملكية النسخة القديمة إلى ترحيل صريح قبل تفعيل دخول Discord.');
 if(user.userId===ownership.ownerId&&user.discordId===ownership.ownerDiscordId){
  return await first<Role>(roleSQL+' WHERE id=?','owner')??fail(503,'رتبة المالك غير متاحة.');
 }
 if(user.discordId===ownership.ownerDiscordId||user.userId===ownership.ownerId)fail(403,'هوية المالك غير متطابقة. تواصل مع مسؤول الاستضافة.');
 const roles=await all<Role>(roleSQL+' WHERE id<>? ORDER BY priority DESC,id','owner');
 return roles.find(r=>r.discordRoleId&&guild.roles.includes(r.discordRoleId))??fail(403,'لا تملك رتبة Discord المسموحة للدخول إلى هذه اللوحة.');
}
async function access(user:AuthenticatedUser){
 const me=await first<Member>(memberSQL+' WHERE user_id=?',user.userId);
 if(!me?.active||me.discordId!==user.discordId)fail(403,'حسابك غير مرتبط بـDiscord أو تم إيقافه من اللوحة.');
 const ownership=await first<Ownership>(settingsSQL)??fail(403,'لم يتم تأسيس اللوحة بعد.');
 const guild=await getDiscordMember(user.discordId);
 const role=await effectiveRole(user,guild,ownership);
 if(me.roleId==='owner'&&role.id!=='owner')fail(403,'هوية المالك غير متطابقة.');
 const now=new Date().toISOString();
 const update=stmt('UPDATE members SET role_id=?,last_verified_at=? WHERE id=? AND user_id=? AND discord_id=? AND active=1',role.id,now,me.id,user.userId,user.discordId);
 const changed=me.roleId!==role.id;
 const result=changed?(await db().writeAndAudit(update,stmt('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),me.name,'مزامنة رتبة Discord',role.name,now)))[0]:await update.run();
 if(!result.meta.changes)fail(403,'تم إيقاف الحساب أو تغيير عضويته. أعد تسجيل الدخول.');
 const permissions:string[]=role.id==='owner'?permissionKeys:JSON.parse(role.permissions);
 return {user,me:{...me,roleId:role.id,lastVerifiedAt:now},permissions,can:(p:string)=>permissions.includes(p)};
}
type Access=Awaited<ReturnType<typeof access>>;
function visible(a:Access,i:Item){
 if(!a.can(i.kind+'.view'))return false;
 if(i.kind==='rules'||i.kind==='announcements'){
  if(a.can(i.kind+'.publish'))return true;
  if(i.createdBy===a.me.id&&a.can(i.kind+'.edit')&&i.status!=='archived')return true;
  return i.status==='published'&&(i.audience==='all'||JSON.parse(i.audience).includes(a.me.roleId));
 }
 return a.can(i.kind+'.view_all')||i.createdBy===a.me.id||i.assignee===a.me.id;
}
function textValue(v:unknown,max:number,required=true){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(400,'تحقّق من الحقول المطلوبة وطول النص.');return (v as string).trim()}
function audit(a:Access,action:string,target:string){return stmt('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),a.me.name,action,target,new Date().toISOString())}
function checkedURL(v:unknown,kind:string){const s=textValue(v,500,false);if(!s)return '';try{const u=new URL(s);if(u.protocol!=='https:')fail(400,'استخدم رابط HTTPS آمنًا.');if(kind==='discord'&&!['discord.gg','discord.com'].includes(u.hostname))fail(400,'أدخل رابط Discord صحيحًا.');if(kind==='connect'&&u.hostname!=='cfx.re')fail(400,'أدخل رابط الانضمام من cfx.re.');return u.href}catch(e){if(e instanceof Failure)throw e;return fail(400,'الرابط غير صالح.')}}
// Only fixed diagnostic codes may reach logs. Never log an Error object, message,
// stack, connection URL, request, identity, query, or environment values.
const diagnosticCodes=new Set(['28P01','28000','3D000','3F000','42P01','42703','42501','53300','57P01','08001','08006','08P01','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','CONNECT_TIMEOUT','CONNECTION_CLOSED','CONNECTION_DESTROYED','ERR_INVALID_URL','ERR_INVALID_ARG_TYPE','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID']);
for(const code of ['XX000','53200','53400','57P03','57014','42601','SASL_SIGNATURE_MISMATCH','UNDEFINED_VALUE','NOT_TAGGED_CALL','UNSAFE_TRANSACTION','MAX_PARAMETERS_EXCEEDED','ERR_SSL_WRONG_VERSION_NUMBER','ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR','ERR_TLS_HANDSHAKE_TIMEOUT','CERT_NOT_YET_VALID'])diagnosticCodes.add(code);
function diagnosticCode(error:unknown){
 let current=error;
 for(let depth=0;depth<3&&current&&typeof current==='object';depth++){
 const pending:unknown[]=[error],seen=new Set<object>();
 let fallback='UNCLASSIFIED_ERROR';
 for(let inspected=0;pending.length&&inspected<8;inspected++){
  const current=pending.shift();
  if(!current||typeof current!=='object'||seen.has(current))continue;
  seen.add(current);
  // Inspect text only to choose a fixed label; never return any part of it.
  const message='message' in current&&typeof current.message==='string'?current.message:'';
  if(current instanceof URIError)return 'URL_PERCENT_ENCODING_INVALID';
  if(message==='لم يتم إعداد قاعدة البيانات.')return 'DATABASE_URL_MISSING';
  if(/tenant or user not found/i.test(message))return 'POOLER_TENANT_OR_USER_NOT_FOUND';
  if(/circuit breaker/i.test(message))return 'POOLER_CIRCUIT_BREAKER';
  if(/wrong password|password authentication failed/i.test(message))return 'DATABASE_PASSWORD_REJECTED';
  if(/not in tenant allow_list|no pg_hba.conf entry/i.test(message))return 'DATABASE_NETWORK_ACCESS_DENIED';
  if(/ssl connection is required/i.test(message))return 'DATABASE_SSL_REQUIRED';
  if(/does not support ssl/i.test(message))return 'DATABASE_SSL_UNSUPPORTED';
  if(/max client connections reached|maxclientsinsessionmode/i.test(message))return 'POOLER_CONNECTION_LIMIT';
  const code='code' in current?current.code:undefined;
  if(typeof code==='string'&&diagnosticCodes.has(code))return code;
  current='cause' in current?current.cause:undefined;
  if(current instanceof TypeError)fallback='TYPE_ERROR';
  if(current instanceof RangeError)fallback='RANGE_ERROR';
  if('cause' in current)pending.push(current.cause);
  if(current instanceof AggregateError)pending.push(...current.errors.slice(0,4));
 }
 return error instanceof DiscordFailure?'DISCORD_FAILURE':error instanceof Failure?'APP_FAILURE':'UNCLASSIFIED_ERROR';
 return error instanceof DiscordFailure?'DISCORD_FAILURE':error instanceof Failure?'APP_FAILURE':fallback;
}
function responseError(e:unknown,stage='post_request'){
 const conflict=!!e&&typeof e==='object'&&'code' in e&&e.code==='23505';
 const status=conflict?409:(e instanceof Failure||e instanceof DiscordFailure)?e.status:500;
 if(status>=500)console.error('[elite-admin]',JSON.stringify({stage,code:diagnosticCode(e)}));
 return Response.json({error:conflict?'تعارض في العضوية أو ربط الرتبة. حدّث الصفحة وحاول مجددًا.':(e instanceof Failure||e instanceof DiscordFailure)?e.message:'تعذّر إتمام العملية. لم يتم تأكيد الحفظ، حاول مرة أخرى.'},{status,headers});
}
export async function GET(request:Request){let stage='identity';try{
 const user=await identity();
 stage='settings_query';
 const configured=await first<Ownership>(settingsSQL);
 if(!configured){
  stage='bootstrap_discord';
  if(user.discordId!==discordConfig().ownerId)fail(403,'بانتظار تأسيس اللوحة بواسطة المالك.');
  await getDiscordMember(user.discordId);
  return Response.json({setup:true},{headers});
 }
 stage='member_query';
 const existing=await first<Member>(memberSQL+' WHERE user_id=?',user.userId);
 if(!existing){
  stage='role_check';
  await effectiveRole(user,await getDiscordMember(user.discordId),configured);
  return Response.json({join:true,error:'رتبتك مؤهلة. اضغط تفعيل العضوية للانضمام إلى اللوحة.'},{status:403,headers});
 }
 stage='access_check';
 const a=await access(user);
 stage='read_data';
 const query=new URL(request.url).searchParams;
 if(query.has('comments')){
  const i=await first<Item>(itemSQL+' WHERE id=?',query.get('comments'));
  if(!i||!visible(a,i))fail(404,'السجل غير موجود أو غير متاح.');
  const rows=await all('SELECT id,body,internal,actor,created_at AS createdAt FROM comments WHERE item_id=? '+(a.can(i.kind+'.view_all')?'':'AND internal=0 ')+'ORDER BY created_at',i.id);
  return Response.json(rows,{headers});
 }
 const items=(await all<Item>(itemSQL+' ORDER BY pinned DESC,updated_at DESC')).filter(i=>visible(a,i));
 const settings=await first('SELECT name,discord,connect FROM settings WHERE id=1');
 const roles=await all<Role>(roleSQL+' ORDER BY priority DESC,name');
 const members=await all<Member>(memberSQL+' ORDER BY name');
 const directory=a.can('staff.view')||a.can('staff.manage');
 const assignment=a.can('reports.view_all')||a.can('tasks.view_all');
 const referenced=new Set([a.me.id,...items.flatMap(i=>[i.createdBy,i.assignee].filter(Boolean))]);
 const visibleMembers=members.filter(m=>directory||referenced.has(m.id)||(assignment&&m.active));
 return Response.json({me:a.me,permissions:a.permissions,items,settings,roles:roles.map(r=>a.can('roles.manage')?r:{id:r.id,name:r.name,permissions:'[]'}),members:visibleMembers.map(m=>a.me.roleId==='owner'?m:directory?{id:m.id,name:m.name,roleId:m.roleId,active:m.active}:{id:m.id,name:m.name,active:m.active}),audit:a.can('audit.view')?await all('SELECT id,actor,action,target,created_at AS createdAt FROM audit ORDER BY created_at DESC LIMIT 100'):[]},{headers});
 }catch(e){return responseError(e,stage)}}
export async function POST(request:Request){try{
 if(!isSameOrigin(request))fail(403,'الطلب من مصدر غير مسموح.');
 if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'نوع الطلب غير مدعوم.');
 const raw=await request.text();if(raw.length>50000)fail(413,'حجم الطلب كبير جدًا.');
 let b:any;try{b=JSON.parse(raw)}catch{fail(400,'الطلب غير صالح.')}
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.action!=='string')fail(400,'الطلب غير صالح.');
 const user=await identity();const now=new Date().toISOString();
 if(b.action==='setup'){
  if(await first('SELECT id FROM settings WHERE id=1'))fail(409,'تم إعداد اللوحة مسبقًا.');
  if(user.discordId!==discordConfig().ownerId)fail(403,'تأسيس اللوحة متاح لحساب Discord الخاص بالمالك فقط.');
  const guild=await getDiscordMember(user.discordId),id=crypto.randomUUID();
  await db().batch([
   stmt('INSERT INTO settings(id,owner_id,owner_discord_id,name) VALUES(1,?,?,?)',user.userId,user.discordId,'Elite State CFW'),
   stmt('INSERT INTO roles(id,name,permissions,priority) VALUES(?,?,?,?)','owner','مالك الموقع',JSON.stringify(permissionKeys),10000),
   ...discordPresets.map(r=>stmt('INSERT INTO roles(id,name,permissions,priority) VALUES(?,?,?,?)',r.id,r.name,JSON.stringify(r.permissions),r.priority)),
   stmt('INSERT INTO members(id,user_id,discord_id,email,name,role_id,active,last_verified_at) VALUES(?,?,?,?,?,?,1,?)',id,user.userId,user.discordId,null,guild.name,'owner',now),
   stmt('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),guild.name,'تأسيس لوحة Discord','Elite State CFW',now)
  ]);return Response.json({ok:true},{headers});
 }
 if(b.action==='join'){
  const ownership=await first<Ownership>(settingsSQL)??fail(403,'لم يتم تأسيس اللوحة بعد.');
  if(await first('SELECT id FROM members WHERE user_id=? OR discord_id=?',user.userId,user.discordId))fail(403,'الحساب مرتبط مسبقًا أو موقوف. راجع المالك.');
  const guild=await getDiscordMember(user.discordId),role=await effectiveRole(user,guild,ownership),id=crypto.randomUUID();
  // Never adopt a legacy invite based on email; the verified Discord identity and current role are authoritative.
  await db().writeAndAudit(stmt('INSERT INTO members(id,user_id,discord_id,email,name,role_id,active,last_verified_at) VALUES(?,?,?,?,?,?,1,?)',id,user.userId,user.discordId,null,guild.name,role.id,now),stmt('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),guild.name,'تفعيل عضوية Discord',role.name,now));
  return Response.json({ok:true},{headers});
 }
 const a=await access(user);const requirePermission=(p:string)=>{if(!a.can(p))fail(403,'ليس لديك صلاحية لتنفيذ هذه العملية.')};
 if(b.action==='saveItem'){
  const kind=b.kind as keyof typeof modules;if(typeof kind!=='string'||!Object.hasOwn(modules,kind))fail(400,'القسم غير صحيح.');
  const existing=b.id?await first<Item>(itemSQL+' WHERE id=?',b.id):null;
  if(b.id&&(!existing||existing.kind!==kind||!visible(a,existing)))fail(404,'السجل غير متاح.');
  requirePermission(kind+(existing?'.edit':'.create'));
  const status=textValue(b.status,30);if(!Object.hasOwn(statuses[kind],status))fail(400,'الحالة غير صالحة.');
  const content=kind==='rules'||kind==='announcements';
  if(content&&(status==='published'||existing?.status==='published'||b.pinned))requirePermission(kind+'.publish');
  if(status==='archived'||existing?.status==='archived')requirePermission(kind+'.archive');
  if(existing&&existing.version!==b.version)fail(409,'تم تعديل السجل من شخص آخر. حدّث الصفحة قبل الحفظ.');
  let audience='all';if(content&&b.audience!=='all'){if(!Array.isArray(b.audience)||!b.audience.length||b.audience.length>20)fail(400,'اختر رتبة واحدة على الأقل.');const rs=await all<Role>(roleSQL);if(b.audience.some((x:unknown)=>!rs.some(r=>r.id===x)))fail(400,'الرتبة غير موجودة.');audience=JSON.stringify(b.audience);}
  let assignee=content?null:(b.assignee||null);if(assignee){if(typeof assignee!=='string'||!await first('SELECT id FROM members WHERE id=? AND active=1',assignee))fail(400,'الإداري المعيّن غير متاح.');}
  if(!content&&!a.can(kind+'.view_all')){if(assignee&&assignee!==a.me.id)fail(403,'لا يمكنك إسناد السجل إلى شخص آخر.');if(existing)assignee=existing.assignee;}
  const due=kind==='tasks'&&b.due?textValue(b.due,10):null;if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||Number.isNaN(Date.parse(due))))fail(400,'التاريخ غير صالح.');
  const title=textValue(b.title,160),body=textValue(b.body,12000),category=textValue(b.category||'عام',80),priority=['normal','high','urgent'].includes(b.priority)?b.priority:'normal',id=existing?.id??crypto.randomUUID(),pin=content&&b.pinned?1:0;
  const mutation=existing?stmt('UPDATE items SET title=?,body=?,category=?,status=?,audience=?,pinned=?,priority=?,assignee=?,due=?,updated_at=?,version=version+1 WHERE id=? AND version=?',title,body,category,status,audience,pin,priority,assignee,due,now,id,b.version):stmt('INSERT INTO items(id,kind,title,body,category,status,audience,pinned,priority,assignee,due,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',id,kind,title,body,category,status,audience,pin,priority,assignee,due,a.me.id,now,now);
  // Keep the version check and audit in one PostgreSQL transaction.
  const log=stmt('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),a.me.name,existing?'تعديل سجل':'إنشاء سجل',title,now);
  const result=await db().writeAndAudit(mutation,log);if(!result[0].meta.changes)fail(409,'تغيّر السجل. حدّث الصفحة وحاول مجددًا.');return Response.json({ok:true,id},{headers});
 }
 if(b.action==='comment'){
  const i=await first<Item>(itemSQL+' WHERE id=?',b.id);if(!i||!visible(a,i)||!['reports','tasks'].includes(i.kind))fail(404,'السجل غير متاح.');
  if(!a.can(i.kind+'.edit')&&i.createdBy!==a.me.id)fail(403,'ليس لديك صلاحية الرد.');
  if(b.internal&&!a.can(i.kind+'.view_all'))fail(403,'الملاحظات الداخلية للإدارة فقط.');
  if(i.status==='archived')fail(400,'استعد السجل من الأرشيف قبل إضافة رد.');
  await db().batch([stmt('INSERT INTO comments(id,item_id,body,internal,actor,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),i.id,textValue(b.body,6000),b.internal?1:0,a.me.name,now),audit(a,b.internal?'إضافة ملاحظة داخلية':'إضافة رد',i.title)]);return Response.json({ok:true},{headers});
 }
 if(b.action==='saveRole'){
  requirePermission('roles.manage');if(a.me.roleId!=='owner')fail(403,'إدارة الرتب متاحة للمالك فقط.');
  if(b.id==='owner')fail(403,'رتبة المالك ثابتة لحماية اللوحة.');
  const name=textValue(b.name,60),discordRoleId=textValue(b.discordRoleId??'',20,false)||null;
  if(discordRoleId&&(!isDiscordId(discordRoleId)||discordRoleId===discordConfig().guildId))fail(400,'أدخل Role ID صحيحًا، ولا تستخدم رتبة everyone.');
  if(!Number.isInteger(b.priority)||b.priority<0||b.priority>1000)fail(400,'أولوية الرتبة يجب أن تكون عددًا من 0 إلى 1000.');
  if(!Array.isArray(b.permissions)||b.permissions.some((p:unknown)=>typeof p!=='string'||!permissionKeys.includes(p as string)||p==='roles.manage'||p==='staff.manage'))fail(400,'الصلاحيات غير صالحة. إدارة العضوية والرتب محصورة بالمالك.');
  const id=b.id?textValue(b.id,80):crypto.randomUUID();
  if(b.id&&!await first('SELECT id FROM roles WHERE id=?',id))fail(404,'الرتبة غير موجودة.');
  if(discordRoleId&&await first('SELECT id FROM roles WHERE discord_role_id=? AND id<>?',discordRoleId,id))fail(409,'رتبة Discord مرتبطة برتبة أخرى داخل اللوحة.');
  await db().batch([stmt('INSERT INTO roles(id,name,permissions,discord_role_id,priority) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions=excluded.permissions,discord_role_id=excluded.discord_role_id,priority=excluded.priority',id,name,JSON.stringify([...new Set(b.permissions)]),discordRoleId,b.priority),audit(a,'حفظ ربط رتبة Discord',name)]);return Response.json({ok:true},{headers});
 }
 if(b.action==='saveMember'){
  requirePermission('staff.manage');if(a.me.roleId!=='owner')fail(403,'إدارة الأعضاء متاحة للمالك فقط.');
  const old=await first<Member>(memberSQL+' WHERE id=?',textValue(b.id,80));
  if(!old)fail(404,'الإداري غير موجود. الأعضاء الجدد يدخلون برتبة Discord.');
  if(old.roleId==='owner')fail(403,'لا يمكن تعديل المالك أو إيقافه.');
  if(typeof b.active!=='boolean'||b.roleId!==undefined||b.discordId!==undefined||b.email!==undefined)fail(400,'الرتبة والهوية تحددان من Discord فقط.');
  const name=textValue(b.name,80);
  await db().batch([stmt('UPDATE members SET name=?,active=? WHERE id=? AND role_id<>?',name,b.active?1:0,old.id,'owner'),audit(a,b.active?'إلغاء الإيقاف المحلي':'إيقاف الوصول محليًا',name)]);return Response.json({ok:true},{headers});
 }
 if(b.action==='settings'){
  requirePermission('settings.edit');const name=textValue(b.name,80),discord=checkedURL(b.discord,'discord'),connect=checkedURL(b.connect,'connect');
  await db().batch([stmt('UPDATE settings SET name=?,discord=?,connect=? WHERE id=1',name,discord,connect),audit(a,'تحديث إعدادات السيرفر',name)]);return Response.json({ok:true},{headers});
 }
 fail(400,'العملية غير معروفة.');
 }catch(e){return responseError(e)}}
