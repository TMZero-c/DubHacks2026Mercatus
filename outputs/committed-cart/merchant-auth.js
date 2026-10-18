const $=id=>document.getElementById(id);
let token='',mode='login',busy=false,loaded=false;
window.laterAuthHeaders=()=>token?{Authorization:'Bearer '+token}:{};
function message(text=''){$('authError').textContent=text;$('authError').dataset.open=String(Boolean(text));}
function setMode(){const signup=mode==='signup';$('authTitle').textContent=signup?'Create your merchant account':'Welcome to Mercatus.';$('authHint').textContent='Manage your offers, deals and redemptions.';$('authSubmit').textContent=signup?'Create account':'Log in';$('authToggle').textContent=signup?'Already have an account? Log in':'Need an account? Sign up';$('authPassword').autocomplete=signup?'new-password':'current-password';message();}
async function request(path,body){const response=await fetch('/api/auth/'+path,{headers:{...window.laterAuthHeaders(),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not sign in.');return result;}
async function enter(user){$('accountEmail').textContent=user.email;document.body.classList.remove('auth-locked');$('merchantView').style.display='block';if(!loaded){loaded=true;await import('./merchant-manager.js');}else await window.refreshMerchantManager?.();}
$('authToggle').onclick=()=>{mode=mode==='login'?'signup':'login';setMode();};
$('authForm').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;$('authSubmit').disabled=true;message();try{const result=await request(mode,{email:$('authEmail').value,password:$('authPassword').value});token=result.token;localStorage.setItem('laterAuth',JSON.stringify({token,user:result.user}));$('authPassword').value='';await enter(result.user);}catch(error){message(error.message);}finally{busy=false;$('authSubmit').disabled=false;}};
$('logout').onclick=async()=>{try{await request('logout',{});}finally{token='';localStorage.removeItem('laterAuth');location.reload();}};
setMode();
try{const saved=JSON.parse(localStorage.getItem('laterAuth')||'null');if(saved?.token){token=saved.token;const {user}=await request('me');await enter(user);}}catch{token='';localStorage.removeItem('laterAuth');message('Sign in to your merchant workspace.');}
