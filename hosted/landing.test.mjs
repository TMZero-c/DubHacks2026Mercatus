import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

test('public landing points Merchant desk at /merchant and has no extra See the steps CTA',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const {document}=parseHTML(html);
 assert.equal(html.includes('See the steps'),false);
 assert.equal(/later-merchant-mcp|later\./i.test(html),false);
 const desk=[...document.querySelectorAll('a')].filter(a=>a.textContent.trim()==='Merchant desk');
 assert.ok(desk.length>=1);
 for(const link of desk)assert.equal(link.getAttribute('href'),'/merchant');
 assert.ok(document.querySelector('a[href="#steps"]'));
 assert.ok(document.querySelector('#steps'));
});
