import test from 'node:test';
import assert from 'node:assert/strict';
import { clipDraft, composerText } from '../src/emoji-composer.mjs';

test('draft limits preserve complete emoji, skin tones and joined families', () => {
  assert.equal(clipDraft('a'.repeat(499) + '🥲'), 'a'.repeat(499));
  assert.equal(clipDraft('👍🏽', 3), '');
  assert.equal(clipDraft('👨‍👩‍👧‍👦', 10), '');
  assert.equal(clipDraft('👍🏽', 4), '👍🏽');
  assert.equal(clipDraft('Hello\r\nthere'), 'Hello there');
});

test('composer serializes artwork as Unicode without image markup or URLs', () => {
  const root = { nodeType: 1, nodeName: 'DIV', childNodes: [
    { nodeType: 3, textContent: 'Hello ' },
    { nodeType: 1, nodeName: 'IMG', dataset: { emoji: '👍🏽' } },
    { nodeType: 1, nodeName: 'BR' },
    { nodeType: 1, nodeName: 'SPAN', childNodes: [{ nodeType: 3, textContent: 'friend' }] },
  ] };
  assert.equal(composerText(root), 'Hello 👍🏽 friend');
});

test('browser placeholder line break serializes to an empty draft', () => {
  const br = { nodeType: 1, nodeName: 'BR' };
  assert.equal(composerText({ nodeType: 1, nodeName: 'DIV', childNodes: [br], firstChild: br }), '');
});
