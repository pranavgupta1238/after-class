import { emojiArtwork } from './emoji-catalog.mjs';

const editors = new WeakMap();
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function clipDraft(value, limit = 500) {
  let result = '';
  for (const { segment } of graphemes.segment(String(value).replace(/[\r\n]+/g, ' '))) {
    if (result.length + segment.length > limit) break;
    result += segment;
  }
  return result;
}
// Images are presentation only; drafts, clipboard data and messages stay Unicode.
export function composerText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeName === 'IMG') return node.dataset.emoji || '';
  if (node.nodeName === 'BR') return ' ';
  // Browsers leave a lone BR behind when an editable field becomes empty.
  if (node.childNodes.length === 1 && node.firstChild?.nodeName === 'BR') return '';
  return [...node.childNodes].map(composerText).join('');
}
function selectionOf(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  const prefix = document.createRange();
  prefix.selectNodeContents(editor); prefix.setEnd(range.startContainer, range.startOffset);
  const start = composerText(prefix.cloneContents()).length;
  return { start, end: start + composerText(range.cloneContents()).length };
}
function placeSelection(editor, start, end = start) {
  const point = offset => {
    let used = 0;
    for (const node of editor.childNodes) {
      const length = composerText(node).length;
      if (offset <= used + length) {
        if (node.nodeType === 3) return [node, Math.max(0, offset - used)];
        const index = [...editor.childNodes].indexOf(node);
        return [editor, index + (offset > used ? 1 : 0)];
      }
      used += length;
    }
    return [editor, editor.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...point(start)); range.setEnd(...point(end));
  const selection = window.getSelection();
  selection.removeAllRanges(); selection.addRange(range);
}
function paint(state, focus = document.activeElement === state.editor) {
  const fragment = document.createDocumentFragment();
  for (const { segment } of graphemes.segment(state.value)) {
    const asset = emojiArtwork(segment);
    if (asset) {
      const img = document.createElement('img');
      img.src = asset.still; img.alt = segment; img.dataset.emoji = segment;
      img.className = 'ac-emoji'; img.contentEditable = 'false'; img.draggable = false;
      img.width = 26; img.height = 26;
      fragment.append(img);
    } else if (fragment.lastChild?.nodeType === 3) fragment.lastChild.appendData(segment);
    else fragment.append(document.createTextNode(segment));
  }
  state.editor.replaceChildren(fragment);
  state.editor.dataset.empty = String(!state.value);
  state.input.value = state.value;
  if (focus) { state.editor.focus(); placeSelection(state.editor, state.start, state.end); }
}
function rememberSelection(state) {
  const selection = selectionOf(state.editor);
  if (selection) Object.assign(state, selection);
}
function apply(state, value, start, end = start, type = '') {
  value = clipDraft(value, state.limit);
  const changed = value !== state.value;
  Object.assign(state, { value, start: Math.min(start, value.length), end: Math.min(end, value.length) });
  if (changed) {
    const entry = { value, start: state.start, end: state.end };
    const group = type === 'insertText' && state.lastType === type && Date.now() - state.lastEdit < 750 && state.index > 0 && state.index === state.history.length - 1;
    if (group) state.history[state.index] = entry;
    else { state.history.splice(state.index + 1); state.history.push(entry); if (state.history.length > 100) state.history.shift(); state.index = state.history.length - 1; }
    state.lastEdit = Date.now(); state.lastType = type;
  }
  paint(state);
  if (changed) state.input.dispatchEvent(new Event('input', { bubbles: true }));
}
function replaceSelection(state, text) {
  rememberSelection(state);
  state.history[state.index] = { value: state.value, start: state.start, end: state.end };
  const inserted = clipDraft(text, state.limit - state.value.length + state.end - state.start);
  const value = state.value.slice(0, state.start) + inserted + state.value.slice(state.end);
  const position = state.start + inserted.length;
  apply(state, value, position);
  state.editor.focus(); placeSelection(state.editor, position);
}
function undo(state, direction) {
  const next = state.index + direction;
  if (next < 0 || next >= state.history.length) return;
  state.index = next; state.lastType = '';
  Object.assign(state, state.history[next]); paint(state, true);
  state.input.dispatchEvent(new Event('input', { bubbles: true }));
}
export function mountEmojiComposers(root = document) {
  root.querySelectorAll('input#message,input#private-msg-input').forEach(input => {
    if (editors.has(input)) return;
    const editor = document.createElement('div');
    editor.id = `${input.id}-editor`; editor.className = 'emoji-composer';
    editor.contentEditable = 'true'; editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', input.id === 'message' ? 'Message campus' : 'Private message');
    editor.setAttribute('aria-multiline', 'false'); editor.setAttribute('enterkeyhint', 'send');
    editor.dataset.placeholder = input.placeholder; editor.spellcheck = true;
    const state = { input, editor, value: input.value, start: input.value.length, end: input.value.length, limit: input.maxLength > 0 ? input.maxLength : 500, history: [{ value: input.value, start: input.value.length, end: input.value.length }], index: 0, composing: false };
    editors.set(input, state);
    input.type = 'hidden'; input.after(editor); paint(state, false);
    editor.addEventListener('beforeinput', event => {
      if (event.isComposing || state.composing) return;
      rememberSelection(state);
      state.history[state.index] = { value: state.value, start: state.start, end: state.end };
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault(); undo(state, event.inputType === 'historyUndo' ? -1 : 1);
      } else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault(); if (state.value.trim()) input.form?.requestSubmit();
      } else if (event.inputType === 'insertText' && event.data && event.data.length > state.limit - state.value.length + state.end - state.start) {
        event.preventDefault(); replaceSelection(state, event.data);
      }
    });
    editor.addEventListener('input', event => {
      if (state.composing || event.isComposing) return;
      const selection = selectionOf(editor) || { start: composerText(editor).length, end: composerText(editor).length };
      apply(state, composerText(editor), selection.start, selection.end, event.inputType);
    });
    editor.addEventListener('compositionstart', () => { state.composing = true; });
    editor.addEventListener('compositionend', () => {
      state.composing = false;
      const selection = selectionOf(editor) || { start: composerText(editor).length, end: composerText(editor).length };
      apply(state, composerText(editor), selection.start, selection.end);
    });
    editor.addEventListener('keydown', event => {
      if (event.isComposing || state.composing || event.keyCode === 229) return;
      if (event.key === 'Enter') { event.preventDefault(); if (state.value.trim()) input.form?.requestSubmit(); }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z','y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); undo(state, event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1);
      }
    });
    for (const name of ['keyup','pointerup','focus']) editor.addEventListener(name, () => rememberSelection(state));
    editor.addEventListener('blur', () => { rememberSelection(state); input.dispatchEvent(new FocusEvent('blur')); });
    editor.addEventListener('paste', event => { event.preventDefault(); replaceSelection(state, event.clipboardData?.getData('text/plain') || ''); });
    editor.addEventListener('drop', event => { event.preventDefault(); replaceSelection(state, event.dataTransfer?.getData('text/plain') || ''); });
    for (const name of ['copy','cut']) editor.addEventListener(name, event => {
      rememberSelection(state);
      if (state.start === state.end || !event.clipboardData) return;
      event.preventDefault(); event.clipboardData.setData('text/plain', state.value.slice(state.start, state.end));
      if (name === 'cut') replaceSelection(state, '');
    });
  });
}
export function insertComposerText(input, text) {
  const state = editors.get(input);
  if (state) replaceSelection(state, text);
}
export function focusComposer(input) {
  const state = editors.get(input);
  if (state) { state.editor.focus(); placeSelection(state.editor, state.start, state.end); }
  else input?.focus();
}
export function clearComposer(input) {
  const state = editors.get(input);
  if (!state) { input.value = ''; return; }
  Object.assign(state, { value: '', start: 0, end: 0, index: 0, history: [{ value: '', start: 0, end: 0 }], lastType: '' });
  paint(state);
}
export function setComposerPlaceholder(input, value) {
  if (!input) return;
  input.placeholder = value;
  const state = editors.get(input);
  if (state) state.editor.dataset.placeholder = value;
}
export function captureComposer(input) {
  const state = editors.get(input);
  if (!state) return null;
  rememberSelection(state);
  return { value: state.value, start: state.start, end: state.end, focused: document.activeElement === state.editor };
}
export function restoreComposer(input, draft) {
  const state = editors.get(input);
  if (!state || !draft) return;
  Object.assign(state, draft, { history: [{ value: draft.value, start: draft.start, end: draft.end }], index: 0 });
  paint(state, draft.focused);
}
