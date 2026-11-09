// Anonymous, role-specific illustrations. Never render profile artwork here:
// a reporter's familiar campus avatar could identify them to the account holder.
export function hearingCharacter(role, {raised=false,speaking=false}={}) {
 const judge=role==='judge',reporter=role==='reporter';
 const id='court-'+role,skin=judge?'#bc865f':reporter?'#d6a17b':'#c99770',coat=judge?'#243b37':reporter?'#b2b9a3':'#819b99';
 return `<svg class="court-character ${speaking?'is-speaking':''} ${raised?'is-requesting':''}" viewBox="0 0 180 220" aria-hidden="true" focusable="false">
 <defs><linearGradient id="${id}-coat" x2="1" y2="1"><stop stop-color="${coat}"/><stop offset="1" stop-color="${judge?'#142b28':reporter?'#7f907b':'#486d6d'}"/></linearGradient><radialGradient id="${id}-face" cx=".35" cy=".25" r=".8"><stop stop-color="${judge?'#dfb18a':reporter?'#efc6a3':'#e7bb95'}"/><stop offset="1" stop-color="${skin}"/></radialGradient></defs>
 ${judge?'<rect x="31" y="25" width="118" height="177" rx="37" fill="#71503b" stroke="#b5946b" stroke-width="3"/><rect x="40" y="34" width="100" height="155" rx="31" fill="#28483f"/><path d="M50 52q40-30 80 0" fill="none" stroke="#9b9568"/>':'<rect x="48" y="123" width="85" height="80" rx="25" fill="#473a31"/>'}
 <ellipse cx="90" cy="207" rx="65" ry="8" fill="#102b2520"/>
 <path d="M45 211v-65q0-28 45-28t45 28v65Z" fill="url(#${id}-coat)"/>
 <path d="M78 116v22q12 15 24 0v-22" fill="${skin}"/>
 ${judge?'<path d="m66 128 24 28 24-28-9 40H75Z" fill="#eee6cf"/><path d="m90 154-10 35h20Z" fill="#fcf7e7"/><path d="M57 149v57m66-57v57" stroke="#536759" stroke-width="3"/>':'<path d="m69 127 21 23 21-23" fill="none" stroke="#f0e6d0" stroke-width="4"/>'}
 <g class="court-head"><ellipse cx="53" cy="85" rx="7" ry="12" fill="${skin}"/><ellipse cx="127" cy="85" rx="7" ry="12" fill="${skin}"/>
 <path d="M54 61q0-32 36-32t36 32v34q-1 32-36 36T54 95Z" fill="url(#${id}-face)"/>
 <path d="M52 77V55q0-31 38-31 40 0 39 36v19l-10-18q-31 7-49-11l-10 27Z" fill="${judge?'#474642':reporter?'#5e4539':'#383c36'}"/>
 ${judge?'<path d="m57 54 7-14m55 14-5-14" stroke="#98978d" stroke-width="6"/>':''}
 <path d="m68 77 11-2m22 0 11 2" stroke="#584438" stroke-width="3" stroke-linecap="round"/>
 <g class="court-eyes"><ellipse cx="75" cy="87" rx="3" ry="4" fill="#343832"/><ellipse cx="105" cy="87" rx="3" ry="4" fill="#343832"/></g>
 <path d="m89 87-3 14h7" fill="none" stroke="#a77855" stroke-width="2" stroke-linecap="round"/>
 <path class="court-mouth" d="M82 111q8 4 16 0" fill="none" stroke="#79503c" stroke-width="2.5" stroke-linecap="round"/>
 ${judge?'<g fill="none" stroke="#b7b49b" stroke-width="2"><rect x="61" y="79" width="25" height="19" rx="7"/><rect x="94" y="79" width="25" height="19" rx="7"/><path d="M86 85h8"/></g>':''}</g>
 <g class="court-hand"><path d="M47 145q-16 8-15 37l21 1 11-29" fill="${coat}"/><path d="M35 181q-4 18 10 18h25q9-3 1-10l-15-7" fill="${skin}"/></g>
 ${raised?`<g class="court-raised-hand"><path d="m126 149 14-16 1-42 17-1 6 51q-1 21-27 33" fill="${coat}"/><path d="m141 94-3-20q-1-8 4-7l3 11V54q1-7 5-1l2 20 2-25q4-6 6 1l-1 27 3-18q5-4 5 3l-2 23q-1 11-10 15Z" fill="${skin}"/></g>`:`<path d="M132 147q19 12 15 36l-21 5-10-29" fill="${coat}"/><path d="M143 181q9 17-7 18h-24q-9-4-2-10l16-7" fill="${skin}"/>`}
 </svg>`;
}
export function courtCrest(){return '<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" opacity=".45"/><circle cx="40" cy="40" r="29" fill="none" stroke="currentColor" opacity=".2"/><path d="M40 17c3 14 9 20 23 23-14 3-20 9-23 23-3-14-9-20-23-23 14-3 20-9 23-23Z" fill="currentColor"/></svg>';}
export function requestHand(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6c0 5-3 7-7 7-3 0-5-2-7-5l-3-4c-1-2 1-3 3-2l2 2"/></svg>';}
