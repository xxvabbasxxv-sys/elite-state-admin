import {createServerSupabase} from '@/lib/supabase/server';
import {isSameOrigin} from '@/lib/request-security';
export async function POST(request:Request){
 if(!isSameOrigin(request))return Response.json({error:'مصدر غير مسموح.'},{status:403});
 try{const client=await createServerSupabase();const {error}=await client.auth.signOut();if(error)return Response.json({error:'تعذّر تسجيل الخروج.'},{status:503});return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({error:'تعذّر تسجيل الخروج.'},{status:503})}
}
