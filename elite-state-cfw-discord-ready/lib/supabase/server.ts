import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export async function createServerSupabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('لم تكتمل إعدادات تسجيل الدخول.');
 const jar=await cookies();
 return createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll(values){for(const {name,value,options} of values)jar.set(name,value,options)}}});
}
export async function getAuthenticatedUser(){
 const jar=await cookies();
 if(!jar.getAll().some(c=>c.name.startsWith('sb-')))return null;
 const client=await createServerSupabase();
 const {data,error}=await client.auth.getUser();
 const user=data.user;
 if(error||!user)return null;
 // Identity.id is Supabase's protected provider_id, not editable user_metadata or identity_data.sub.
 const identity=user.identities?.find(i=>i.provider==='discord'&&i.user_id===user.id);
 if(!identity||!/^\d{17,20}$/.test(identity.id))return null;
 return {userId:user.id,discordId:identity.id};
}
export type AuthenticatedUser=NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
