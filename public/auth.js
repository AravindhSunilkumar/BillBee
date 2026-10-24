export function authReturn(value){
 const url=new URL(value),hash=new URLSearchParams(url.hash.slice(1));
 const error=hash.get('error_code')||url.searchParams.get('error_code')||hash.get('error')||url.searchParams.get('error');
 const code=url.searchParams.get('code');
 const hasTokens=hash.has('access_token')||hash.has('refresh_token');
 const confirmation=hasTokens&&hash.get('type')==='signup';
 const legacyRecovery=hasTokens&&hash.get('type')==='recovery';
 const touched=Boolean(error||code||hasTokens);
 if(!touched)return{kind:'none'};
 for(const key of ['code','error','error_code','error_description'])url.searchParams.delete(key);
 url.hash='';
 const cleanUrl=url.pathname+url.search;
 if(error)return{kind:'error',cleanUrl,message:error==='otp_expired'?'This email link is invalid or has expired. Request a new confirmation email or password reset, then use only the newest email.':'This email link could not be verified. Request a new confirmation email or password reset.'};
 if(code)return{kind:'recovery',cleanUrl,code};
 if(legacyRecovery)return{kind:'error',cleanUrl,message:'Request a new password reset from this browser, then open its newest email here.'};
 return{kind:confirmation?'confirmation':'error',cleanUrl,message:confirmation?'Confirmation link opened. Sign in with your BillBee password to continue.':'This sign-in link is not supported. Sign in with your email and password.'};
}
