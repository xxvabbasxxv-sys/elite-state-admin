'use client';
import {useEffect,useState} from 'react';
import {createBrowserSupabase} from '@/lib/supabase/client';
import {Button} from '@/components/ui/button';
import {LockKeyhole,ArrowRight,LoaderCircle,ShieldCheck} from 'lucide-react';
export default function Login(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const configured=!!process.env.NEXT_PUBLIC_SUPABASE_URL&&!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 useEffect(()=>{if(new URLSearchParams(window.location.search).has('error'))setError('لم يكتمل تسجيل الدخول عبر Discord. حاول مجددًا من هذا المتصفح.');},[]);
 async function signIn(){
  setBusy(true);setError('');
  try{
   const client=createBrowserSupabase();
   const origin=(process.env.NEXT_PUBLIC_APP_URL||window.location.origin).replace(/\/$/,'');
   const {error}=await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:origin+'/auth/callback'}});
   if(error)throw error;
  }catch{setError('تعذّر بدء تسجيل الدخول. تأكد من تفعيل Discord في إعدادات الموقع وحاول مجددًا.');setBusy(false)}
 }
 return <main className="auth-page"><section className="panel auth-card"><img src="/elite-banner.png" alt="Elite State" className="auth-banner"/><div className="auth-content"><span className="pill cyan"><LockKeyhole size={14}/>الدخول برتب Discord</span><h1>بوابة Elite State CFW</h1><p className="muted">مساحة خاصة لرتب الإدارة المعتمدة. سجّل بحساب Discord الموجود في سيرفر Elite State؛ تسجيل الدخول وحده لا يمنح صلاحية.</p><div className="notice mt-6 flex items-start gap-3"><ShieldCheck className="shrink-0 mt-1" size={20}/><p>نتحقق من عضويتك ورتبتك على الخادم عند طلب بيانات الإدارة. سحب الرتبة يمنع الطلب التالي، حتى لو بقيت مسجّلًا.</p></div>{!configured&&<p className="notice mt-5">ربط Discord لم يكتمل بعد. يلزم إعداد الاتصال قبل استقبال الإداريين.</p>}{error&&<p className="error-box mt-5" role="alert">{error}</p>}<Button className="w-full mt-6" disabled={busy||!configured} onClick={()=>void signIn()}>{busy?<LoaderCircle className="animate-spin"/>:<LockKeyhole/>}{busy?'جارٍ الانتقال إلى Discord…':'تسجيل الدخول بواسطة Discord'}</Button><p className="help mt-4">لا نطلب كلمة مرور Discord داخل الموقع. إذا ما ظهرت لك صلاحية، راجع المالك للتأكد من رتبتك.</p><a className="text-link mt-5" href="/"><ArrowRight size={16}/>الرئيسية</a></div></section></main>
}
