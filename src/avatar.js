// ── Anonymous Character, Full-Body Spotlight Stage & Bitmoji SVG Generator ──

export const AVATAR_OPTIONS = {
  skins: [
    { id: 'fair', label: 'Fair', color: '#FCD8B8', shadow: '#EABF98' },
    { id: 'peach', label: 'Peach', color: '#F3B896', shadow: '#D99B78' },
    { id: 'golden', label: 'Golden', color: '#E2A169', shadow: '#C8854D' },
    { id: 'caramel', label: 'Caramel', color: '#BA7647', shadow: '#9F5B2F' },
    { id: 'bronze', label: 'Bronze', color: '#8A4A28', shadow: '#6F3414' },
    { id: 'deep', label: 'Deep', color: '#582B14', shadow: '#3E1906' }
  ],
  hairs: [
    { id: 'crop', label: 'Short Crop' },
    { id: 'curls', label: 'Fluffy Curls' },
    { id: 'bob', label: 'Sleek Bob' },
    { id: 'afro', label: 'Afro Puff' },
    { id: 'beanie', label: 'Skater Beanie' },
    { id: 'waves', label: 'Long Waves' }
  ],
  hairColors: [
    { id: 'pink_pastel', label: 'Cotton Candy', color: '#F7A8B8' },
    { id: 'lavender_pastel', label: 'Lavender Haze', color: '#B5A6DB' },
    { id: 'mint_pastel', label: 'Mint Sage', color: '#98D7C2' },
    { id: 'sky_pastel', label: 'Icy Sky', color: '#92C9E8' },
    { id: 'butter_blonde', label: 'Butter Blonde', color: '#FDF1AA' },
    { id: 'peach_glow', label: 'Peach Glow', color: '#F8B195' },
    { id: 'espresso', label: 'Espresso', color: '#4A3728' },
    { id: 'charcoal', label: 'Charcoal', color: '#2B303A' },
    { id: 'coral', label: 'Coral Red', color: '#E05C3A' }
  ],
  outfits: [
    { id: 'tee', label: '✦ Brand Tee' },
    { id: 'hoodie', label: 'Campus Hoodie' },
    { id: 'varsity', label: 'Varsity Jacket' },
    { id: 'sweater', label: 'Cozy Knit' },
    { id: 'polo', label: 'Collared Polo' },
    { id: 'puffer', label: 'Puffer Vest' },
    { id: 'jersey', label: 'Sport Jersey' },
    { id: 'denim', label: 'Denim Jacket' },
    { id: 'scarf', label: 'Winter Scarf' },
    { id: 'blazer', label: 'Campus Blazer' }
  ],
  outfitColors: [
    { id: 'matcha', label: 'Matcha Latte', color: '#97BBA2' },
    { id: 'dusty_rose', label: 'Dusty Rose', color: '#E89A9A' },
    { id: 'periwinkle', label: 'Periwinkle', color: '#97A7E4' },
    { id: 'buttercream', label: 'Buttercream', color: '#FDEAA8' },
    { id: 'lilac_mist', label: 'Lilac Mist', color: '#C3B1E1' },
    { id: 'apricot', label: 'Apricot Sorbet', color: '#FAC29A' },
    { id: 'forest', label: 'Deep Forest', color: '#244D42' },
    { id: 'coral', label: 'Coral Punch', color: '#E05C3A' },
    { id: 'ink', label: 'Midnight Ink', color: '#172421' },
    { id: 'denim_blue', label: 'Classic Denim', color: '#3D6488' }
  ],
  expressions: [
    { id: 'smile', label: 'Happy Smile' },
    { id: 'chill', label: 'Chill Smirk' },
    { id: 'wink', label: 'Playful Wink' },
    { id: 'laugh', label: 'Laughing Joy' },
    { id: 'curious', label: 'Curious Ooh' }
  ],
  eyewear: [
    { id: 'none', label: 'None' },
    { id: 'wayfarer', label: 'Classic Shades' },
    { id: 'aviator', label: 'Retro Aviators' },
    { id: 'round_wire', label: 'Wireframe Round' },
    { id: 'square_acetate', label: 'Square Glasses' },
    { id: 'sunset_tint', label: 'Sunset Tinted' }
  ],
  accessories: [
    { id: 'none', label: 'None' },
    { id: 'headphones', label: 'DJ Headphones' },
    { id: 'airpods', label: 'AirPods' },
    { id: 'cap', label: 'College Cap' },
    { id: 'hoops', label: 'Gold Hoops' },
    { id: 'freckles', label: 'Freckles' },
    { id: 'sparkle', label: 'Sparkles' }
  ],
  bgs: [
    { id: 'sage', label: 'Sage', color: '#DCECE4' },
    { id: 'peach', label: 'Peach', color: '#FBE5DC' },
    { id: 'lavender', label: 'Lavender', color: '#ECE7F8' },
    { id: 'lime', label: 'Lime', color: '#E6F89E' },
    { id: 'charcoal', label: 'Charcoal', color: '#1F312D' },
    { id: 'cream', label: 'Cream', color: '#F9F6EA' }
  ]
};

export function getDeterministicAvatar(seed = 'Anonymous') {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const get = (arr, shift) => arr[(hash >> shift) % arr.length];

  return {
    skin: get(AVATAR_OPTIONS.skins, 0).id,
    hair: get(AVATAR_OPTIONS.hairs, 3).id,
    hairColor: get(AVATAR_OPTIONS.hairColors, 6).id,
    outfit: get(AVATAR_OPTIONS.outfits, 9).id,
    outfitColor: get(AVATAR_OPTIONS.outfitColors, 12).color,
    expression: get(AVATAR_OPTIONS.expressions, 15).id,
    eyewear: get(AVATAR_OPTIONS.eyewear, 18).id,
    accessory: get(AVATAR_OPTIONS.accessories, 21).id,
    bg: get(AVATAR_OPTIONS.bgs, 24).id
  };
}

// ── Standard Circular Badge SVG ──────────────────────────────────────────────

export function renderAvatarSvg(configOrName, size = 34, isVerified = true) {
  let cfg;
  if (!configOrName) {
    cfg = getDeterministicAvatar('Anonymous');
  } else if (typeof configOrName === 'string') {
    cfg = getDeterministicAvatar(configOrName);
  } else {
    cfg = { ...getDeterministicAvatar('User'), ...configOrName };
  }

  const skinObj = AVATAR_OPTIONS.skins.find(s => s.id === cfg.skin) || AVATAR_OPTIONS.skins[0];
  const hairColorObj = AVATAR_OPTIONS.hairColors.find(h => h.id === cfg.hairColor) || AVATAR_OPTIONS.hairColors[0];
  const bgObj = AVATAR_OPTIONS.bgs.find(b => b.id === cfg.bg) || AVATAR_OPTIONS.bgs[0];
  const outfitColor = cfg.outfitColor || '#244D42';

  const skinColor = skinObj.color;
  const shadowColor = skinObj.shadow;
  const hairColor = hairColorObj.color;
  const bgColor = bgObj.color;

  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="avatar-svg" style="display:inline-block;vertical-align:middle;border-radius:50%;overflow:hidden;flex-shrink:0;">`;
  svg += `<circle cx="50" cy="50" r="50" fill="${bgColor}"/>`;

  if (cfg.accessory === 'sparkle') {
    svg += `
      <path d="M18 22L19.5 17L21 22L26 23.5L21 25L19.5 30L18 25L13 23.5Z" fill="#E05C3A" opacity="0.85"/>
      <path d="M80 20L81.2 16L82.4 20L86.4 21.2L82.4 22.4L81.2 26.4L80 22.4L76 21.2Z" fill="#D8FF68" opacity="0.95"/>
    `;
  }

  // Back Hair
  if (cfg.hair === 'afro') {
    svg += `<circle cx="50" cy="40" r="30" fill="${hairColor}"/>`;
  } else if (cfg.hair === 'waves') {
    svg += `<path d="M22 40C22 22 34 16 50 16C66 16 78 22 78 40C82 56 80 74 72 78C70 70 70 54 68 44C68 30 60 26 50 26C40 26 32 30 32 44C30 54 30 70 28 78C20 74 18 56 22 40Z" fill="${hairColor}"/>`;
  } else if (cfg.hair === 'bob') {
    svg += `<path d="M24 40C24 22 35 16 50 16C65 16 76 22 76 40V62C76 66 70 66 68 58V40C68 30 60 26 50 26C40 26 32 30 32 40V58C30 66 24 66 24 62V40Z" fill="${hairColor}"/>`;
  }

  // Body Outfits
  if (cfg.outfit === 'hoodie') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M40 70C40 78 44 86 50 86C56 86 60 78 60 70Z" fill="#172421" opacity="0.25"/>
      <path d="M46 86V96M54 86V96" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
      <circle cx="46" cy="97" r="1.5" fill="#FFFFFF"/>
      <circle cx="54" cy="97" r="1.5" fill="#FFFFFF"/>
    `;
  } else if (cfg.outfit === 'varsity') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M38 70L44 100M62 70L56 100" stroke="#FFFFFF" stroke-width="3.5"/>
      <path d="M42 70C42 76 46 80 50 80C54 80 58 76 58 70Z" fill="#D8FF68"/>
    `;
  } else if (cfg.outfit === 'sweater') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M38 70C38 75 43 78 50 78C57 78 62 75 62 70" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
      <path d="M26 85H74M30 92H70M34 98H66" stroke="#000000" stroke-width="1.5" opacity="0.18"/>
    `;
  } else if (cfg.outfit === 'polo') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M40 70L50 82L60 70" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <path d="M48 83V95H52V83" fill="#FFFFFF"/>
      <circle cx="50" cy="87" r="1.2" fill="#172421"/>
      <circle cx="50" cy="92" r="1.2" fill="#172421"/>
    `;
  } else if (cfg.outfit === 'puffer') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M22 80C30 83 70 83 78 80" stroke="#172421" stroke-width="2.5" opacity="0.25"/>
      <path d="M20 90C30 93 70 93 80 90" stroke="#172421" stroke-width="2.5" opacity="0.25"/>
      <path d="M49 70V100" stroke="#FFFFFF" stroke-width="2"/>
    `;
  } else if (cfg.outfit === 'jersey') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M40 70L50 82L60 70" fill="none" stroke="#D8FF68" stroke-width="3"/>
      <text x="50" y="96" font-family="'DM Mono', sans-serif" font-weight="900" font-size="12" fill="#FFFFFF" text-anchor="middle">24</text>
    `;
  } else if (cfg.outfit === 'denim') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="#3D6488"/>
      <path d="M38 70L46 78H54L62 70" fill="#2D4D6B"/>
      <rect x="28" y="84" width="12" height="10" rx="2" fill="#2D4D6B" stroke="#E39B42" stroke-width="1"/>
      <rect x="60" y="84" width="12" height="10" rx="2" fill="#2D4D6B" stroke="#E39B42" stroke-width="1"/>
      <path d="M50 78V100" stroke="#E39B42" stroke-width="1.5" stroke-dasharray="2 2"/>
    `;
  } else if (cfg.outfit === 'scarf') {
    const scarfColor = (outfitColor === '#E05C3A') ? '#244D42' : '#E05C3A';
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <ellipse cx="50" cy="74" rx="20" ry="8" fill="${scarfColor}"/>
      <path d="M42 74V98H52V74" fill="${scarfColor}"/>
      <path d="M42 98L44 100M46 98L48 100M50 98L52 100" stroke="#FFFFFF" stroke-width="1.5"/>
    `;
  } else if (cfg.outfit === 'blazer') {
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="#172421"/>
      <path d="M42 70L50 88L58 70" fill="#FFFFFF"/>
      <path d="M34 70L48 95L50 88L38 70Z" fill="#244D42"/>
      <path d="M66 70L52 95L50 88L62 70Z" fill="#244D42"/>
    `;
  } else {
    // ✦ Graphic Tee (Default)
    const isCoral = outfitColor === '#E05C3A' || outfitColor.toLowerCase() === '#e05c3a';
    const starFill = isCoral ? '#FFFFFF' : '#E05C3A';
    svg += `
      <path d="M18 100C18 78 30 70 50 70C70 70 82 78 82 100Z" fill="${outfitColor}"/>
      <path d="M40 70C40 76 44 80 50 80C56 80 60 76 60 70Z" fill="${shadowColor}"/>
      <path d="M50 82L51 86L55 87L51 88L50 92L49 88L45 87L49 86Z" fill="${starFill}"/>
    `;
  }

  // Neck
  svg += `<path d="M44 60H56V72C56 75.3 53.3 78 50 78C46.7 78 44 75.3 44 72V60Z" fill="${shadowColor}"/>`;

  // Head & Ears Base
  svg += `
    <circle cx="28" cy="46" r="5" fill="${shadowColor}"/>
    <circle cx="72" cy="46" r="5" fill="${shadowColor}"/>
    <ellipse cx="50" cy="45" rx="23" ry="25" fill="${skinColor}"/>
  `;

  // Ear Accessories
  if (cfg.accessory === 'hoops') {
    svg += `
      <circle cx="28" cy="51" r="4" fill="none" stroke="#E39B42" stroke-width="2"/>
      <circle cx="72" cy="51" r="4" fill="none" stroke="#E39B42" stroke-width="2"/>
    `;
  } else if (cfg.accessory === 'airpods') {
    svg += `
      <circle cx="29" cy="45" r="2.5" fill="#FFFFFF"/>
      <path d="M29 45V52" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
      <circle cx="71" cy="45" r="2.5" fill="#FFFFFF"/>
      <path d="M71 45V52" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Front Hair / Bangs / Cap
  if (cfg.accessory === 'cap') {
    const isCapCoral = hairColor === '#E05C3A' || hairColor.toLowerCase() === '#e05c3a';
    const capStarFill = isCapCoral ? '#FFFFFF' : '#E05C3A';
    svg += `
      <path d="M24 38C24 22 35 15 50 15C65 15 76 22 76 38H24Z" fill="${hairColor}"/>
      <ellipse cx="50" cy="38" rx="28" ry="6" fill="#172421"/>
      <path d="M50 24L50.8 27L54 28L50.8 29L50 32L49.2 29L46 28L49.2 27Z" fill="${capStarFill}"/>
    `;
  } else if (cfg.hair === 'curls') {
    svg += `
      <path d="M26 38C22 30 28 18 40 18C44 14 56 14 60 18C72 18 78 30 74 38C78 44 76 52 70 54C72 40 68 30 50 30C32 30 28 40 30 54C24 52 22 44 26 38Z" fill="${hairColor}"/>
      <circle cx="36" cy="22" r="7" fill="${hairColor}"/>
      <circle cx="50" cy="18" r="8" fill="${hairColor}"/>
      <circle cx="64" cy="22" r="7" fill="${hairColor}"/>
    `;
  } else if (cfg.hair === 'beanie') {
    svg += `
      <path d="M25 40C25 22 35 15 50 15C65 15 75 22 75 40H25Z" fill="${hairColor}"/>
      <rect x="23" y="36" width="54" height="8" rx="4" fill="#172421" opacity="0.3"/>
      <circle cx="50" cy="13" r="4" fill="${hairColor}"/>
    `;
  } else if (cfg.hair === 'afro') {
    svg += `<path d="M28 36C32 30 40 28 50 28C60 28 68 30 72 36" stroke="${hairColor}" stroke-width="5" stroke-linecap="round"/>`;
  } else if (cfg.hair === 'waves' || cfg.hair === 'bob') {
    svg += `<path d="M27 36C33 26 42 26 50 27C58 26 67 26 73 36C67 31 59 30 50 30C41 30 33 31 27 36Z" fill="${hairColor}"/>`;
  } else {
    // Short Crop
    svg += `
      <path d="M26 38C26 22 36 17 50 17C64 17 74 22 74 38C68 32 60 28 50 28C40 28 32 32 26 38Z" fill="${hairColor}"/>
      <path d="M26 38L30 30L36 34L44 26L52 32L60 26L68 32L74 38" stroke="${hairColor}" stroke-width="3" stroke-linecap="round"/>
    `;
  }

  // Compulsory ✦ Coral Brand Star Cheek Mark
  svg += `<path d="M63 50L64 52.5L66.5 53.5L64 54.5L63 57L62 54.5L59.5 53.5L62 52.5Z" fill="#E05C3A"/>`;

  // Freckles
  if (cfg.accessory === 'freckles') {
    svg += `
      <circle cx="42" cy="49" r="0.8" fill="#8A4A28" opacity="0.7"/>
      <circle cx="45" cy="48" r="0.9" fill="#8A4A28" opacity="0.7"/>
      <circle cx="48" cy="50" r="0.8" fill="#8A4A28" opacity="0.7"/>
      <circle cx="52" cy="50" r="0.8" fill="#8A4A28" opacity="0.7"/>
      <circle cx="55" cy="48" r="0.9" fill="#8A4A28" opacity="0.7"/>
      <circle cx="58" cy="49" r="0.8" fill="#8A4A28" opacity="0.7"/>
    `;
  }

  // Facial Expressions
  if (cfg.expression === 'wink') {
    svg += `
      <path d="M36 43C37.5 40.5 42.5 40.5 44 43" stroke="#172421" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="60" cy="42" r="3" fill="#172421"/>
      <circle cx="61.5" cy="40.5" r="1" fill="#FFFFFF"/>
      <circle cx="34" cy="48" r="3.5" fill="#FFA5A5" opacity="0.5"/>
      <circle cx="66" cy="48" r="3.5" fill="#FFA5A5" opacity="0.5"/>
      <path d="M46 55C48 59 52 59 54 55" stroke="#172421" stroke-width="2.2" stroke-linecap="round"/>
    `;
  } else if (cfg.expression === 'chill') {
    svg += `
      <circle cx="40" cy="43" r="3" fill="#172421"/>
      <circle cx="60" cy="43" r="3" fill="#172421"/>
      <circle cx="41.5" cy="41.5" r="1" fill="#FFFFFF"/>
      <circle cx="61.5" cy="41.5" r="1" fill="#FFFFFF"/>
      <path d="M46 56C49 57 53 56 55 54" stroke="#172421" stroke-width="2" stroke-linecap="round"/>
    `;
  } else if (cfg.expression === 'laugh') {
    svg += `
      <path d="M36 44C38 41 42 41 44 44" stroke="#172421" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M56 44C58 41 62 41 64 44" stroke="#172421" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="34" cy="48" r="4.5" fill="#FFA5A5" opacity="0.6"/>
      <circle cx="66" cy="48" r="4.5" fill="#FFA5A5" opacity="0.6"/>
      <path d="M43 54C43 60 57 60 57 54Z" fill="#172421"/>
      <path d="M47 57C48 59 52 59 53 57" stroke="#FFA5A5" stroke-width="2" stroke-linecap="round"/>
    `;
  } else if (cfg.expression === 'curious') {
    svg += `
      <circle cx="40" cy="42" r="3.5" fill="#172421"/>
      <circle cx="60" cy="42" r="3.5" fill="#172421"/>
      <circle cx="41.5" cy="40.5" r="1.2" fill="#FFFFFF"/>
      <circle cx="61.5" cy="40.5" r="1.2" fill="#FFFFFF"/>
      <ellipse cx="50" cy="56" rx="2.5" ry="3.5" fill="#172421"/>
    `;
  } else {
    // Happy Smile (Default)
    svg += `
      <path d="M36 43C38 40.5 42 40.5 44 43" stroke="#172421" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M56 43C58 40.5 62 40.5 64 43" stroke="#172421" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="34" cy="48" r="4" fill="#FFA5A5" opacity="0.5"/>
      <circle cx="66" cy="48" r="4" fill="#FFA5A5" opacity="0.5"/>
      <path d="M44 54C46 59 54 59 56 54Z" fill="#172421"/>
    `;
  }

  // Eyewear Layer
  if (cfg.eyewear === 'wayfarer') {
    svg += `
      <rect x="32" y="38" width="16" height="11" rx="3" fill="#172421"/>
      <rect x="52" y="38" width="16" height="11" rx="3" fill="#172421"/>
      <path d="M47 41H53" stroke="#172421" stroke-width="3"/>
      <path d="M34 40L41 46" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <path d="M54 40L61 46" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
    `;
  } else if (cfg.eyewear === 'aviator') {
    svg += `
      <path d="M33 40C33 38 47 38 47 40V46C47 49 33 49 33 46Z" fill="#172421" opacity="0.75" stroke="#E39B42" stroke-width="1.5"/>
      <path d="M53 40C53 38 67 38 67 40V46C67 49 53 49 53 46Z" fill="#172421" opacity="0.75" stroke="#E39B42" stroke-width="1.5"/>
      <path d="M33 38H67" stroke="#E39B42" stroke-width="1.5"/>
      <path d="M47 42H53" stroke="#E39B42" stroke-width="1.5"/>
    `;
  } else if (cfg.eyewear === 'round_wire') {
    svg += `
      <circle cx="40" cy="43" r="7.5" stroke="#E39B42" stroke-width="1.8" fill="none"/>
      <circle cx="60" cy="43" r="7.5" stroke="#E39B42" stroke-width="1.8" fill="none"/>
      <path d="M47.5 43H52.5" stroke="#E39B42" stroke-width="1.8"/>
    `;
  } else if (cfg.eyewear === 'square_acetate') {
    svg += `
      <rect x="33" y="37" width="14" height="12" rx="2" stroke="#172421" stroke-width="2.5" fill="none"/>
      <rect x="53" y="37" width="14" height="12" rx="2" stroke="#172421" stroke-width="2.5" fill="none"/>
      <path d="M47 42H53" stroke="#172421" stroke-width="2.5"/>
    `;
  } else if (cfg.eyewear === 'sunset_tint') {
    svg += `
      <rect x="32" y="38" width="16" height="11" rx="3" fill="#E05C3A" opacity="0.65"/>
      <rect x="52" y="38" width="16" height="11" rx="3" fill="#E05C3A" opacity="0.65"/>
      <path d="M47 41H53" stroke="#E39B42" stroke-width="2.5"/>
      <path d="M34 40L41 46" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
      <path d="M54 40L61 46" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
    `;
  }

  // DJ Headphones
  if (cfg.accessory === 'headphones') {
    svg += `
      <path d="M24 45C24 28 34 20 50 20C66 20 76 28 76 45" stroke="#172421" stroke-width="4.5" stroke-linecap="round" fill="none"/>
      <rect x="20" y="40" width="8" height="16" rx="4" fill="#E05C3A"/>
      <rect x="72" y="40" width="8" height="16" rx="4" fill="#E05C3A"/>
      <rect x="22" y="43" width="4" height="10" rx="2" fill="#172421"/>
      <rect x="74" y="43" width="4" height="10" rx="2" fill="#172421"/>
    `;
  }

  svg += `</svg>`;
  return svg;
}

// ── Official Scalloped Verification Seal Badge ────────────────────────────────

export function renderVerifiedBadgeSvg(size = 20, color = '#1D9BF0') {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" class="verified-seal-svg" style="display:inline-block;vertical-align:middle;flex-shrink:0;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.2));">
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91c-1.31.67-2.19 1.91-2.19 3.34s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z" fill="${color}" stroke="#FFFFFF" stroke-width="1.2"/>
      <path d="M10.2 16.2l-3.6-3.6 1.4-1.4L10.2 13.4l5.8-5.8 1.4 1.4-7.2 7.2z" fill="#FFFFFF"/>
    </svg>
  `;
}

// ── Full-Body Showcase Stage with Spotlight & Dark Mode ───────────────────────

export function renderFullBodyAvatarSvg(configOrName, isDarkMode = false, width = 200, height = 250) {
  let cfg;
  if (!configOrName) {
    cfg = getDeterministicAvatar('Anonymous');
  } else if (typeof configOrName === 'string') {
    cfg = getDeterministicAvatar(configOrName);
  } else {
    cfg = { ...getDeterministicAvatar('User'), ...configOrName };
  }

  const skinObj = AVATAR_OPTIONS.skins.find(s => s.id === cfg.skin) || AVATAR_OPTIONS.skins[0];
  const hairColorObj = AVATAR_OPTIONS.hairColors.find(h => h.id === cfg.hairColor) || AVATAR_OPTIONS.hairColors[0];
  const outfitColor = cfg.outfitColor || '#244D42';

  const skinColor = skinObj.color;
  const shadowColor = skinObj.shadow;
  const hairColor = hairColorObj.color;

  const bgGradStart = isDarkMode ? '#0d1614' : '#F5F7F4';
  const bgGradEnd = isDarkMode ? '#040807' : '#E5EAE2';
  const pedestalTop = isDarkMode ? '#13221e' : '#FFFFFF';
  const pedestalSide = isDarkMode ? '#0a1311' : '#CBD5E1';
  const beamColor = isDarkMode ? '#D8FF68' : '#FFFFFF';
  const pantsColor = '#2F3C48';

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 160 220" fill="none" xmlns="http://www.w3.org/2000/svg" class="fullbody-avatar-svg" style="border-radius:14px;overflow:hidden;">`;

  // Defs & Gradients
  svg += `
    <defs>
      <linearGradient id="stageBgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgGradStart}"/>
        <stop offset="100%" stop-color="${bgGradEnd}"/>
      </linearGradient>
      <linearGradient id="wideSpotlightBeam" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="${isDarkMode ? '0.45' : '0.8'}"/>
        <stop offset="25%" stop-color="${beamColor}" stop-opacity="${isDarkMode ? '0.32' : '0.5'}"/>
        <stop offset="70%" stop-color="${beamColor}" stop-opacity="${isDarkMode ? '0.16' : '0.2'}"/>
        <stop offset="100%" stop-color="${beamColor}" stop-opacity="0.02"/>
      </linearGradient>
      <radialGradient id="ambientBacklight" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${isDarkMode ? '#D8FF68' : '#FFFFFF'}" stop-opacity="${isDarkMode ? '0.4' : '0.7'}"/>
        <stop offset="55%" stop-color="${isDarkMode ? '#D8FF68' : '#FDF1AA'}" stop-opacity="${isDarkMode ? '0.18' : '0.25'}"/>
        <stop offset="100%" stop-color="${isDarkMode ? '#D8FF68' : '#FFFFFF'}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="stageFloorGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${isDarkMode ? '#D8FF68' : '#FFFFFF'}" stop-opacity="${isDarkMode ? '0.75' : '0.9'}"/>
        <stop offset="50%" stop-color="${isDarkMode ? '#D8FF68' : '#FDEAA8'}" stop-opacity="${isDarkMode ? '0.3' : '0.35'}"/>
        <stop offset="100%" stop-color="${isDarkMode ? '#D8FF68' : '#FFFFFF'}" stop-opacity="0"/>
      </radialGradient>
    </defs>
  `;

  // Stage Background
  svg += `<rect width="160" height="220" fill="url(#stageBgGrad)"/>`;

  // Soft Ambient Backlight Glow (centered behind character silhouette)
  svg += `<ellipse cx="80" cy="95" rx="66" ry="78" fill="url(#ambientBacklight)"/>`;

  // Wide Volumetric Flood Beam (envelops entire head, shoulders, and body)
  svg += `<polygon points="35,0 125,0 156,210 4,210" fill="url(#wideSpotlightBeam)"/>`;

  // Overhead Ceiling Stage Fixture
  svg += `
    <rect x="45" y="0" width="70" height="3.5" rx="1.5" fill="${isDarkMode ? '#172723' : '#94A3B8'}"/>
    <ellipse cx="80" cy="3.5" rx="36" ry="3.5" fill="#FFFFFF" opacity="${isDarkMode ? '0.7' : '0.95'}"/>
    <ellipse cx="80" cy="6" rx="48" ry="6" fill="${isDarkMode ? '#D8FF68' : '#FDEAA8'}" opacity="${isDarkMode ? '0.3' : '0.4'}"/>
  `;

  // Stage Floor Glow
  svg += `<ellipse cx="80" cy="196" rx="55" ry="18" fill="url(#stageFloorGlow)"/>`;

  // Floating Sparkles
  if (cfg.accessory === 'sparkle' || isDarkMode) {
    svg += `
      <path d="M18 45L20 38L22 45L29 47L22 49L20 56L18 49L11 47Z" fill="#D8FF68" opacity="0.9"/>
      <path d="M140 50L141.5 45L143 50L148 51.5L143 53L141.5 58L140 53L135 51.5Z" fill="#E05C3A" opacity="0.95"/>
      <path d="M135 130L136 126L137 130L141 131L137 132L136 136L135 132L131 131Z" fill="#92C9E8" opacity="0.85"/>
    `;
  }

  // Pedestal Stage Platform with Illuminated Ring
  svg += `
    <ellipse cx="80" cy="202" rx="48" ry="12" fill="${pedestalSide}"/>
    <ellipse cx="80" cy="196" rx="48" ry="12" fill="${pedestalTop}"/>
    <ellipse cx="80" cy="196" rx="43" ry="10" fill="none" stroke="${isDarkMode ? '#D8FF68' : '#CBD5E1'}" stroke-width="${isDarkMode ? '2' : '1.5'}" opacity="${isDarkMode ? '0.9' : '0.8'}"/>
  `;

  // 1. Chunky Campus Sneakers & Shoes
  svg += `
    <ellipse cx="64" cy="192" rx="11" ry="5" fill="#172421" opacity="0.3"/>
    <ellipse cx="96" cy="192" rx="11" ry="5" fill="#172421" opacity="0.3"/>
    
    <!-- Left Sneaker -->
    <path d="M54 186C54 180 58 178 64 178C70 178 74 180 74 186H54Z" fill="#FFFFFF"/>
    <rect x="52" y="186" width="24" height="6" rx="3" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="0.8"/>
    <path d="M56 186H72" stroke="${outfitColor}" stroke-width="2"/>
    <rect x="52" y="190" width="24" height="2.5" rx="1" fill="#E39B42"/>

    <!-- Right Sneaker -->
    <path d="M86 186C86 180 90 178 96 178C102 178 106 180 106 186H86Z" fill="#FFFFFF"/>
    <rect x="84" y="186" width="24" height="6" rx="3" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="0.8"/>
    <path d="M88 186H104" stroke="${outfitColor}" stroke-width="2"/>
    <rect x="84" y="190" width="24" height="2.5" rx="1" fill="#E39B42"/>
  `;

  // 2. Straight-leg Pants / Jeans
  svg += `
    <path d="M60 128L57 182H71L78 140L82 140L89 182H103L100 128Z" fill="${pantsColor}"/>
    <path d="M78 140V128H82V140" stroke="#172421" stroke-width="1" opacity="0.4"/>
    <path d="M57 178H71M89 178H103" stroke="#E39B42" stroke-width="1.2" opacity="0.8"/>
  `;

  // 3. Back Hair
  if (cfg.hair === 'afro') {
    svg += `<circle cx="80" cy="50" r="28" fill="${hairColor}"/>`;
  } else if (cfg.hair === 'waves') {
    svg += `<path d="M54 50C54 32 66 26 80 26C94 26 106 32 106 50C110 66 108 84 100 88C98 80 98 64 96 54C96 40 88 36 80 36C72 36 64 40 64 54C62 64 62 80 60 88C52 84 50 66 54 50Z" fill="${hairColor}"/>`;
  } else if (cfg.hair === 'bob') {
    svg += `<path d="M56 50C56 32 67 26 80 26C93 26 104 32 104 50V72C104 76 98 76 96 68V50C96 40 88 36 80 36C72 36 64 40 64 50V68C62 76 56 76 56 72V50Z" fill="${hairColor}"/>`;
  }

  // 4. Torso Outfits
  const isCoral = outfitColor === '#E05C3A' || outfitColor.toLowerCase() === '#e05c3a';
  const starFill = isCoral ? '#FFFFFF' : '#E05C3A';

  if (cfg.outfit === 'hoodie') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M72 80C72 86 75 93 80 93C85 93 88 86 88 80Z" fill="#172421" opacity="0.25"/>
      <path d="M77 93V103M83 93V103" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
      <rect x="64" y="112" width="32" height="14" rx="4" fill="#172421" opacity="0.2"/>
    `;
  } else if (cfg.outfit === 'varsity') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M68 80L74 130M92 80L86 130" stroke="#FFFFFF" stroke-width="3"/>
      <path d="M74 80C74 85 77 89 80 89C83 89 86 85 86 80Z" fill="#D8FF68"/>
    `;
  } else if (cfg.outfit === 'sweater') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M70 80C70 84 75 87 80 87C85 87 90 84 90 80" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M60 95H100M58 105H102M56 115H104" stroke="#000000" stroke-width="1.2" opacity="0.18"/>
    `;
  } else if (cfg.outfit === 'polo') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M72 80L80 90L88 80" fill="#FFFFFF"/>
      <path d="M78 90V102H82V90" fill="#FFFFFF"/>
      <circle cx="80" cy="94" r="1" fill="#172421"/>
    `;
  } else if (cfg.outfit === 'puffer') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M56 94C66 97 94 97 104 94" stroke="#172421" stroke-width="2" opacity="0.25"/>
      <path d="M54 108C66 111 94 111 106 108" stroke="#172421" stroke-width="2" opacity="0.25"/>
      <path d="M52 120C66 123 94 123 108 120" stroke="#172421" stroke-width="2" opacity="0.25"/>
      <path d="M79 80V130" stroke="#FFFFFF" stroke-width="1.8"/>
    `;
  } else if (cfg.outfit === 'jersey') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M72 80L80 90L88 80" fill="none" stroke="#D8FF68" stroke-width="2.5"/>
      <text x="80" y="112" font-family="'DM Mono', sans-serif" font-weight="900" font-size="14" fill="#FFFFFF" text-anchor="middle">24</text>
    `;
  } else if (cfg.outfit === 'denim') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="#3D6488"/>
      <path d="M70 80L77 87H83L90 80" fill="#2D4D6B"/>
      <rect x="60" y="94" width="10" height="8" rx="2" fill="#2D4D6B" stroke="#E39B42" stroke-width="0.8"/>
      <rect x="90" y="94" width="10" height="8" rx="2" fill="#2D4D6B" stroke="#E39B42" stroke-width="0.8"/>
      <path d="M80 87V130" stroke="#E39B42" stroke-width="1.2" stroke-dasharray="2 2"/>
    `;
  } else if (cfg.outfit === 'scarf') {
    const scarfColor = (outfitColor === '#E05C3A') ? '#244D42' : '#E05C3A';
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <ellipse cx="80" cy="84" rx="16" ry="7" fill="${scarfColor}"/>
      <path d="M73 84V110H81V84" fill="${scarfColor}"/>
      <path d="M73 110L75 112M77 110L79 112M81 110L83 112" stroke="#FFFFFF" stroke-width="1.2"/>
    `;
  } else if (cfg.outfit === 'blazer') {
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="#172421"/>
      <path d="M73 80L80 96L87 80" fill="#FFFFFF"/>
      <path d="M66 80L78 110L80 96L70 80Z" fill="#244D42"/>
      <path d="M94 80L82 110L80 96L90 80Z" fill="#244D42"/>
    `;
  } else {
    // ✦ Graphic Tee (Default)
    svg += `
      <path d="M52 130C52 88 62 80 80 80C98 80 108 88 108 130Z" fill="${outfitColor}"/>
      <path d="M72 80C72 85 75 88 80 88C85 88 88 85 88 80Z" fill="${shadowColor}"/>
      <path d="M80 96L81 99L84 100L81 101L80 104L79 101L76 100L79 99Z" fill="${starFill}"/>
    `;
  }

  // Arms
  svg += `
    <path d="M52 90L44 125" stroke="${skinColor}" stroke-width="7" stroke-linecap="round"/>
    <path d="M108 90L116 125" stroke="${skinColor}" stroke-width="7" stroke-linecap="round"/>
  `;

  // Neck
  svg += `<path d="M75 70H85V82C85 84.8 82.8 87 80 87C77.2 87 75 84.8 75 82V70Z" fill="${shadowColor}"/>`;

  // Head Base
  svg += `
    <circle cx="60" cy="56" r="4.5" fill="${shadowColor}"/>
    <circle cx="100" cy="56" r="4.5" fill="${shadowColor}"/>
    <ellipse cx="80" cy="55" rx="20" ry="22" fill="${skinColor}"/>
  `;

  // Ear Accessories
  if (cfg.accessory === 'hoops') {
    svg += `
      <circle cx="60" cy="60" r="3.5" fill="none" stroke="#E39B42" stroke-width="1.8"/>
      <circle cx="100" cy="60" r="3.5" fill="none" stroke="#E39B42" stroke-width="1.8"/>
    `;
  } else if (cfg.accessory === 'airpods') {
    svg += `
      <circle cx="61" cy="55" r="2" fill="#FFFFFF"/>
      <path d="M61 55V61" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="99" cy="55" r="2" fill="#FFFFFF"/>
      <path d="M99 55V61" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>
    `;
  }

  // Front Hair
  if (cfg.accessory === 'cap') {
    const isCapCoral = hairColor === '#E05C3A' || hairColor.toLowerCase() === '#e05c3a';
    const capStarFill = isCapCoral ? '#FFFFFF' : '#E05C3A';
    svg += `
      <path d="M57 48C57 34 67 28 80 28C93 28 103 34 103 48H57Z" fill="${hairColor}"/>
      <ellipse cx="80" cy="48" rx="25" ry="5" fill="#172421"/>
      <path d="M80 36L80.8 38.5L83.5 39.5L80.8 40.5L80 43L79.2 40.5L76.5 39.5L79.2 38.5Z" fill="${capStarFill}"/>
    `;
  } else if (cfg.hair === 'curls') {
    svg += `
      <path d="M58 48C55 41 60 30 71 30C75 27 85 27 89 30C99 30 105 41 101 48C105 53 103 60 98 62C100 50 96 41 80 41C64 41 60 50 62 62C57 60 55 53 58 48Z" fill="${hairColor}"/>
      <circle cx="67" cy="34" r="6" fill="${hairColor}"/>
      <circle cx="80" cy="30" r="7" fill="${hairColor}"/>
      <circle cx="93" cy="34" r="6" fill="${hairColor}"/>
    `;
  } else if (cfg.hair === 'beanie') {
    svg += `
      <path d="M58 50C58 34 67 28 80 28C93 28 102 34 102 50H58Z" fill="${hairColor}"/>
      <rect x="56" y="47" width="48" height="7" rx="3.5" fill="#172421" opacity="0.3"/>
      <circle cx="80" cy="26" r="3.5" fill="${hairColor}"/>
    `;
  } else if (cfg.hair === 'afro') {
    svg += `<path d="M60 47C64 42 71 40 80 40C89 40 96 42 100 47" stroke="${hairColor}" stroke-width="4.5" stroke-linecap="round"/>`;
  } else if (cfg.hair === 'waves' || cfg.hair === 'bob') {
    svg += `<path d="M59 47C65 38 73 38 80 39C87 38 95 38 101 47C95 43 88 42 80 42C72 42 65 43 59 47Z" fill="${hairColor}"/>`;
  } else {
    // Short Crop
    svg += `
      <path d="M58 48C58 34 67 30 80 30C93 30 102 34 102 48C97 43 90 39 80 39C70 39 63 43 58 48Z" fill="${hairColor}"/>
      <path d="M58 48L62 41L67 45L74 38L81 43L88 38L95 43L101 48" stroke="${hairColor}" stroke-width="2.5" stroke-linecap="round"/>
    `;
  }

  // Compulsory ✦ Coral Brand Star Cheek Mark
  svg += `<path d="M91 60L92 62L94 63L92 64L91 66L90 64L88 63L90 62Z" fill="#E05C3A"/>`;

  // Freckles
  if (cfg.accessory === 'freckles') {
    svg += `
      <circle cx="73" cy="58" r="0.7" fill="#8A4A28" opacity="0.7"/>
      <circle cx="76" cy="57" r="0.8" fill="#8A4A28" opacity="0.7"/>
      <circle cx="79" cy="59" r="0.7" fill="#8A4A28" opacity="0.7"/>
      <circle cx="82" cy="59" r="0.7" fill="#8A4A28" opacity="0.7"/>
      <circle cx="85" cy="57" r="0.8" fill="#8A4A28" opacity="0.7"/>
    `;
  }

  // Expressions
  if (cfg.expression === 'wink') {
    svg += `
      <path d="M68 53C69.5 51 73.5 51 75 53" stroke="#172421" stroke-width="2" stroke-linecap="round"/>
      <circle cx="89" cy="53" r="2.5" fill="#172421"/>
      <circle cx="66" cy="58" r="3" fill="#FFA5A5" opacity="0.5"/>
      <circle cx="94" cy="58" r="3" fill="#FFA5A5" opacity="0.5"/>
      <path d="M76 64C78 67 82 67 84 64" stroke="#172421" stroke-width="1.8" stroke-linecap="round"/>
    `;
  } else if (cfg.expression === 'chill') {
    svg += `
      <circle cx="71" cy="53" r="2.5" fill="#172421"/>
      <circle cx="89" cy="53" r="2.5" fill="#172421"/>
      <path d="M76 65C79 66 82 65 84 63" stroke="#172421" stroke-width="1.8" stroke-linecap="round"/>
    `;
  } else if (cfg.expression === 'laugh') {
    svg += `
      <path d="M68 54C70 51 73 51 75 54" stroke="#172421" stroke-width="2" stroke-linecap="round"/>
      <path d="M85 54C87 51 90 51 92 54" stroke="#172421" stroke-width="2" stroke-linecap="round"/>
      <circle cx="66" cy="58" r="3.5" fill="#FFA5A5" opacity="0.6"/>
      <circle cx="94" cy="58" r="3.5" fill="#FFA5A5" opacity="0.6"/>
      <path d="M74 63C74 68 86 68 86 63Z" fill="#172421"/>
    `;
  } else if (cfg.expression === 'curious') {
    svg += `
      <circle cx="71" cy="53" r="2.8" fill="#172421"/>
      <circle cx="89" cy="53" r="2.8" fill="#172421"/>
      <ellipse cx="80" cy="65" rx="2" ry="2.8" fill="#172421"/>
    `;
  } else {
    // Happy Smile
    svg += `
      <path d="M68 53C70 51 73 51 75 53" stroke="#172421" stroke-width="2" stroke-linecap="round"/>
      <path d="M85 53C87 51 90 51 92 53" stroke="#172421" stroke-width="2" stroke-linecap="round"/>
      <circle cx="66" cy="58" r="3.5" fill="#FFA5A5" opacity="0.5"/>
      <circle cx="94" cy="58" r="3.5" fill="#FFA5A5" opacity="0.5"/>
      <path d="M75 64C76.5 68 83.5 68 85 64Z" fill="#172421"/>
    `;
  }

  // Eyewear
  if (cfg.eyewear === 'wayfarer') {
    svg += `
      <rect x="64" y="49" width="13" height="9" rx="2.5" fill="#172421"/>
      <rect x="83" y="49" width="13" height="9" rx="2.5" fill="#172421"/>
      <path d="M77 51H83" stroke="#172421" stroke-width="2.5"/>
      <path d="M66 51L71 56" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
      <path d="M85 51L90 56" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
    `;
  } else if (cfg.eyewear === 'aviator') {
    svg += `
      <path d="M65 51C65 49 76 49 76 51V56C76 58.5 65 58.5 65 56Z" fill="#172421" opacity="0.75" stroke="#E39B42" stroke-width="1.2"/>
      <path d="M84 51C84 49 95 49 95 51V56C95 58.5 84 58.5 84 56Z" fill="#172421" opacity="0.75" stroke="#E39B42" stroke-width="1.2"/>
      <path d="M65 49H95" stroke="#E39B42" stroke-width="1.2"/>
    `;
  } else if (cfg.eyewear === 'round_wire') {
    svg += `
      <circle cx="71" cy="53" r="6" stroke="#E39B42" stroke-width="1.5" fill="none"/>
      <circle cx="89" cy="53" r="6" stroke="#E39B42" stroke-width="1.5" fill="none"/>
      <path d="M77 53H83" stroke="#E39B42" stroke-width="1.5"/>
    `;
  } else if (cfg.eyewear === 'square_acetate') {
    svg += `
      <rect x="65" y="48" width="12" height="10" rx="2" stroke="#172421" stroke-width="2" fill="none"/>
      <rect x="83" y="48" width="12" height="10" rx="2" stroke="#172421" stroke-width="2" fill="none"/>
      <path d="M77 52H83" stroke="#172421" stroke-width="2"/>
    `;
  } else if (cfg.eyewear === 'sunset_tint') {
    svg += `
      <rect x="64" y="49" width="13" height="9" rx="2.5" fill="#E05C3A" opacity="0.7"/>
      <rect x="83" y="49" width="13" height="9" rx="2.5" fill="#E05C3A" opacity="0.7"/>
      <path d="M77 51H83" stroke="#E39B42" stroke-width="2"/>
    `;
  }

  // Headphones
  if (cfg.accessory === 'headphones') {
    svg += `
      <path d="M57 54C57 40 65 33 80 33C95 33 103 40 103 54" stroke="#172421" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <rect x="53" y="50" width="7" height="13" rx="3.5" fill="#E05C3A"/>
      <rect x="100" y="50" width="7" height="13" rx="3.5" fill="#E05C3A"/>
    `;
  }

  svg += `</svg>`;
  return svg;
}
