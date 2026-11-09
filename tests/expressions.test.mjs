import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EXPRESSIONS, expressionArt, renderExpressions } from '../src/expressions.mjs';
import { selectEmojis, EMOJI_CATEGORIES, emojiArtwork } from '../src/emoji-catalog.mjs';

test('complete catalog has local artwork, unique Unicode and accessible labels', () => {
 assert.equal(EXPRESSIONS.length,3953);
 assert.equal(new Set(EXPRESSIONS.map(e=>e.e)).size,EXPRESSIONS.length);
 for(const item of EXPRESSIONS){
   assert.ok(EMOJI_CATEGORIES.some(category=>category.id===item.c));
   const art=emojiArtwork(item.e);
   assert.ok(existsSync(new URL(`../public${art.still}`,import.meta.url)),item.n);
   if(art.animation) assert.ok(existsSync(new URL(`../public${art.animation}`,import.meta.url)),item.n);
   const html=expressionArt(item.e);
   assert.ok(html.includes('aria-label="'));
   assert.ok(html.includes('alt="'+item.e+'"'));
   assert.ok(!html.includes('<script'));
 }
});
test('full-colour emoji rendering preserves text, skin tones and whole sequences',()=>{
 const result=renderExpressions('&lt;script&gt; 😊 🦊 ❤️ 👍🏽 👩🏽‍💻 🇮🇳');
 assert.ok(result.startsWith('&lt;script&gt; '));
 assert.equal((result.match(/<img /g)||[]).length,6);
 assert.ok(result.includes('1f44d-1f3fd.webp'));
 assert.ok(result.includes('1f469-1f3fd-200d-1f4bb.webp'));
 assert.ok(expressionArt('<script>').includes('&lt;script&gt;'));
 assert.equal(renderExpressions('plain &amp; text 123'), 'plain &amp; text 123');
});
test('picker filters names, aliases, categories and skin tone without losing variants',()=>{
 assert.ok(selectEmojis({query:'india'}).some(e=>e.e==='🇮🇳'));
 assert.ok(selectEmojis({query:'lol'}).some(e=>e.e==='😂'));
 assert.ok(selectEmojis({query:'thumbs up',tone:'127997'}).some(e=>e.e==='👍🏽'));
 assert.ok(!selectEmojis({query:'thumbs up',tone:'127997'}).some(e=>e.e==='👍🏻'));
 assert.ok(selectEmojis({query:'👍🏿'}).some(e=>e.e==='👍🏿'));
 assert.ok(selectEmojis({category:'flags'}).every(e=>e.c==='flags'));
 assert.equal(selectEmojis({tone:'all'}).length,3953);
 assert.deepEqual(selectEmojis({category:'recent',recent:['🥳','bad','😂']}).map(e=>e.e),['🥳','😂']);
 assert.equal(selectEmojis({query:'no such emoji 12345'}).length,0);
});

test('3D assets preserve exact skin tones and keep catalog gaps available',()=>{
 assert.notEqual(emojiArtwork('👋🏻').still,emojiArtwork('👋🏿').still);
 assert.ok(emojiArtwork('👋🏻').still.includes('fluent-3d-v1'));
 assert.ok(emojiArtwork('🇮🇳').still.endsWith('.svg'));
 assert.ok(EXPRESSIONS.filter(e=>emojiArtwork(e.e).still.endsWith('.webp')).length>3000);
});
