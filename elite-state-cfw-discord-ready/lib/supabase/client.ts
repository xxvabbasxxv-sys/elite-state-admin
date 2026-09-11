'use client';
import {createBrowserClient} from '@supabase/ssr';
export function createBrowserSupabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('لم تكتمل إعدادات تسجيل الدخول. تواصل مع مالك الموقع.');
 return createBrowserClient(url,key);
}

