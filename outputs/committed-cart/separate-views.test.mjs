import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
test('shopper and merchant documents do not expose a view switch or each other’s workspace',async()=>{
 const shopper=parseHTML(await readFile(new URL('./index.html',import.meta.url),'utf8')).document;
 const merchant=parseHTML(await readFile(new URL('./merchant.html',import.meta.url),'utf8')).document;
 assert.ok(shopper.getElementById('shopperView'));
 assert.equal(shopper.getElementById('merchantView'),null);
 assert.equal(shopper.querySelector('script[src="/merchant-manager.js"]'),null);
 assert.ok(merchant.getElementById('merchantView'));
 assert.equal(merchant.getElementById('shopperView'),null);
 assert.ok(merchant.querySelector('script[src="/merchant-auth.js"]'));
 for(const doc of [shopper,merchant]){
  assert.equal(doc.getElementById('shopperTab'),null);
  assert.equal(doc.getElementById('merchantTab'),null);
  const ids=[...doc.querySelectorAll('[id]')].map(node=>node.id);
  assert.equal(new Set(ids).size,ids.length);
 }
});
