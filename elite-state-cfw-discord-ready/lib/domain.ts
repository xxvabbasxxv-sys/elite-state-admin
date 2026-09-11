export const modules = {rules:'التعليمات والقوانين',announcements:'الإعلانات',reports:'البلاغات والطلبات',tasks:'المهام'} as const;
export type Kind=keyof typeof modules;
export const actions={view:'عرض',create:'إنشاء',edit:'تعديل',publish:'نشر',archive:'أرشفة',view_all:'عرض جميع السجلات'} as const;
export const permissionKeys=Object.keys(modules).flatMap(m=>Object.keys(actions).filter(a=>['reports','tasks'].includes(m)? !['publish'].includes(a):a!=='view_all').map(a=>m+'.'+a)).concat(['staff.view','staff.manage','roles.manage','audit.view','settings.edit']);
export const presets=[
{id:'manager',name:'مدير الإدارة',permissions:permissionKeys.filter(p=>!['staff.manage','roles.manage'].includes(p))},
{id:'moderator',name:'مشرف',permissions:['rules.view','rules.create','rules.edit','announcements.view','announcements.create','announcements.edit','reports.view','reports.create','reports.edit','reports.view_all','tasks.view','tasks.create','tasks.edit','tasks.view_all','staff.view']},
{id:'staff',name:'إداري',permissions:['rules.view','announcements.view','reports.view','reports.create','tasks.view','tasks.edit']}
];
// Unmapped roles grant no access until the owner supplies their exact Discord Role IDs.
export const discordPresets=[
 {id:'server_owner',name:'Owner',permissions:presets[0].permissions,priority:700},
 {id:'co_owner',name:'Co-Owner',permissions:presets[0].permissions,priority:600},
 {id:'founder',name:'Founder',permissions:presets[0].permissions,priority:500},
 {id:'co_founder',name:'Co-Founder',permissions:presets[0].permissions,priority:400},
 {id:'teams',name:'ال تيمات',permissions:presets[0].permissions,priority:350},
 {id:'manager',name:'EL|Administration Manager',permissions:presets[0].permissions,priority:300},
 {id:'moderator',name:'هاي مانجمنت',permissions:presets[1].permissions,priority:200},
 {id:'staff',name:'مانجمنت',permissions:presets[2].permissions,priority:100}
];
export const statuses:Record<Kind,Record<string,string>>={
rules:{draft:'مسودة',review:'بانتظار الاعتماد',published:'منشور',archived:'مؤرشف'},
announcements:{draft:'مسودة',review:'بانتظار الاعتماد',published:'منشور',archived:'مؤرشف'},
reports:{open:'جديد',progress:'قيد المعالجة',closed:'مغلق',archived:'مؤرشف'},
tasks:{open:'لم يبدأ',progress:'قيد التنفيذ',closed:'مكتمل',archived:'مؤرشف'}
};
export type Item={id:string;kind:Kind;title:string;body:string;category:string;status:string;audience:string;pinned:number;priority:string;assignee:string|null;due:string|null;createdBy:string;createdAt:string;updatedAt:string;version:number};
export type Member={id:string;userId:string|null;email:string|null;name:string;roleId:string;active:number;expiresAt:string|null;discordId:string|null;lastVerifiedAt:string|null};
export type Role={id:string;name:string;permissions:string;discordRoleId:string|null;priority:number};
export type Audit={id:string;actor:string;action:string;target:string;createdAt:string};
export type AppData={setup?:boolean;error?:string;me?:Member;permissions:string[];roles:Role[];members:Member[];items:Item[];audit:Audit[];settings:{name:string;discord:string;connect:string}};
export const emptyData:AppData={permissions:[],roles:[],members:[],items:[],audit:[],settings:{name:'Elite State CFW',discord:'',connect:''}};
