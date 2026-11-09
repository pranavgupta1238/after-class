import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPRESSIONS, expressionArt, renderExpressions } from '../src/expressions.mjs';
test('expression artwork preserves portable Unicode and labels every original', () => {
 assert.equal(new Set(EXPRESSIONS.map(e=>e.e)).size, EXPRESSIONS.length);
 for(const e of EXPRESSIONS){assert.ok(expressionArt(e.e).includes(`aria-label="${e.n}"`));assert.ok(!expressionArt(e.e).includes('<script'));}
});
test('renders supported moods without changing escaped text or unsupported emoji',()=>{
 const result=renderExpressions('&lt;script&gt; 😊 🦊 ❤️');
 assert.ok(result.startsWith('&lt;script&gt; '));assert.ok(result.includes('aria-label="Warm"'));assert.ok(result.includes('🦊'));assert.ok(result.includes('aria-label="Love"'));
});
