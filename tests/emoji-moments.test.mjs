import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiMood } from '../src/emoji-moments.mjs';

test('emoji moments understand complete emoji sequences and moods', () => {
  for (const text of ['🥳', '🎉🎊', '  🥳 \n 🙌  ']) assert.equal(emojiMood(text), 'party');
  for (const text of ['❤️', '💕🥰', '❤']) assert.equal(emojiMood(text), 'love');
  for (const text of ['😢', '😴😌']) assert.equal(emojiMood(text), 'gentle');
  for (const text of ['😊', '👍🏽', '👨‍👩‍👧‍👦', '🇮🇳', '1️⃣', '🧑🏾‍💻']) assert.equal(emojiMood(text), 'playful');
});

test('ordinary text, markup, incomplete emoji and long emoji runs stay still', () => {
  for (const text of ['', ' ', null, {}, 'hello 🥳', '123', '#', '🇮', '<img src=x>🥳', '🥳'.repeat(7)]) {
    assert.equal(emojiMood(text), null, String(text));
  }
  assert.equal(emojiMood('😊'.repeat(6)), 'playful');
});
