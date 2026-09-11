import {NextResponse} from 'next/server';
import {createServerSupabase,getAuthenticatedUser} from '@/lib/supabase/server';
import {applicationOrigin} from '@/lib/request-security';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const code=new URL(request.url).searchParams.get('code');
 const redirect=(path:string)=>NextResponse.redirect(new URL(path,applicationOrigin(request)),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 if(code)try{
  const client=await createServerSupabase();
  const {error}=await client.auth.exchangeCodeForSession(code);
  if(!error&&await getAuthenticatedUser())return redirect('/');
  if(!error)await client.auth.signOut();
 }catch{}
 return redirect('/login?error=discord_auth');
}
