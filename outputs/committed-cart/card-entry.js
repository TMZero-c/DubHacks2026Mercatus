(()=>{
 if(window.laterCardFlow)return;
 let microform=null,expiresAt=0,fields=[],ready=false,loading=false;
 const status=document.getElementById('cardStatus'),load=document.getElementById('loadCard');
 async function initialize(){
  if(loading)return;loading=true;ready=false;load.hidden=false;load.disabled=true;status.textContent='Connecting to Visa secure card entry…';
  try{
   fields.forEach(f=>f.dispose());fields=[];microform=null;
   document.getElementById('cardNumber').replaceChildren();document.getElementById('cardCvv').replaceChildren();
   const response=await fetch('/api/card-session',{method:'POST',headers:{'Content-Type':'application/json',...(window.laterCardFlow?{'X-Later-Card-Flow':window.laterCardFlow}:{}),...(window.laterAuthHeaders?.()||{})},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error);
   await new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>reject(new Error('Visa took too long to load. Click Retry secure card entry.')),15000);script.src=data.clientLibrary;script.integrity=data.clientLibraryIntegrity;script.crossOrigin='anonymous';script.onload=()=>{clearTimeout(timer);resolve()};script.onerror=()=>{clearTimeout(timer);reject(new Error('Visa SDK failed to load. Check your connection and retry.'))};document.head.append(script)});
   microform=new Flex(data.captureContext).microform({styles:{input:{'font-size':'16px',color:'#16171b'}}});
   fields=[microform.createField('number',{placeholder:'Card number'}),microform.createField('securityCode',{placeholder:'CVV'})];
   await Promise.all(fields.map((field,i)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Secure field did not become ready. Click Retry secure card entry.')),15000);field.on('load',()=>{clearTimeout(timer);resolve()});field.on('error',()=>{clearTimeout(timer);ready=false;load.hidden=false;status.textContent='Secure field error. Retry secure card entry.';reject(new Error('Visa could not load a secure field. Retry secure card entry.'))});field.on('change',data=>{document.getElementById(i?'cardCvv':'cardNumber').style.borderColor=data.valid?'#4d8134':data.empty||data.couldBeValid?'#ccc':'#b84a35';});field.load(i?'#cardCvv':'#cardNumber');})));
   expiresAt=data.expiresAt;ready=true;load.hidden=true;status.textContent='';load.textContent='Reload secure card entry';
  }catch(e){load.hidden=false;status.textContent=e.message;load.textContent='Retry secure card entry';}finally{loading=false;load.disabled=false;}
 }
 load.onclick=initialize;
 for(const [id,index] of [['cardNumber',0],['cardCvv',1]]){document.getElementById(id).onclick=()=>fields[index]?.focus();document.querySelector('label[for="'+id+'"]').onclick=()=>fields[index]?.focus();}
 window.tokenizeCard=()=>new Promise((resolve,reject)=>{
  if(!ready||!microform)return reject(new Error('Wait for secure card entry to be ready, or click Retry.'));
  if(expiresAt<=Date.now()){ready=false;load.hidden=false;status.textContent='Card session expired. Reload secure card entry and re-enter the test card.';return reject(new Error(status.textContent));}
  const expirationMonth=document.getElementById('expMonth').value.trim().padStart(2,'0'),expirationYear=document.getElementById('expYear').value.trim();
  if(!/^(0[1-9]|1[0-2])$/.test(expirationMonth)||!/^20\d{2}$/.test(expirationYear)||new Date(Number(expirationYear),Number(expirationMonth),1)<=new Date())return reject(new Error('Enter a future expiry month and four-digit year, for example 12 / 2028.'));
  const timer=setTimeout(()=>reject(new Error('Card tokenization timed out. No authorization was sent. Retry secure card entry.')),20000);
  microform.createToken({expirationMonth,expirationYear},(err,token)=>{clearTimeout(timer);if(err){status.textContent='Check card number, security code and expiry. Use a Visa sandbox test card.';return reject(new Error(status.textContent));}resolve(token)});
 });
 if(new URLSearchParams(location.search).has('panel')){
  document.querySelector('.payment-card').innerHTML='<strong>Card authorization <span class="visa-brand">VISA</span></strong>';
  window.commitInSecureWindow=body=>{const encoded=encodeURIComponent(JSON.stringify(body));const popup=window.open('/secure-card#commit='+encoded,'later-visa-card','popup,width=440,height=760');if(!popup)throw new Error('Allow the secure card window, then retry.');};
  window.tokenizeCard=()=>new Promise((resolve,reject)=>{
   const flow=crypto.randomUUID(),popup=window.open('/secure-card?flow='+encodeURIComponent(flow),'later-visa-card','popup,width=440,height=760');
   if(!popup)return reject(new Error('Allow the secure card window to open, then try again.'));
   const cleanup=()=>{window.removeEventListener('message',receive);clearInterval(closed);clearTimeout(timeout)};
   const receive=event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='later-card-token'||event.data.flow!==flow)return;cleanup();resolve(event.data.token)};
   window.addEventListener('message',receive);const closed=setInterval(()=>{if(popup.closed){cleanup();reject(new Error('Card entry closed. No authorization was sent.'));}},500);const timeout=setTimeout(()=>{cleanup();reject(new Error('Card entry timed out. Try again.'));},10*60000);
  });
 }else if(!document.getElementById('billing'))initialize();
})();
