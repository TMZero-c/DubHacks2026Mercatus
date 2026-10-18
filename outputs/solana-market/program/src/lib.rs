#![allow(unexpected_cfgs)]
use borsh::{BorshDeserialize,BorshSerialize};
use solana_program::{account_info::{next_account_info,AccountInfo},clock::Clock,entrypoint,entrypoint::ProgramResult,program::invoke_signed,program_error::ProgramError,pubkey::Pubkey,rent::Rent,system_instruction,system_program,sysvar::Sysvar};
use std::str::FromStr;
entrypoint!(process_instruction);
type Key=[u8;32];
const POLICY_SIZE:usize=10_240;
const INTENT_SIZE:usize=2_100;
const QUOTE_SIZE:usize=512;
const STOCK_SIZE:usize=80;
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Product{pub hash:Key,pub list:u64,pub floor:u64}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Item{pub hash:Key,pub quantity:u32}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Usage{pub day:i64,pub reserved:u64}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Policy{pub kind:u8,pub merchant:Key,pub id:Key,pub daily_budget:u64,pub max_incentive:u64,pub fixed_discount:bool,pub delivery_days:u16,pub offer_seconds:u32,pub end:i64,pub seller:Vec<Key>,pub active:bool,pub usage:Vec<Usage>,pub outstanding:u32,pub products:Vec<Product>}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Stock{pub kind:u8,pub merchant:Key,pub hash:Key,pub total:u32,pub reserved:u32}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Summary{pub quote:Key,pub amount:u64,pub expires:i64,pub open:bool}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Intent{pub kind:u8,pub digest:Key,pub budget:u64,pub expires:i64,pub delivery_day:i64,pub seller:Key,pub items:Vec<Item>,pub quotes:Vec<Summary>,pub selected:Key}
#[derive(BorshSerialize,BorshDeserialize,Clone,Debug)]
pub struct Quote{pub kind:u8,pub policy:Key,pub intent:Key,pub operator:Key,pub amount:u64,pub incentive:u64,pub day:i64,pub expires:i64,pub status:u8,pub units:Vec<Item>}
#[derive(BorshSerialize,BorshDeserialize)]
pub enum Command{
 CreatePolicy{id:Key,daily_budget:u64,max_incentive:u64,fixed_discount:bool,delivery_days:u16,offer_seconds:u32,end:i64,seller:Vec<Key>},
 SetProducts{products:Vec<Product>,stocks:Vec<u32>},
 SetActive{active:bool},
 RegisterIntent{digest:Key,budget:u64,expires:i64,delivery_day:i64,seller:Key,items:Vec<Item>},
 ComputeQuote{ceiling:u64},
 SelectQuote,
 ReleaseQuote,
 CloseQuote,
 CancelIntent,
}
fn err(code:u32)->ProgramError{ProgramError::Custom(code)}
fn check(ok:bool,code:u32)->ProgramResult{if ok{Ok(())}else{Err(err(code))}}
fn signer(a:&AccountInfo)->ProgramResult{check(a.is_signer,1)}
fn load<T:BorshDeserialize>(a:&AccountInfo,p:&Pubkey)->Result<T,ProgramError>{check(a.owner==p,2)?;T::deserialize(&mut a.try_borrow_data()?.as_ref()).map_err(|_|err(3))}
fn save<T:BorshSerialize>(a:&AccountInfo,v:&T)->ProgramResult{let bytes=borsh::to_vec(v).map_err(|_|err(3))?;let mut d=a.try_borrow_mut_data()?;check(bytes.len()<=d.len(),4)?;d.fill(0);d[..bytes.len()].copy_from_slice(&bytes);Ok(())}
fn address(a:&AccountInfo,seeds:&[&[u8]],p:&Pubkey)->Result<u8,ProgramError>{let(k,b)=Pubkey::find_program_address(seeds,p);check(a.key==&k,5)?;Ok(b)}
fn create<'a>(payer:&AccountInfo<'a>,a:&AccountInfo<'a>,system:&AccountInfo<'a>,size:usize,seeds:&[&[u8]],p:&Pubkey)->ProgramResult{
 signer(payer)?;check(system.key==&system_program::id(),2)?;let bump=address(a,seeds,p)?;check(a.lamports()==0&&a.data_is_empty(),6)?;
 let binding=[bump];let mut all=seeds.to_vec();all.push(&binding);
 invoke_signed(&system_instruction::create_account(payer.key,a.key,Rent::get()?.minimum_balance(size),size as u64,p),&[payer.clone(),a.clone(),system.clone()],&[&all])
}
fn authority(a:&AccountInfo)->ProgramResult{signer(a)?;check(a.key==&Pubkey::from_str(env!("LATER_ATTESTOR")).map_err(|_|err(7))?,7)}
fn now()->Result<i64,ProgramError>{Ok(Clock::get()?.unix_timestamp)}
fn valid_items(items:&[Item])->ProgramResult{check(!items.is_empty()&&items.len()<=8,8)?;for(i,x)in items.iter().enumerate(){check(x.quantity>0&&x.quantity<=80&&!items[..i].iter().any(|y|y.hash==x.hash),8)?;}Ok(())}
fn policy(a:&AccountInfo,p:&Pubkey)->Result<Policy,ProgramError>{let v:Policy=load(a,p)?;check(v.kind==1,3)?;address(a,&[b"policy",&v.merchant,&v.id],p)?;Ok(v)}
fn intent(a:&AccountInfo,p:&Pubkey)->Result<Intent,ProgramError>{let v:Intent=load(a,p)?;check(v.kind==3,3)?;address(a,&[b"intent",&v.digest],p)?;Ok(v)}
fn quote(a:&AccountInfo,p:&Pubkey)->Result<Quote,ProgramError>{let v:Quote=load(a,p)?;check(v.kind==4,3)?;address(a,&[b"quote",&v.policy,&v.intent],p)?;Ok(v)}
fn math()->ProgramError{err(9)}
// Economic core: same competitive/fixed policy as Later's merchant engine.
pub fn calculate(policy:&Policy,intent:&Intent,current_best:u64,day:i64)->Result<(u64,u64),ProgramError>{
 let mut list=0u64;let mut floor=0u64;
 for item in &intent.items{let product=policy.products.iter().find(|x|x.hash==item.hash).ok_or(err(10))?;list=list.checked_add(product.list.checked_mul(item.quantity as u64).ok_or(math())?).ok_or(math())?;floor=floor.checked_add(product.floor.checked_mul(item.quantity as u64).ok_or(math())?).ok_or(math())?;}
 let reserved=policy.usage.iter().find(|x|x.day==day).map(|x|x.reserved).unwrap_or(0);let remaining=policy.daily_budget.saturating_sub(reserved);let limit=remaining.min(policy.max_incentive);
 floor=floor.max(list.saturating_sub(limit));let amount=if policy.fixed_discount{floor}else{floor.max(list.min(current_best.saturating_sub(1)))};
 check(amount>0&&amount<current_best,11)?;Ok((amount,list.saturating_sub(amount)))
}
pub fn process_instruction(p:&Pubkey,accounts:&[AccountInfo],bytes:&[u8])->ProgramResult{
 let cmd=Command::try_from_slice(bytes).map_err(|_|err(3))?;let it=&mut accounts.iter();
 match cmd{
 Command::CreatePolicy{id,daily_budget,max_incentive,fixed_discount,delivery_days,offer_seconds,end,seller}=>{
 let merchant=next_account_info(it)?;let a=next_account_info(it)?;let system=next_account_info(it)?;let time=now()?;
 check(daily_budget>0&&max_incentive>0&&!seller.is_empty()&&seller.len()<=10&&delivery_days<=30&&offer_seconds>=60&&offer_seconds<=14_400&&end>time,8)?;
 create(merchant,a,system,POLICY_SIZE,&[b"policy",merchant.key.as_ref(),&id],p)?;
 save(a,&Policy{kind:1,merchant:merchant.key.to_bytes(),id,daily_budget,max_incentive,fixed_discount,delivery_days,offer_seconds,end,seller,active:false,usage:vec![],outstanding:0,products:vec![]})
 },
 Command::SetProducts{products,stocks}=>{
 let merchant=next_account_info(it)?;let a=next_account_info(it)?;let system=next_account_info(it)?;signer(merchant)?;let mut v=policy(a,p)?;
 check(v.merchant==merchant.key.to_bytes()&&!v.active&&v.outstanding==0&&!products.is_empty()&&products.len()<=8&&products.len()==stocks.len(),12)?;
 for(product,total)in products.iter().zip(stocks){check(product.list>0&&product.floor>0&&product.floor<=product.list&&total<=1_000_000,8)?;let s=next_account_info(it)?;
 address(s,&[b"stock",merchant.key.as_ref(),&product.hash],p)?;
 let mut inventory=if s.data_is_empty(){create(merchant,s,system,STOCK_SIZE,&[b"stock",merchant.key.as_ref(),&product.hash],p)?;Stock{kind:2,merchant:merchant.key.to_bytes(),hash:product.hash,total,reserved:0}}else{load::<Stock>(s,p)?};
 check(inventory.kind==2&&inventory.merchant==merchant.key.to_bytes()&&inventory.hash==product.hash&&total>=inventory.reserved,13)?;inventory.total=total;save(s,&inventory)?;
 if let Some(old)=v.products.iter_mut().find(|x|x.hash==product.hash){*old=product.clone()}else{check(v.products.len()<200,8)?;v.products.push(product.clone());}
 }save(a,&v)
 },
 Command::SetActive{active}=>{let merchant=next_account_info(it)?;let a=next_account_info(it)?;signer(merchant)?;let mut v=policy(a,p)?;check(v.merchant==merchant.key.to_bytes()&&(!active||(!v.products.is_empty()&&now()?<v.end)),12)?;v.active=active;save(a,&v)},
 Command::RegisterIntent{digest,budget,expires,delivery_day,seller,items}=>{let attestor=next_account_info(it)?;let a=next_account_info(it)?;let system=next_account_info(it)?;authority(attestor)?;let time=now()?;valid_items(&items)?;check(budget>0&&budget<=50_000&&expires>time&&expires<=time+43_260&&delivery_day>=time/86400,8)?;
 create(attestor,a,system,INTENT_SIZE,&[b"intent",&digest],p)?;save(a,&Intent{kind:3,digest,budget,expires,delivery_day,seller,items,quotes:vec![],selected:[0;32]})},
 Command::ComputeQuote{ceiling}=>{
 let operator=next_account_info(it)?;let pa=next_account_info(it)?;let ia=next_account_info(it)?;let qa=next_account_info(it)?;let system=next_account_info(it)?;signer(operator)?;
 let mut pv=policy(pa,p)?;let mut iv=intent(ia,p)?;let time=now()?;let day=time/86400;
 check(pv.active&&time<pv.end&&time<iv.expires&&iv.selected==[0;32]&&pv.seller.contains(&iv.seller)&&day+pv.delivery_days as i64<=iv.delivery_day,14)?;
 address(qa,&[b"quote",pa.key.as_ref(),ia.key.as_ref()],p)?;check(iv.quotes.len()<30&&!iv.quotes.iter().any(|x|x.quote==qa.key.to_bytes()),15)?;
 let best=iv.quotes.iter().filter(|x|x.open&&x.expires>time).map(|x|x.amount).min().unwrap_or(iv.budget).min(iv.budget).min(ceiling);let(amount,incentive)=calculate(&pv,&iv,best,day)?;
 for item in &iv.items{let s=next_account_info(it)?;address(s,&[b"stock",&pv.merchant,&item.hash],p)?;let mut stock:Stock=load(s,p)?;check(stock.kind==2&&stock.merchant==pv.merchant&&stock.hash==item.hash&&stock.total.saturating_sub(stock.reserved)>=item.quantity,13)?;stock.reserved=stock.reserved.checked_add(item.quantity).ok_or(math())?;save(s,&stock)?;}
 create(operator,qa,system,QUOTE_SIZE,&[b"quote",pa.key.as_ref(),ia.key.as_ref()],p)?;
 let expires=(time+pv.offer_seconds as i64).min(iv.expires);let qv=Quote{kind:4,policy:pa.key.to_bytes(),intent:ia.key.to_bytes(),operator:operator.key.to_bytes(),amount,incentive,day,expires,status:1,units:iv.items.clone()};
 if let Some(u)=pv.usage.iter_mut().find(|x|x.day==day){u.reserved=u.reserved.checked_add(incentive).ok_or(math())?;}else{check(pv.usage.len()<3,8)?;pv.usage.push(Usage{day,reserved:incentive});}
 pv.outstanding=pv.outstanding.checked_add(1).ok_or(math())?;iv.quotes.push(Summary{quote:qa.key.to_bytes(),amount,expires,open:true});save(pa,&pv)?;save(ia,&iv)?;save(qa,&qv)
 },
 Command::SelectQuote=>{let attestor=next_account_info(it)?;let ia=next_account_info(it)?;let qa=next_account_info(it)?;authority(attestor)?;let mut iv=intent(ia,p)?;let qv=quote(qa,p)?;let time=now()?;check(qv.intent==ia.key.to_bytes()&&qv.status==1&&time<iv.expires&&time<qv.expires&&iv.selected==[0;32],16)?;iv.selected=qa.key.to_bytes();save(ia,&iv)},
 Command::ReleaseQuote=>{
 let caller=next_account_info(it)?;signer(caller)?;let pa=next_account_info(it)?;let ia=next_account_info(it)?;let qa=next_account_info(it)?;let mut pv=policy(pa,p)?;let mut iv=intent(ia,p)?;let mut qv=quote(qa,p)?;let time=now()?;
 check(qv.policy==pa.key.to_bytes()&&qv.intent==ia.key.to_bytes()&&qv.status==1,17)?;
 check(time>=qv.expires||time>=iv.expires||(iv.selected!=[0;32]&&iv.selected!=qa.key.to_bytes())||caller.key==&Pubkey::from_str(env!("LATER_ATTESTOR")).map_err(|_|err(7))?,18)?;
 for item in &qv.units{let s=next_account_info(it)?;address(s,&[b"stock",&pv.merchant,&item.hash],p)?;let mut stock:Stock=load(s,p)?;stock.reserved=stock.reserved.checked_sub(item.quantity).ok_or(math())?;save(s,&stock)?;}
 if qv.incentive>0{let u=pv.usage.iter_mut().find(|x|x.day==qv.day).ok_or(err(3))?;u.reserved=u.reserved.checked_sub(qv.incentive).ok_or(math())?;}pv.usage.retain(|x|x.reserved>0);pv.outstanding=pv.outstanding.checked_sub(1).ok_or(math())?;qv.status=2;
 iv.quotes.iter_mut().find(|x|x.quote==qa.key.to_bytes()).ok_or(err(3))?.open=false;save(pa,&pv)?;save(ia,&iv)?;save(qa,&qv)
 },
 Command::CloseQuote=>{let payer=next_account_info(it)?;let qa=next_account_info(it)?;signer(payer)?;let qv=quote(qa,p)?;check(qv.status==2&&qv.operator==payer.key.to_bytes(),12)?;let balance=qa.lamports();let total=payer.lamports().checked_add(balance).ok_or(math())?;**payer.try_borrow_mut_lamports()?=total;**qa.try_borrow_mut_lamports()?=0;qa.realloc(0,false)?;qa.assign(&system_program::id());Ok(())},
 Command::CancelIntent=>{let attestor=next_account_info(it)?;let ia=next_account_info(it)?;authority(attestor)?;let mut iv=intent(ia,p)?;iv.expires=iv.expires.min(now()?);save(ia,&iv)},
 }
}
#[cfg(test)]mod tests{
 use super::*;
 fn p()->Policy{Policy{kind:1,merchant:[1;32],id:[2;32],daily_budget:2000,max_incentive:1000,fixed_discount:false,delivery_days:1,offer_seconds:3600,end:9999999999,seller:vec![[3;32]],active:true,usage:vec![],outstanding:0,products:vec![Product{hash:[4;32],list:10000,floor:8000}]}}
 fn i()->Intent{Intent{kind:3,digest:[5;32],budget:12000,expires:9999999999,delivery_day:999999,seller:[3;32],items:vec![Item{hash:[4;32],quantity:1}],quotes:vec![],selected:[0;32]}}
 #[test]fn competitive(){assert_eq!(calculate(&p(),&i(),12000,1).unwrap(),(10000,0));assert_eq!(calculate(&p(),&i(),9500,1).unwrap(),(9499,501));assert!(calculate(&p(),&i(),9000,1).is_err());}
 #[test]fn budget_and_quantity(){let mut policy=p();policy.fixed_discount=true;assert_eq!(calculate(&policy,&i(),12000,1).unwrap(),(9000,1000));policy.usage.push(Usage{day:1,reserved:1900});assert_eq!(calculate(&policy,&i(),12000,1).unwrap(),(9900,100));let mut intent=i();intent.items[0].quantity=2;assert_eq!(calculate(&policy,&intent,25000,1).unwrap(),(19900,100));}
 #[test]fn invalid_basket(){let mut items=i().items;items.push(items[0].clone());assert!(valid_items(&items).is_err());assert!(valid_items(&[]).is_err());}
 #[test]fn account_sizes(){let policy=p();let intent=i();assert!(borsh::to_vec(&policy).unwrap().len()+199*48<POLICY_SIZE);assert!(borsh::to_vec(&intent).unwrap().len()+7*36+30*49<INTENT_SIZE);}
}
