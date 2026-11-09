import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiMood, emojiCount } from '../src/emoji-moments.mjs';
import { emojiArtwork } from '../src/emoji-catalog.mjs';

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

test('emotions use distinct authored animation files', () => {
  const crying = emojiArtwork('😭'), laughing = emojiArtwork('😂'), melting = emojiArtwork('🫠');
  assert.ok(crying.duration > 0 && laughing.duration > 0 && melting.duration > 0);
  assert.notEqual(crying.animation, laughing.animation);
  assert.notEqual(laughing.animation, melting.animation);
  assert.ok(crying.animation.endsWith('-motion.webp'));
});

test('emoji count treats compound sequences as one character for layout', () => {
  assert.equal(emojiCount('👨‍👩‍👧‍👦'), 1);
  assert.equal(emojiCount('👍🏽 🇮🇳'), 2);
  assert.equal(emojiCount('hello 😭'), 0);
  assert.equal(emojiCount('😭'.repeat(7)), 0);
});

test('unknown or non-animated emoji do not receive a generic effect', () => {
  assert.equal(emojiArtwork('unknown'), null);
  assert.equal(emojiArtwork('🇮🇳').animation, null);
});
