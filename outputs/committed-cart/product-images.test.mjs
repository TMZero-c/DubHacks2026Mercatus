import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCart} from './engine.mjs';
import {productImages} from './product-images.mjs';
test('product images are optional public HTTPS display metadata, not commitment terms',()=>{
 const now=Date.now(),body={items:[{name:'Product',variant:'Exact model',price:'10',quantity:1}],hours:12,sellers:'Authorized retailers only',deliveryDate:new Date(now+86400000*7).toISOString().slice(0,10),publish:true,consent:true};
 const bare=validateCart(body,now),illustrated=validateCart({...body,productImages:['https://m.media-amazon.com/images/I/product.jpg']},now);
 assert.equal(bare.digest,illustrated.digest);assert.equal(illustrated.productImages[0],'https://m.media-amazon.com/images/I/product.jpg');assert.deepEqual(bare.items,illustrated.items);
});
test('unsafe, credentialed and local image URLs are discarded',()=>{
 const values=['http://example.com/image.jpg','https://user:secret@example.com/x','https://localhost/x','https://127.0.0.1/x','https://192.168.1.1/x','https://[::1]/x','data:image/svg+xml,test','javascript:alert(1)'];
 assert.deepEqual(productImages(values,values.length),values.map(()=>''));assert.deepEqual(productImages(['https://cdn.example.com/photo.png'],2),['https://cdn.example.com/photo.png','']);
});
