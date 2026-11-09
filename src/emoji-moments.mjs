import { emojiArtwork } from './emoji-catalog.mjs';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const emoji = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)$/u;
export function emojiCount(text) {
  if (typeof text !== 'string' || text.length > 160) return 0;
  const parts = [...segmenter.segment(text.trim())].map(p => p.segment).filter(p => !/^\s+$/u.test(p));
  return parts.length && parts.length <= 6 && parts.every(p => emoji.test(p)) ? parts.length : 0;
}
export function emojiMood(text) { return emojiCount(text) ? 'emoji' : null; }

// Authored frame animation; each emoji retains its original 3D material and shape.
const seen = new Set();
const active = new Set();
const mediaCache = new Map();
async function loadAnimation(path) {
  if (!mediaCache.has(path)) {
    const request = fetch(path, { signal: AbortSignal.timeout(3500) }).then(response => {
      if (!response.ok) throw new Error('Animation unavailable');
      return response.blob();
    });
    mediaCache.set(path, request);
    request.catch(() => mediaCache.delete(path));
    // Cache blobs, not object URLs: every playback can start at its first frame.
    if (mediaCache.size > 16) mediaCache.delete(mediaCache.keys().next().value);
  }
  return mediaCache.get(path);
}

export function playEmojiMoment(element, { id, text, isSystem = false } = {}) {
  if (!id || isSystem || seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!emojiMood(text) || !element?.isConnected || document.hidden || reduced.matches) return false;
  const chat = element.closest('#chat-messages,#private-messages');
  if (!chat) return false;
  const bounds = chat.getBoundingClientRect(), rect = element.getBoundingClientRect();
  if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
  const images = [...element.querySelectorAll('img.ac-emoji')]
    .map(img => ({ img, asset: emojiArtwork(img.alt) }))
    .filter(({ asset }) => asset?.animation);
  if (!images.length) return false;
  while (active.size >= 3) active.values().next().value()();

  const actors = [], urls = [];
  let stopped = false, playbackTimer;
  const observer = new MutationObserver(() => { if (!element.isConnected) cleanup(); });
  const maxPlayback = Math.min(5000, Math.max(1800, ...images.map(({ asset }) => asset.duration)));
  const deadline = setTimeout(cleanup, maxPlayback + 3500);
  function cleanup() {
    if (stopped) return;
    stopped = true;
    clearTimeout(deadline); clearTimeout(playbackTimer); observer.disconnect();
    for (const { img, wrapper, visibility } of actors) {
      img.style.visibility = visibility;
      wrapper.replaceWith(img);
    }
    urls.forEach(url => URL.revokeObjectURL(url));
    chat.removeEventListener('scroll', cleanup);
    window.removeEventListener('resize', cleanup);
    document.removeEventListener('visibilitychange', cleanup);
    reduced.removeEventListener('change', cleanup);
    active.delete(cleanup);
  }
  active.add(cleanup);
  observer.observe(document.body, { childList: true, subtree: true });
  chat.addEventListener('scroll', cleanup, { once: true });
  window.addEventListener('resize', cleanup, { once: true });
  document.addEventListener('visibilitychange', cleanup, { once: true });
  reduced.addEventListener('change', cleanup, { once: true });

  Promise.all(images.map(async ({ img, asset }) => {
    try {
      const blob = await loadAnimation(asset.animation);
      if (stopped || !img.isConnected) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const motion = new Image();
      motion.className = 'emoji-actor-art';
      motion.alt = ''; motion.setAttribute('aria-hidden', 'true'); motion.draggable = false;
      motion.src = url;
      await motion.decode();
      if (stopped || !img.isConnected) return;
      if (!playbackTimer) playbackTimer = setTimeout(cleanup, maxPlayback);
      const size = img.getBoundingClientRect(), wrapper = document.createElement('span');
      wrapper.className = 'emoji-actor';
      wrapper.style.width = `${size.width}px`; wrapper.style.height = `${size.height}px`;
      wrapper.setAttribute('role', 'img');
      wrapper.setAttribute('aria-label', img.getAttribute('aria-label') || img.alt);
      const visibility = img.style.visibility;
      img.before(wrapper); wrapper.append(img, motion); img.style.visibility = 'hidden';
      actors.push({ img, wrapper, visibility });
    } catch { /* Keep the still artwork when a request or decoder fails. */ }
  })).then(() => { if (!actors.length) cleanup(); });
  return true;
}
