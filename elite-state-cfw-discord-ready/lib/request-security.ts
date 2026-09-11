// Use the trusted deployment URL because reverse proxies may supply an internal request URL.
export function applicationOrigin(request:Request){
 return new URL(process.env.NEXT_PUBLIC_APP_URL||request.url).origin;
}
export function isSameOrigin(request:Request){
 const origin=request.headers.get('origin');
 return !origin||origin===applicationOrigin(request);
}
