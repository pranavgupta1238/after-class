import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiMood } from '../src/emoji-moments.mjs';
import { emojiBehavior } from '../src/emoji-behaviors.mjs';

test('emoji-only messages preserve complete sequences, including mixed emotions', () => {
  for (const text of ['🥳', '🎉🎊', '  🥳 \n 🙌  ', '❤️', '💕🥰', '❤', '😭🤩🫠😜🥲', '😴😌', '😊', '👍🏽', '👨‍👩‍👧‍👦', '🇮🇳', '1️⃣', '🧑🏾‍💻']) {
    assert.equal(emojiMood(text), 'emoji');
  }
});

test('ordinary text, markup, incomplete emoji and long emoji runs stay still', () => {
  for (const text of ['', ' ', null, {}, 'hello 🥳', '123', '#', '🇮', '<img src=x>🥳', '🥳'.repeat(7)]) {
    assert.equal(emojiMood(text), null, String(text));
  }
  assert.equal(emojiMood('😊'.repeat(6)), 'emoji');
});

test('each emoji chooses its own emotion or object behaviour', () => {
  for (const [emoji, kind] of [['😭','sob'],['🥲','tear'],['😢','tear'],['😂','laugh'],['🫠','melt'],['🤩','starEyes'],['😜','tongue'],['😉','wink'],['😍','heartEyes'],['😴','sleep'],['🔥','fire'],['👋🏽','wave'],['❤️','heart'],['💔','heartbreak'],['🇮🇳','flag'],['☕','steam']]) {
    assert.equal(emojiBehavior(emoji), kind, emoji);
  }
});

test('unmapped artwork remains still instead of receiving a generic bounce', () => {
  for (const emoji of ['🧱','📁','1️⃣','👨‍👩‍👧‍👦']) assert.equal(emojiBehavior(emoji), null);
});
