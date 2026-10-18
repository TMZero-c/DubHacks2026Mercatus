// Runs only on declared Amazon product/cart pages. Reads product details on click.
function collectWaitSaveProduct(doc=document,href=location.href){
 const u=new URL(href);if(u.protocol!=='https:'||u.hostname!=='www.amazon.com')throw new Error('Use a desktop Amazon.com product page.');
 const asin=u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/)?.[1];
 if(!asin)throw new Error('Open a supported product page.');
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const name=clean(doc.querySelector('#productTitle')?.textContent);if(!name)throw new Error('Product could not be read. Use the cart import instead.');
 const raw=clean(doc.querySelector('#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #priceblock_ourprice')?.textContent);
 const amount=/^(?:US\s*)?\$\s*[\d,]+(?:\.\d{2})?$/.test(raw)?Number(raw.replace(/[^\d.]/g,'')):0;
 const quantity=Number(doc.querySelector('select#quantity')?.value||1);if(!Number.isInteger(quantity)||quantity<1||quantity>10)throw new Error('Select a quantity from 1 to 10.');
 const variants=[...doc.querySelectorAll('#twister .selection, #twister_feature_div .selection')].map(n=>clean(n.textContent)).filter(Boolean);
 return{source:'amazon.com',capturedAt:new Date().toISOString(),items:[{name:name.slice(0,180),variant:('ASIN '+asin+' · '+(variants.join(' · ')||'confirm selected variant')).slice(0,180),quantity,price:amount>0&&amount<=500?amount.toFixed(2):'',url:'https://www.amazon.com/dp/'+asin,image:doc.querySelector('#landingImage, #imgBlkFront')?.src||''}]};
}
function mountWaitSave(){
 if(document.getElementById('committed-wait-save'))return;
 const product=/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/.test(location.pathname);
 const anchor=product?(document.querySelector('#add-to-cart-button')?.closest('#addToCart_feature_div')||document.querySelector('#add-to-cart-button')?.parentElement?.parentElement):document.querySelector('#sc-buy-box, #sc-proceed-to-checkout, #sc-buy-box-ptc-button, [name=proceedToRetailCheckout]')||(/^\/cart\/smart-wagon/.test(location.pathname)?[...document.querySelectorAll('a')].find(a=>a.textContent.trim()==='Go to Cart'):null);
 if(!anchor)return;
 const safeAnchor=['INPUT','BUTTON','A'].includes(anchor.tagName)?anchor.parentElement:anchor;
 const box=document.createElement('div');box.id='committed-wait-save';box.style.cssText='margin:12px 0;color:#16171b;font:16px/1.5 Arial,sans-serif';
 const button=document.createElement('button');button.type='button';button.textContent='Wait & save';button.style.cssText='display:block;width:100%;border:0;border-radius:9px;padding:10px 16px;background:#2456f5;color:white;font:600 15px Arial,sans-serif;cursor:pointer';
 const status=document.createElement('div');status.setAttribute('role','status');status.hidden=true;status.style.cssText='font-size:16px;margin-top:8px';
 button.onclick=()=>{try{if(/^\/cart\/smart-wagon/.test(location.pathname)){location.assign('https://www.amazon.com/gp/cart/view.html');return;}const data=product?collectWaitSaveProduct():collectAmazonCart();if(data.error)throw new Error(data.error);if(data.items.length>8)throw new Error('Select up to 8 items, or use the extension popup.');const encoded=encodeURIComponent(JSON.stringify(data));if(encoded.length>20000)throw new Error('Select fewer items.');chrome.runtime.sendMessage({type:'later-open-popup',payload:data},response=>{if(chrome.runtime.lastError||response?.error){status.hidden=false;status.textContent=response?.error||'Reload this Amazon page, then click Mercatus in the toolbar.';return;}status.hidden=true;status.textContent='';});}catch(e){status.hidden=false;status.textContent=e.message}};
 box.append(button,status);safeAnchor.insertAdjacentElement('afterend',box);
}
if(typeof chrome!=='undefined'&&chrome.runtime?.id){mountWaitSave();let pending;const observer=new MutationObserver(()=>{clearTimeout(pending);pending=setTimeout(mountWaitSave,250)});observer.observe(document.documentElement,{childList:true,subtree:true});}
