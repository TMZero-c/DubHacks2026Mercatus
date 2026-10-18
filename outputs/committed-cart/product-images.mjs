// Optional display metadata; never part of a price, authorization or commitment hash.
export function productImages(values,count){
 return Array.from({length:count},(_,index)=>{
  const value=Array.isArray(values)?values[index]:'';
  if(typeof value!=='string'||value.length>2000)return '';
  try{const url=new URL(value),host=url.hostname.toLowerCase();
   if(url.protocol!=='https:'||url.username||url.password||url.port||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')||/^\d+(\.\d+){3}$/.test(host)||host.includes(':'))return '';
   return url.href;
  }catch{return '';}
 });
}
