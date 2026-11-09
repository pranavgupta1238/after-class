// Original Afterclass vector artwork. Unicode remains the portable message format.
const paths = {
 pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
 people:'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M3 21v-3a7 7 0 0 1 14 0v3 M18 4a4 4 0 0 1 0 8 M20 15q3 1 3 6',
 bookmark:'M6 3h12v18l-6-4-6 4Z',
 repeat:'M20 7A9 9 0 0 0 4 7 M20 3v5h-5 M4 17a9 9 0 0 0 16 0 M4 21v-5h5',
 check:'M5 12l4 4L19 6',
 chat:'M21 11a9 8 0 0 1-9 8H7l-5 3 2-6a8 8 0 0 1-1-5 9 8 0 0 1 18 0Z M8 11h8',

 coffee:'M5 9h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z M17 10h2a3 3 0 0 1 0 6h-2 M8 3v3 M13 3v3',
 study:'M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1Z M12 6v15',
 move:'M4 5h5l2 6 9 4q2 1 1 5H3V9Z M3 17h18 M11 11l-2 2 M14 12l-2 2',
 play:'M8 7h8c4 0 6 10 4 12-2 2-4-3-6-3h-4c-2 0-4 5-6 3C2 17 4 7 8 7Z M8 10v5 M5.5 12.5h5 M16 11h.1 M18 14h.1',
 all:'M4 4h6v6H4Z M14 4h6v6h-6Z M4 14h6v6H4Z M14 14h6v6h-6Z',
 food:'M5 3v6q0 3 3 3V3 M5 6h3 M6.5 12v9 M17 3q-4 5-2 10h3V3 M18 13v8',
 leaf:'M5 20C0 7 14 3 21 3c0 12-5 19-16 17Z M5 20 16 9',
 laptop:'M5 4h14v12H5Z M2 20l3-4h14l3 4Z',
 ball:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3v18 M6 5q9 7 0 14 M18 5q-9 7 0 14',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
 moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
 calendar:'M4 5h16v16H4Z M8 3v4 M16 3v4 M4 10h16',
 heart:'M12 21 3 12C-3 4 8 0 12 7c4-7 15-3 9 5Z',
 fire:'M12 2c1 7 8 8 8 14a8 8 0 0 1-16 0c0-4 3-7 5-9v7c4-2 4-6 3-12Z',
 thumb:'M8 21H3V10h5 M8 11l5-9q4 0 2 8h5q2 0 1 4l-2 7H8Z',
 eyes:'M10 12a4 7 0 1 1-8 0 4 7 0 0 1 8 0 M22 12a4 7 0 1 1-8 0 4 7 0 0 1 8 0 M7 12v2 M19 12v2',
 snow:'M12 2v20 M3 7l18 10 M3 17 21 7 M8 4l4 3 4-3 M8 20l4-3 4 3',
 hundred:'M3 17h18 M5 7v6 M10 7h3v6h-3Z M17 7h3v6h-3Z M3 21h18'
};
export function uiIcon(name) { return `<svg class="ac-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"> <path d="${paths[name] || paths.all}"/></svg>`; }
const moods = [
 ['😊','Warm','happy smile friendly','smile'],['😂','Laughing','laugh lol funny joy','laugh'],['🥰','Loved','love affection crush','love'],['😉','Wink','flirt playful wink','wink'],['😎','Cool','cool confident sunglasses','cool'],['🥳','Celebrating','party celebration birthday','party'],['😌','At ease','calm relaxed peace relieved','calm'],['🤩','Starstruck','excited wow star','star'],['🥹','Touched','grateful touched emotional','touched'],['😴','Sleepy','sleep tired night','sleep'],['😢','Sad','sad cry down','sad'],['😭','Heartbroken','cry tears sob heartbreak','cry'],['😤','Frustrated','frustrated angry annoyed','angry'],['😳','Blushing','shy embarrassed blush','blush'],['🤔','Thinking','think question curious','think'],['😮','Surprised','surprised shock wow','surprise'],['😬','Awkward','awkward nervous cringe','awkward'],['🙄','Unimpressed','eyeroll bored unimpressed','roll'],['🤫','Secret','quiet shh secret','secret'],['😇','Innocent','innocent angel good','angel'],['😏','Smirk','smirk flirt confident','smirk'],['😔','Low-key','sad disappointed low','low'],['🤗','Hug','hug support comfort','hug'],['😵','Overwhelmed','overwhelmed dizzy exams stress','dizzy']
];
export const EXPRESSIONS = moods.map(([e,n,t,m])=>({e,n,t,m,c:'moods'})).concat([['❤️','Love','heart'],['🔥','On fire','fire'],['👍','Approved','thumb'],['👀','Watching','eyes'],['☕','Chai break','coffee'],['❄️','Chill','snow'],['💯','One hundred','hundred'],['📚','Study time','study'],['🎮','Game on','play'],['🏀','Court time','ball'],['🌿','Fresh air','leaf'],['💻','Coding','laptop']].map(([e,n,icon])=>({e,n,t:n.toLowerCase(),icon,c:'signals'})));
const eyes='<path d="M23 28v3m18-3v3"/>';
const closed='<path d="M19 29q4-5 8 0m10 0q4-5 8 0"/>';
const heart='<path d="M20 25c-6-5-10 4 3 10 13-6 9-15 3-10l-3 2Z" fill="#ac4c52" stroke="none"/>';
export function expressionArt(value) {
 const e=EXPRESSIONS.find(e=>e.e===value); if(!e)return value;
 if(e.icon)return `<span class="ac-signal ac-signal-${e.icon}" role="img" aria-label="${e.n}">${uiIcon(e.icon)}</span>`;
 const m=e.m;
 let gaze=eyes, mouth='<path d="M23 39q9 9 18 0"/>',extra='';
 if(['calm','sleep','low'].includes(m))gaze='<path d="M19 29q4 4 8 0m10 0q4 4 8 0"/>';
 if(['laugh','party','hug'].includes(m))gaze=closed;
 if(m==='wink'||m==='smirk')gaze='<path d="M20 29q4-4 7 0m14-1v3"/>';
 if(m==='love')gaze=heart+'<g transform="translate(19 0)">'+heart+'</g>';
 if(m==='cool')gaze='<path d="M16 25h13v8q-7 7-13-1Zm19 0h13v7q-7 8-13 1ZM29 27h6" fill="#28483f"/>';
 if(m==='star')gaze='<path d="m23 21 2 5 5 1-4 4 1 5-4-3-5 3 1-5-4-4 5-1Zm18 0 2 5 5 1-4 4 1 5-4-3-5 3 1-5-4-4 5-1Z" fill="#aa6334" stroke="none"/>';
 if(m==='dizzy')gaze='<path d="m19 25 8 8m0-8-8 8m18-8 8 8m0-8-8 8"/>';
 if(m==='roll')gaze='<circle cx="23" cy="29" r="5" fill="#fff"/><circle cx="41" cy="29" r="5" fill="#fff"/><path d="M23 25v2m18-2v2"/>';
 if(['sad','cry','low','angry'].includes(m))mouth='<path d="M24 43q8-7 16 0"/>';
 if(['surprise','sleep'].includes(m))mouth='<ellipse cx="32" cy="42" rx="4" ry="6" fill="#594333"/>';
 if(['laugh','party','hug'].includes(m))mouth='<path d="M22 38h20c0 15-20 15-20 0Z" fill="#594333"/><path d="M27 46q5-4 10 0" stroke="#dc9084"/>';
 if(m==='awkward')mouth='<rect x="21" y="38" width="22" height="9" rx="3" fill="#fff"/><path d="M22 42h20m-14-4v9m8-9v9" stroke-width="1"/>';
 if(m==='angry')extra='<path d="m19 22 9 3m8 0 9-3"/>';
 if(['sad','cry','touched'].includes(m))extra='<path d="M18 32q-8 11 0 11t0-11" fill="#91b9c7" stroke="none"/>'+(m==='cry'?'<path d="M46 32q-8 11 0 11t0-11" fill="#91b9c7" stroke="none"/>':'');
 if(m==='think')extra='<path d="M35 48v-8q0-4 4-2l5 9" fill="#efd7a1"/>';
 if(m==='secret')extra='<path d="M32 49V35" stroke="#bf945b" stroke-width="5"/>';
 if(m==='angel')extra='<ellipse cx="32" cy="10" rx="16" ry="4" stroke="#95afa7" fill="none"/>';
 if(m==='party')extra='<path d="m8 21 8-19 13 17" fill="#9eafa1" stroke="#718b7d"/><path d="m13 12 8 1" stroke="#fff"/>';
 if(m==='blush')extra='<ellipse cx="18" cy="36" rx="6" ry="3" fill="#d99688" stroke="none"/><ellipse cx="46" cy="36" rx="6" ry="3" fill="#d99688" stroke="none"/>';
 return `<svg class="ac-expression" viewBox="0 0 64 64" role="img" aria-label="${e.n}"><ellipse cx="32" cy="58" rx="19" ry="3" fill="#193d3010"/><circle cx="32" cy="32" r="26" fill="#e7c58c"/><circle cx="31" cy="30" r="24" fill="#f4ddb0"/><path d="M15 21q5-10 17-10" fill="none" stroke="#fff6df" stroke-width="3" stroke-linecap="round"/><g fill="none" stroke="#594333" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${gaze}${mouth}${extra}</g></svg>`;
}
export function renderExpressions(escapedText) {
 const lookup=new Map(EXPRESSIONS.map(e=>[e.e,expressionArt(e.e)]));
 const pattern=new RegExp(EXPRESSIONS.map(e=>e.e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|'),'gu');
 return escapedText.replace(pattern,value=>lookup.get(value));
}
