export function validateDeal(input,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Deal terms are required.');
 const allowed=['product','merchant','priceCents','quantity','expiresAt','rewardCents'];
 if(Object.keys(input).some(key=>!allowed.includes(key)))throw Error('Unknown deal term.');
 const text=(key,max)=>{const value=input[key];if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value.trim(),'utf8')>max||/[\x00-\x1f]/.test(value))throw Error(key+' must be readable text, at most '+max+' UTF-8 bytes.');return value.trim();};
 const product=text('product',80),merchant=text('merchant',60);
 if(!Number.isSafeInteger(input.priceCents)||input.priceCents<1||input.priceCents>100000)throw Error('Price must be 1–100000 USD cents.');
 if(!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>5)throw Error('Choose 1–5 passes per on-chain drop.');
 if(!Number.isSafeInteger(input.rewardCents)||input.rewardCents<0||input.rewardCents>=input.priceCents)throw Error('Referral credit must be nonnegative and less than the purchase price.');
 const expiry=typeof input.expiresAt==='string'?Date.parse(input.expiresAt):NaN;
 if(!Number.isFinite(expiry)||expiry<now+5*60000||expiry>now+30*86400000)throw Error('Expiry must be 5 minutes to 30 days from now.');
 return{product,merchant,priceCents:input.priceCents,quantity:input.quantity,expiresAt:new Date(expiry).toISOString(),rewardCents:input.rewardCents};
}
