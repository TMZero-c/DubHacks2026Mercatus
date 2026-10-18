chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(message.type!=='later-open-popup')return;
 let url;try{url=new URL(sender.url)}catch{return}
 if(!sender.tab||url.hostname!=='www.amazon.com'||url.protocol!=='https:'){sendResponse({error:'Open an Amazon.com cart or product page.'});return;}
 const payload=message.payload;if(!payload||!Array.isArray(payload.items)||payload.items.length<1||payload.items.length>8||JSON.stringify(payload).length>20000){sendResponse({error:'Invalid cart payload'});return;}
 // Open immediately in the content-script click gesture; do not await storage first.
 const opening=chrome.action.openPopup({windowId:sender.tab.windowId});
 Promise.all([opening,chrome.storage.session.set({laterCart:{payload,tabId:sender.tab.id,at:Date.now()}})]).then(()=>sendResponse({ok:true}),()=>sendResponse({error:'Could not open Mercatus. Click its toolbar icon to open the popup.'}));return true;
});
