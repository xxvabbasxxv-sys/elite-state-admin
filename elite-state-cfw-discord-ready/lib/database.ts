import 'server-only';
import postgres from 'postgres';
let connection:ReturnType<typeof postgres>|undefined;
function sql(){
 const url=process.env.DATABASE_URL;
 if(!url)throw new Error('لم يتم إعداد قاعدة البيانات.');
 const ca=process.env.DATABASE_SSL_CA?.replace(/\\n/g,'\n');
 return connection??=postgres(url,{prepare:false,max:1,idle_timeout:20,connect_timeout:10,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})}});
}
type Executor={unsafe:(query:string,parameters:any[])=>any};
function compile(query:string){
 if(query.includes(';'))throw new Error('Expected one prepared statement.');
 let position=0;
 return query.replace(/\?/g,()=>'$'+(++position))
  .replace(/\b(FROM|JOIN|UPDATE|INTO)\s+(audit|comments|items|members|roles|settings)\b/gi,'$1 elite.$2')
  .replace(/\bAS (userId|roleId|expiresAt|createdBy|createdAt|updatedAt|discordId|discordRoleId|lastVerifiedAt|ownerId|ownerDiscordId)\b/g,'AS "$1"');
}
class Statement{
 constructor(public query:string,public values:any[]=[]){}
 bind(...values:any[]){return new Statement(this.query,values)}
 async execute(executor:Executor){return await executor.unsafe(compile(this.query),this.values)}
 async first<T>(){const rows=await this.execute(sql());return (rows[0]??null) as T|null}
 async all<T>(){const rows=await this.execute(sql());return {results:Array.from(rows) as T[]}}
 async run(){const rows=await this.execute(sql());return {meta:{changes:rows.count}}}
}
export const database={
 prepare:(query:string)=>new Statement(query),
 async batch(statements:Statement[]){
  return await sql().begin(async tx=>{const results=[];for(const s of statements){const rows=await s.execute(tx as unknown as Executor);results.push({meta:{changes:rows.count}})}return results});
 },
 async writeAndAudit(mutation:Statement,log:Statement){
  return await sql().begin(async tx=>{const rows=await mutation.execute(tx as unknown as Executor);if(!rows.count)return [{meta:{changes:0}}];const audit=await log.execute(tx as unknown as Executor);return [{meta:{changes:rows.count}},{meta:{changes:audit.count}}]});
 }
};
