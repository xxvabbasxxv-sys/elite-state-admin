import 'server-only';
export class DiscordFailure extends Error{constructor(public status:number,message:string){super(message)}}
export const isDiscordId=(value:unknown):value is string=>typeof value==='string'&&/^\d{17,20}$/.test(value);
export function discordConfig(){
 const guildId=process.env.DISCORD_GUILD_ID?.trim(),ownerId=process.env.DISCORD_OWNER_ID?.trim(),token=process.env.DISCORD_BOT_TOKEN?.trim();
 if(!isDiscordId(guildId)||!isDiscordId(ownerId)||!token)throw new DiscordFailure(503,'لم تكتمل إعدادات ربط Discord. تواصل مع مالك اللوحة.');
 return {guildId,ownerId,token};
}
export async function getDiscordMember(discordId:string){
 const {guildId,token}=discordConfig();
 if(!isDiscordId(discordId))throw new DiscordFailure(403,'هوية Discord غير صالحة.');
 let response:Response;
 try{response=await fetch('https://discord.com/api/v10/guilds/'+guildId+'/members/'+discordId,{headers:{Authorization:'Bot '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000)});}
 catch{throw new DiscordFailure(503,'تعذّر التحقق من رتبتك في Discord. الوصول موقوف مؤقتًا حتى نجاح التحقق.');}
 if(response.status===404)throw new DiscordFailure(403,'يلزم أن يكون حسابك عضوًا في سيرفر Discord المحدد.');
 if(!response.ok)throw new DiscordFailure(503,response.status===429?'Discord يطلب الانتظار قليلًا. أعد المحاولة لاحقًا.':'تعذّر التحقق من Discord. راجع إعدادات البوت مع المالك.');
 let member:any;try{member=await response.json()}catch{throw new DiscordFailure(503,'استجابة Discord غير صالحة.');}
 if(member?.user?.id!==discordId||!Array.isArray(member.roles)||member.roles.some((id:unknown)=>!isDiscordId(id)))throw new DiscordFailure(503,'تعذّر تأكيد بيانات العضوية في Discord.');
 if(member.pending===true||member.user.bot===true)throw new DiscordFailure(403,'أكمل قبول شروط سيرفر Discord أولًا، واستخدم حسابًا شخصيًا.');
 const name=String(member.nick||member.user.global_name||member.user.username||discordId).slice(0,80);
 return {discordId,name,roles:member.roles as string[]};
}
