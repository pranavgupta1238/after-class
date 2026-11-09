import catalog from './data/emoji-catalog.json' with { type: 'json' };
import artwork from './data/emoji-artwork.json' with { type: 'json' };
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = text => text.replace(/\uFE0F/g, '');
const base = text => normalize(text.replace(/\p{Emoji_Modifier}/gu, ''));
export const EXPRESSIONS = catalog.map(([e,n,c,file]) => ({e,n,c,file,t:n}));
const lookup = new Map(EXPRESSIONS.map(item => [normalize(item.e), item]));
const segmenter = new Intl.Segmenter(undefined, { granularity:'grapheme' });
export const EMOJI_CATEGORIES = [
 ['all','All','😀'],['recent','Recent','🕘'],['smileys','Smileys & emotion','😊'],['people','People & body','👋'],['nature','Animals & nature','🐻'],['food','Food & drink','🍔'],['travel','Travel & places','🚗'],['activities','Activities','⚽'],['objects','Objects','💡'],['symbols','Symbols','❤️'],['flags','Flags','🏳️'],['components','Components','🦰']
].map(([id,label,emoji])=>({id,label,emoji}));
const specialTags = {'😂':'lol lmao funny laugh','🤣':'lol lmao funny laugh','😊':'happy smile warm','🥳':'party birthday celebrate','👍':'yes ok approve like','❤️':'love heart','😢':'sad cry tears','😭':'sad cry sob','🙏':'please thanks thank prayer namaste','☕':'chai tea coffee','💯':'hundred perfect','🎉':'party congratulations celebrate'};
for (const item of EXPRESSIONS) item.t = `${item.n} ${specialTags[item.e]||''}`.toLowerCase();
export function emojiArtwork(value) {
 const item = lookup.get(normalize(String(value)));
 if (!item) return null;
 if (Object.hasOwn(artwork, item.file)) {
   const base = `/emoji/fluent-3d-v1/${item.file}`;
   return { still: `${base}.webp`, animation: artwork[item.file] ? `${base}-motion.webp` : null, duration: artwork[item.file] };
 }
 return { still: `/emoji/twemoji-17.0.3/${item.file}.svg`, animation: null, duration: 0 };
}
export function expressionArt(value, { lazy = false } = {}) {
 const item = lookup.get(normalize(String(value)));
 if (!item) return escape(value);
 return `<img class="ac-expression ac-emoji" src="${emojiArtwork(value).still}" alt="${escape(value)}" aria-label="${escape(item.n)}" width="32" height="32" draggable="false" decoding="async"${lazy?' loading="lazy"':''}>`;
}
export function renderExpressions(escapedText) {
 return [...segmenter.segment(String(escapedText))].map(({segment}) => lookup.has(normalize(segment)) ? expressionArt(segment) : segment).join('');
}
export function selectEmojis({query='',category='all',tone='default',recent=[]} = {}) {
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 let entries=category==='recent'&&!terms.length ? recent.map(e=>lookup.get(normalize(e))).filter(Boolean) : EXPRESSIONS;
 if(terms.length) entries=entries.filter(item=>item.e===query.trim()||terms.every(term=>item.t.includes(term)));
 else if(!['all','recent'].includes(category)) entries=entries.filter(item=>item.c===category);
 // An explicit emoji or skin-tone search must still find that exact variant.
 if(tone==='all'||category==='recent'||/\p{Emoji_Modifier}|skin tone/u.test(query)) return entries;
 if(tone==='default') return entries.filter(item=>! /\p{Emoji_Modifier}/u.test(item.e));
 const modifier=String.fromCodePoint(Number(tone));
 const variants=new Map(entries.filter(item=>item.e.includes(modifier)&&[...item.e.matchAll(/\p{Emoji_Modifier}/gu)].every(m=>m[0]===modifier)).map(item=>[base(item.e),item]));
 const selected=new Map();
 for(const item of entries){
   const key=base(item.e);
   if(! /\p{Emoji_Modifier}/u.test(item.e)) selected.set(key,variants.get(key)||item);
   else if(variants.has(key)) selected.set(key,variants.get(key));
 }
 return [...selected.values()];
}
