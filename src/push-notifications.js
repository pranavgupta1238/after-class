export function installPushNotifications({api,state,escapeHtml:e}) {
 let active=null;
 const supported=()=>isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 async function detach(){try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager.getSubscription();if(sub){await api('/notifications/devices',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe();}active=false;}catch{active=null;}}
 async function open(){
  if(!state.me)return window.openAuth();
  if(document.getElementById('push-settings'))return;
  const dialog=document.createElement('dialog');dialog.id='push-settings';dialog.className='staff-unlock push-settings';
  dialog.innerHTML='<button class="staff-close" aria-label="Close">×</button><h2>Stay in the loop</h2><p>Choose what reaches you when Afterclass is closed.</p><div class="push-body" role="status">Loading preferences…</div><p class="staff-error" role="alert"></p>';
  document.body.append(dialog);dialog.showModal();dialog.querySelector('.staff-close').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  const body=dialog.querySelector('.push-body'),status=dialog.querySelector('[role=alert]');
  try {
   const d=await api('/notifications'),p=d.preferences;
   const reg=supported()?await navigator.serviceWorker.getRegistration():null;
   const sub=await reg?.pushManager.getSubscription();
   active=Boolean(sub&&p.enabled);
   const time=n=>n===null?'':`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
   body.innerHTML=`${!d.configured?`<p class="push-note">${d.reviewMode?'Demo mode: preferences can be explored here; no background notifications are sent.':'Background notifications are awaiting server setup.'}</p>`:''}${!supported()?'<p class="push-note">This browser does not support background push. On iPhone or iPad, try adding Afterclass to your Home Screen first.</p>':''}<form><label class="push-choice"><input type="checkbox" name="enabled" ${p.enabled?'checked':''} ${!d.configured||!supported()?'disabled':''}>Background notifications</label><label class="push-choice"><input type="checkbox" name="messages" ${p.messages?'checked':''}>Private messages</label><label class="push-choice"><input type="checkbox" name="plans" ${p.plans?'checked':''}>Invitations, meeting updates & reminders</label><div class="push-hours"><label>Quiet from<input name="start" type="time" value="${time(p.quiet_start)}"></label><label>Until<input name="end" type="time" value="${time(p.quiet_end)}"></label></div><label>Time zone<input name="timezone" value="${e(p.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone)}" required maxlength="80"></label><small>Leave both times empty for no quiet hours. Message content and names stay off your lock screen.</small><button class="primary" type="submit">Save preferences</button></form><div class="push-tools"><button class="secondary" data-test ${!d.configured?'disabled':''}>Send a test notification</button><button class="link" data-remove>Remove all devices</button></div><small>${d.devices} registered device${d.devices===1?'':'s'} · Test alerts also respect quiet hours.</small>`;
   body.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;status.textContent='';
    try{
     const f=new FormData(event.currentTarget),parse=t=>t?Number(t.split(':')[0])*60+Number(t.split(':')[1]):null;
     const values={enabled:f.has('enabled'),messages:f.has('messages'),plans:f.has('plans'),quiet_start:parse(f.get('start')),quiet_end:parse(f.get('end')),timezone:f.get('timezone')};
     if((values.quiet_start===null)!==(values.quiet_end===null)||values.quiet_start!==null&&values.quiet_start===values.quiet_end)throw new Error('Set both quiet-hour times, with different start and end times.');
     if(values.enabled){
      if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your browser settings, then try again.');
      const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){const b64=d.publicKey.replace(/-/g,'+').replace(/_/g,'/');const key=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
      await api('/notifications/devices',{method:'POST',body:JSON.stringify(subscription.toJSON())});
     }
     await api('/notifications/preferences',{method:'PUT',body:JSON.stringify(values)});
     active=values.enabled;localStorage.setItem('afterclass_notifications_muted',String(!values.enabled));
     status.textContent='Preferences saved.';
    }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
   };
   body.querySelector('[data-test]').onclick=async()=>{try{const r=await api('/notifications/test',{method:'POST',body:'{}'});status.textContent=r.queued?'Test queued. It may take a few seconds.':'Enable notifications and register this device first.';}catch(err){status.textContent=err.message;}};
   body.querySelector('[data-remove]').onclick=async()=>{try{await api('/notifications/devices',{method:'DELETE',body:'{"all":true}'});await (await navigator.serviceWorker?.getRegistration())?.pushManager.getSubscription().then(s=>s?.unsubscribe());active=false;status.textContent='All devices removed. Save with background notifications enabled to reconnect this device.';}catch(err){status.textContent=err.message;}};
  }catch(err){body.textContent='Could not load notification preferences.';status.textContent=err.message;}
 }
 // Server push is the only OS-notification path; socket updates keep in-app sound and UI.
 return window.pushSettings={open,detach,isActive:()=>active};
}
