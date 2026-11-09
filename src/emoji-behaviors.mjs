// Behaviour describes the emoji itself, never the entire message bubble.
const groups = {
  sob:'😭', tear:'😢🥲🥹🤤😪', laugh:'😂🤣😆😹', melt:'🫠', starEyes:'🤩',
  tongue:'😛😜😝🤪😋', wink:'😉😏', heartEyes:'😍🥰😻', kiss:'😘😗😙😚😽',
  sleep:'😴🥱💤', angry:'😠😡🤬😤👿', surprise:'😮😯😲😱🙀😳😦😧😨🤯',
  think:'🤔🧐🤨', eyeRoll:'🙄👀', dizzy:'😵🥴🫨🫪', cold:'🥶', hot:'🥵😰',
  sick:'🤒🤕🤢🤮🤧😷', shy:'🤭🫣🤫😬🫢', sad:'😞😔😟😕🙁☹😥😓😩😫😿😖😣🫤🥺',
  blink:'😐😑😶🫥🤐🫩😒',
  smile:'☺😀😃😄😁😅😊🙂🙃😇😌😎🤓🥸🤠🤗😺😸😼',
  party:'🥳🎉🎊', heart:'❤🩷🧡💛💚💙🩵💜🤎🖤🩶🤍💕💞💓💗💖💘💝💟',
  heartbreak:'💔', fire:'🔥', wave:'👋', clap:'👏🙌', thumbs:'👍👎',
  rocket:'🚀🛫✈', ball:'⚽🏀🏐🎾🏈⚾🥎', sparkle:'✨🌟⭐💫',
  rain:'🌧⛈🌦☔💦', grow:'🌱🌿🌻🌼🌷🌹🌺🪴', dance:'💃🕺🪩',
  run:'🏃🚴🏊', flag:'🏁🚩🏳🏴', steam:'☕🍵🍜', music:'🎵🎶🎤🎸🎹🎺🎷🎻🥁',
  float:'🎈🫧🪁👻', snow:'❄☃⛄', butterfly:'🦋🐦🕊🦅🦉🐝', fish:'🐟🐠🐡🐬🐳🐋🦈'
};
const mapping = new Map(Object.entries(groups).flatMap(([kind, values]) => [...values].map(value => [value, kind])));
export function emojiBehavior(value, name='') {
  const plain=String(value).replace(/[\uFE0F\uFE0E]|\p{Emoji_Modifier}/gu,'');
  const first=[...plain][0];
  if(mapping.has(first)) return mapping.get(first);
  if(/\p{Regional_Indicator}/u.test(plain)||/flag:/i.test(name)) return 'flag';
  if(/running|biking|swimming|walking/i.test(name)) return 'run';
  if(/danc/i.test(name)) return 'dance';
  if(/heart/i.test(name)) return 'heart';
  // Unmapped objects stay still instead of receiving a meaningless zoom.
  return null;
}
