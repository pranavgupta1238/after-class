const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const emoji = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*)$/u;

export function emojiMood(text) {
  if (typeof text !== 'string' || text.length > 160) return null;
  const parts = [...segmenter.segment(text.trim())].map(p => p.segment).filter(p => !/^\s+$/u.test(p));
  if (!parts.length || parts.length > 6 || !parts.every(p => emoji.test(p))) return null;
  if (/[🥳🎉🎊🎂🎈🙌👏🤩]/u.test(text)) return 'party';
  if (/[❤💕💖💗💘💝💞🥰😍😘🤗]/u.test(text)) return 'love';
  if (/[😴😌😔😢😭🥹🌙]/u.test(text)) return 'gentle';
  return 'playful';
}

const seen = new Set();
const active = new Set();
const duration = 2800;

// Only call for a live, server-accepted message, never for history or rerenders.
export function playEmojiMoment(element, { id, text, isSystem = false } = {}) {
  if (!id || isSystem || seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  const mood = emojiMood(text);
  if (!mood || !element?.isConnected || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const chat = element.closest('#chat-messages, #private-messages');
  if (!chat || !element.animate) return false;
  const bounds = chat.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
  while (active.size >= 3) active.values().next().value();

  const frames = mood === 'gentle'
    ? [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .3 }, { transform: 'scale(1)', offset: 1 }]
    : mood === 'love'
      ? [{ transform: 'scale(1)' }, { transform: 'scale(1.38)', offset: .18 }, { transform: 'scale(1.08)', offset: .35 }, { transform: 'scale(1.28)', offset: .52 }, { transform: 'scale(1)', offset: 1 }]
      : [{ transform: 'translateY(0) scale(1) rotate(0)' }, { transform: 'translateY(-9px) scale(1.5) rotate(-12deg)', offset: .18 }, { transform: 'translateY(-4px) scale(1.3) rotate(10deg)', offset: .36 }, { transform: 'translateY(-7px) scale(1.4) rotate(-7deg)', offset: .55 }, { transform: 'translateY(0) scale(1) rotate(0)', offset: 1 }];
  const animations = [element.animate(frames, { duration, easing: 'ease-in-out' })];
  let layer;
  if (mood === 'party' || mood === 'love') {
    layer = document.createElement('div');
    layer.className = 'emoji-moment-burst';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.clipPath = `inset(${Math.max(0, bounds.top)}px ${Math.max(0, innerWidth - bounds.right)}px ${Math.max(0, innerHeight - bounds.bottom)}px ${Math.max(0, bounds.left)}px)`;
    const colors = ['#e6b85c', '#d88975', '#8da994', '#b49ac9', '#e3ca8f'];
    for (let i = 0; i < (mood === 'party' ? 18 : 8); i++) {
      const particle = document.createElement('i');
      particle.className = mood === 'love' ? 'emoji-moment-heart' : 'emoji-moment-confetti';
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;
      particle.style.background = mood === 'love' ? '#d88985' : colors[i % colors.length];
      layer.appendChild(particle);
      const angle = (i / 18) * Math.PI * 2;
      const x = mood === 'love' ? (i - 3.5) * 17 : Math.cos(angle) * (45 + i % 3 * 20);
      const y = mood === 'love' ? -60 - i % 3 * 20 : Math.sin(angle) * 60 - 35;
      animations.push(particle.animate([
        { transform: 'translate(0, 0) rotate(-45deg) scale(.3)', opacity: 0 },
        { opacity: 1, offset: .12 },
        { transform: `translate(${x}px, ${y}px) rotate(${mood === 'love' ? -45 : i * 37}deg) scale(1)`, opacity: .9, offset: .6 },
        { transform: `translate(${x * 1.2}px, ${y + (mood === 'love' ? -25 : 55)}px) rotate(${mood === 'love' ? -45 : i * 55}deg) scale(.7)`, opacity: 0 }
      ], { duration: 2300, delay: i % 4 * 75, easing: 'ease-out' }));
    }
    document.body.appendChild(layer);
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const observer = new MutationObserver(() => { if (!element.isConnected) cleanup(); });
  const timer = setTimeout(cleanup, duration);
  function cleanup() {
    clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    layer?.remove();
    observer.disconnect();
    chat.removeEventListener('scroll', cleanup);
    window.removeEventListener('resize', cleanup);
    document.removeEventListener('visibilitychange', cleanup);
    reducedMotion.removeEventListener('change', cleanup);
    active.delete(cleanup);
  }
  active.add(cleanup);
  observer.observe(document.body, { childList: true, subtree: true });
  chat.addEventListener('scroll', cleanup, { once: true });
  window.addEventListener('resize', cleanup, { once: true });
  document.addEventListener('visibilitychange', cleanup, { once: true });
  reducedMotion.addEventListener('change', cleanup, { once: true });
  return true;
}
