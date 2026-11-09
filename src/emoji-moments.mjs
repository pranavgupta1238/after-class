import { emojiBehavior } from './emoji-behaviors.mjs';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const emoji = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)$/u;
export function emojiMood(text) {
  if(typeof text!=='string'||text.length>160)return null;
  const parts=[...segmenter.segment(text.trim())].map(p=>p.segment).filter(p=>!/^\s+$/u.test(p));
  if(!parts.length||parts.length>6||!parts.every(p=>emoji.test(p)))return null;
  return 'emoji';
}
const seen=new Set(), active=new Set(), artwork=new Map();
const NS='http://www.w3.org/2000/svg';
const duration=3400;
function svgNode(tag,attrs={}) { const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);return node; }
async function loadArtwork(src) {
  const url=new URL(src,location.origin);
  if(url.origin!==location.origin||!/^\/emoji\/twemoji-17\.0\.3\/[a-f0-9-]+\.svg$/.test(url.pathname))return null;
  if(!artwork.has(url.pathname)) {
    const promise=fetch(url.pathname,{signal:AbortSignal.timeout(2500)}).then(response=>{if(!response.ok)throw Error('Artwork unavailable');return response.text()});
    artwork.set(url.pathname,promise);
    promise.catch(()=>artwork.delete(url.pathname));
    if(artwork.size>64)artwork.delete(artwork.keys().next().value);
  }
  const doc=new DOMParser().parseFromString(await artwork.get(url.pathname),'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')return null;
  // Only the vetted, local vector vocabulary is allowed into the document.
  for(const node of doc.querySelectorAll('*')) {
    if(!['svg','g','path','circle','ellipse','rect','polygon','polyline','line','defs','clipPath'].includes(node.localName))return null;
    for(const attr of node.attributes)if(/^on/i.test(attr.name)||/href|src|style/i.test(attr.name)||/url\s*\(/i.test(attr.value))return null;
  }
  return document.importNode(doc.documentElement,true);
}
function animateDetails(svg,kind,animations) {
  const shapes=[...svg.querySelectorAll('path,ellipse,circle,rect,polygon')];
  const box=node=>node.getBBox();
  const fill=node=>(node.getAttribute('fill')||node.closest('g[fill]')?.getAttribute('fill')||'').toLowerCase();
  const dark=node=>['#664500','#66471b','#65471b','#292f33'].includes(fill(node));
  const eyes=shapes.filter(node=>dark(node)&&box(node).y<21&&box(node).width<12&&box(node).height<12);
  const mouths=shapes.filter(node=>dark(node)&&box(node).y>=20&&box(node).height<16);
  const blue=shapes.filter(node=>['#5dadec','#55acee','#88c9f9'].includes(fill(node)));
  const pink=shapes.filter(node=>['#e8596e','#dd2f45','#e75a70','#f4abba'].includes(fill(node)));
  const red=shapes.filter(node=>['#dd2e44','#e95f28','#ea596e','#f4900c'].includes(fill(node)));
  const motion=(node,frames,ms=800,delay=0)=>{
    node.style.transformBox='fill-box';node.style.transformOrigin='center';
    animations.push(node.animate(frames,{duration:ms,delay,iterations:Math.ceil(duration/ms),easing:'ease-in-out'}));
  };
  const transform=(node,values,ms,delay)=>motion(node,values.map(transform=>({transform})),ms,delay);
  const blink=(nodes=eyes)=>nodes.forEach((node,index)=>motion(node,[{transform:'scaleY(1)',offset:0},{transform:'scaleY(1)',offset:.65},{transform:'scaleY(.08)',offset:.73},{transform:'scaleY(1)',offset:.82},{transform:'scaleY(1)',offset:1}],1300,index*60));
  const breatheMouth=(amount=1.25,ms=650)=>mouths.forEach(node=>transform(node,['scaleY(1)',`scaleY(${amount})`,'scaleY(1)'],ms));
  const tearDrops=()=>blue.forEach((node,index)=>{
    if(box(node).height<3)return;
    motion(node,[{transform:'translateY(-4px) scale(.65)',opacity:0},{transform:'translateY(0) scale(1)',opacity:1,offset:.32},{transform:'translateY(7px) scale(.8)',opacity:0}],950,index*180);
  });
  const group=()=>{const g=svgNode('g');while(svg.firstChild)g.append(svg.firstChild);svg.append(g);return g;};
  const emit=(type,count=5)=>{
    for(let i=0;i<count;i++){
      let node;
      if(type==='steam')node=svgNode('path',{d:`M${11+i*7} 17q-4-3 0-6t0-6`,stroke:'#e1e8e6','stroke-width':1.3,fill:'none','stroke-linecap':'round'});
      else if(type==='rain')node=svgNode('path',{d:`M${7+i*5} 18q-4 7 0 7t0-7`,fill:'#55acee'});
      else node=svgNode('circle',{cx:5+(i*7)%28,cy:8+(i*11)%20,r:type==='sparkle'?1.2:1.6,fill:['#ffcc4d','#ea596e','#55acee','#77b255'][i%4]});
      svg.append(node);node.dataset.emojiDetail=type;
      motion(node,[{opacity:0,transform:'translateY(0)'},{opacity:1,offset:.25},{opacity:0,transform:`translateY(${type==='rain'?13:-10}px)`}],1100,i*130);
    }
  };
  svg.dataset.emojiBehavior=kind;
  switch(kind){
    case 'tear': tearDrops();blink();breatheMouth(1.12,1000);break;
    case 'sob':
      blue.forEach(node=>{node.style.transformOrigin='center top';motion(node,[{opacity:.75,transform:'scaleY(.7)'},{opacity:1,transform:'scaleY(1.05)'},{opacity:.8,transform:'scaleY(.8)'}],600);node.style.transformOrigin='center top';});
      pink.forEach(node=>transform(node,['scaleY(.65)','scaleY(1.2)','scaleY(.65)'],440));
      for(const [index,x] of [10,26].entries()) {
        const drop=svgNode('path',{d:`M${x} 16q-3 5 0 5t0-5`,fill:'#88c9f9'});
        svg.append(drop);drop.dataset.emojiDetail='tear';
        motion(drop,[{opacity:0,transform:'translateY(0)'},{opacity:1,offset:.2},{opacity:0,transform:'translateY(15px)'}],800,index*300);
      }
      break;
    case 'laugh':
      tearDrops();breatheMouth(1.35,360);
      shapes.filter(node=>['#fff','#ffffff'].includes(fill(node))&&box(node).y>20).forEach(node=>transform(node,['scaleY(1)','scaleY(.6)','scaleY(1)'],360));
      eyes.forEach(node=>transform(node,['translateY(0)','translateY(-1px)','translateY(0)'],360));break;
    case 'melt': {const face=shapes[0];face.style.transformOrigin='center bottom';transform(face,['scale(1,1)','scale(1.05,.78)','scale(1,1)'],2400);face.style.transformOrigin='center bottom';shapes.slice(1).forEach(node=>transform(node,['translateY(0)','translate(1px,5px)','translateY(0)'],2400));break;}
    case 'starEyes': red.forEach(node=>transform(node,['rotate(0) scale(1)','rotate(9deg) scale(.83)','rotate(-9deg) scale(1)','rotate(0) scale(1)'],850));breatheMouth(1.15);emit('sparkle',4);break;
    case 'tongue': pink.forEach(node=>transform(node,['translateY(-2px) scaleY(.8)','translateY(2px) scaleY(1.08)','translateY(-2px) scaleY(.8)'],700));blink();break;
    case 'wink': blink();mouths.forEach(node=>transform(node,['rotate(0)','rotate(-5deg)','rotate(0)'],1400));break;
    case 'heartEyes': red.forEach(node=>transform(node,['scale(1)','scale(1.15)','scale(1)','scale(1.1)','scale(1)'],1000));blink();breatheMouth(1.1,1100);break;
    case 'kiss': breatheMouth(.6,900);red.forEach(node=>motion(node,[{opacity:1,transform:'translate(0,0)'},{opacity:0,transform:'translate(5px,-5px)'}],1200));blink();break;
    case 'sleep': breatheMouth(1.3,1800);shapes.filter(node=>fill(node)==='#2a6797'||fill(node)==='#ffac33').forEach((node,i)=>motion(node,[{opacity:.3,transform:'translateY(2px)'},{opacity:1,transform:'translateY(-2px)'},{opacity:.3,transform:'translateY(-4px)'}],1700,i*100));break;
    case 'angry': shapes.filter(dark).forEach(node=>transform(node,['translateX(0)','translateX(-.7px)','translateX(.7px)','translateX(0)'],220));motion(shapes[0],[{filter:'saturate(1)'},{filter:'saturate(1.5)'},{filter:'saturate(1)'}],1000);break;
    case 'surprise': eyes.forEach(node=>transform(node,['scaleY(1)','scaleY(1.22)','scaleY(1)'],1400));breatheMouth(1.4,1300);break;
    case 'think': eyes.forEach(node=>transform(node,['translateX(0)','translateX(-1.3px)','translateX(0)'],1700));break;
    case 'eyeRoll': eyes.forEach(node=>transform(node,['translate(0,0)','translate(0,-2px)','translate(1px,-1px)','translate(0,0)'],1800));break;
    case 'dizzy': shapes.slice(1).forEach(node=>transform(node,['translateX(-1px) rotate(-3deg)','translateX(1px) rotate(3deg)','translateX(-1px) rotate(-3deg)'],300));break;
    case 'cold': transform(group(),['translateX(-.8px)','translateX(.8px)','translateX(-.8px)'],180);break;
    case 'hot': tearDrops();breatheMouth(1.2,650);break;
    case 'sick': blink();breatheMouth(1.2,900);blue.forEach(node=>transform(node,['translateY(0)','translateY(3px)','translateY(0)'],900));break;
    case 'shy': blink();breatheMouth(.85,1600);break;
    case 'sad': blink();mouths.forEach(node=>transform(node,['translateY(0)','translateY(1px)','translateY(0)'],1800));break;
    case 'blink': blink();break;
    case 'smile': blink();breatheMouth(1.12,1300);break;
    case 'party': shapes.filter(node=>['#3b88c3','#88c9f9','#269'].includes(fill(node))).forEach(node=>transform(node,['scaleX(.8)','scaleX(1.15)','scaleX(.8)'],900));breatheMouth(.7,900);emit('confetti',9);break;
    case 'heart': transform(group(),['scale(1)','scale(1.08)','scale(1)','scale(1.05)','scale(1)'],1100);break;
    case 'heartbreak': shapes.forEach((node,i)=>transform(node,['translateX(0)',`translateX(${i%2?1:-1}px)`,'translateX(0)'],1300));break;
    case 'fire': shapes.forEach((node,i)=>{transform(node,['skewX(-3deg) scaleY(.93)','skewX(3deg) scaleY(1.04)','skewX(-3deg) scaleY(.93)'],400+i*170);node.style.transformOrigin='center bottom';});break;
    case 'wave': {const g=group();transform(g,['rotate(-10deg)','rotate(12deg)','rotate(-10deg)'],550);g.style.transformOrigin='center bottom';break;}
    case 'clap': shapes.forEach((node,i)=>transform(node,['translateX(0)',`translateX(${i%2?-1.5:1.5}px)`,'translateX(0)'],380));break;
    case 'thumbs': {const g=group();transform(g,['rotate(0)','rotate(-8deg)','rotate(0)'],1100);g.style.transformOrigin='center bottom';break;}
    case 'rocket': transform(group(),['translate(0,0)','translate(2px,-2px)','translate(-1px,1px)','translate(0,0)'],750);emit('sparkle',3);break;
    case 'ball': transform(group(),['translateY(0) rotate(0)','translateY(-5px) rotate(20deg)','translateY(0) rotate(40deg)'],750);break;
    case 'sparkle': shapes.forEach((node,i)=>motion(node,[{opacity:.4},{opacity:1},{opacity:.4}],800,i*90));break;
    case 'rain': emit('rain',5);break;
    case 'steam': emit('steam',3);break;
    case 'grow': {const g=group();transform(g,['rotate(-4deg)','rotate(4deg)','rotate(-4deg)'],1700);g.style.transformOrigin='center bottom';break;}
    case 'dance': transform(group(),['rotate(-6deg) translateY(0)','rotate(6deg) translateY(-1px)','rotate(-6deg) translateY(0)'],650);break;
    case 'run': transform(group(),['translate(0,0) rotate(-2deg)','translate(1px,-1px) rotate(2deg)','translate(0,0) rotate(-2deg)'],400);break;
    case 'flag': {const g=group();transform(g,['skewY(-3deg) scaleX(.96)','skewY(3deg) scaleX(1)','skewY(-3deg) scaleX(.96)'],900);g.style.transformOrigin='left center';break;}
    case 'music': shapes.forEach((node,i)=>transform(node,['translateY(0)',`translateY(${i%2?-2:2}px)`,'translateY(0)'],600,i*80));break;
    case 'float': transform(group(),['translateY(0) rotate(-3deg)','translateY(-3px) rotate(3deg)','translateY(0) rotate(-3deg)'],1800);break;
    case 'snow': transform(group(),['rotate(-8deg)','rotate(8deg)','rotate(-8deg)'],2300);break;
    case 'butterfly': shapes.forEach((node,i)=>transform(node,['scaleX(1)',`scaleX(${i%2?.8:.9})`,'scaleX(1)'],350));break;
    case 'fish': transform(group(),['rotate(-3deg) translateX(-1px)','rotate(3deg) translateX(1px)','rotate(-3deg) translateX(-1px)'],1000);break;
  }
}

export function playEmojiMoment(element,{id,text,isSystem=false}={}) {
  if(!id||isSystem||seen.has(id))return false;
  seen.add(id);if(seen.size>500)seen.delete(seen.values().next().value);
  if(!emojiMood(text)||!element?.isConnected||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
  const chat=element.closest('#chat-messages,#private-messages');if(!chat)return false;
  const bounds=chat.getBoundingClientRect(),rect=element.getBoundingClientRect();
  if(rect.bottom<=bounds.top||rect.top>=bounds.bottom)return false;
  const images=[...element.querySelectorAll('img.ac-emoji')].map(img=>({img,kind:emojiBehavior(img.alt,img.getAttribute('aria-label'))})).filter(item=>item.kind);
  if(!images.length)return false;
  while(active.size>=3)active.values().next().value()();
  const animations=[],actors=[];let stopped=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const observer=new MutationObserver(()=>{if(!element.isConnected)cleanup()});
  const timer=setTimeout(cleanup,duration+2500); // Also bound slow artwork requests.
  let playbackTimer;
  function cleanup(){
    if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(playbackTimer);
    observer.disconnect();animations.forEach(a=>a.cancel());
    actors.forEach(({img,wrapper,visibility})=>{img.style.visibility=visibility;wrapper.replaceWith(img)});
    chat.removeEventListener('scroll',cleanup);window.removeEventListener('resize',cleanup);document.removeEventListener('visibilitychange',cleanup);reduced.removeEventListener('change',cleanup);active.delete(cleanup);
  }
  active.add(cleanup);observer.observe(document.body,{childList:true,subtree:true});
  chat.addEventListener('scroll',cleanup,{once:true});window.addEventListener('resize',cleanup,{once:true});document.addEventListener('visibilitychange',cleanup,{once:true});reduced.addEventListener('change',cleanup,{once:true});
  Promise.all(images.map(async({img,kind})=>{
    try{
      const svg=await loadArtwork(img.src);if(!svg||stopped||!img.isConnected)return;
      if(!playbackTimer)playbackTimer=setTimeout(cleanup,duration);
      const size=img.getBoundingClientRect();const wrapper=document.createElement('span');
      wrapper.className='emoji-actor';wrapper.style.width=`${size.width}px`;wrapper.style.height=`${size.height}px`;wrapper.setAttribute('role','img');wrapper.setAttribute('aria-label',img.getAttribute('aria-label')||img.alt);
      const visibility=img.style.visibility;img.before(wrapper);wrapper.append(img);img.style.visibility='hidden';
      svg.classList.add('emoji-actor-art');svg.setAttribute('aria-hidden','true');wrapper.append(svg);actors.push({img,wrapper,visibility});
      animateDetails(svg,kind,animations);
    }catch{/* Static artwork remains usable if an animation cannot load. */}
  })).then(()=>{if(!actors.length)cleanup()});
  return true;
}
