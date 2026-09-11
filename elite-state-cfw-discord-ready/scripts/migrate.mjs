import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL in .env.local before migrating.');
const ca=process.env.DATABASE_SSL_CA?.replace(/\\n/g,'\n');
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})}});
try{await sql.begin(async tx=>{for(const name of ['001-initial.sql','002-discord.sql']){const migration=await readFile(new URL('../database/'+name,import.meta.url),'utf8');await tx.unsafe(migration)}});console.log('Elite State Discord schema is ready. Existing records were preserved.')}finally{await sql.end()}
