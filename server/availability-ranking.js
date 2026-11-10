function rankAvailable(viewer,users,now=new Date()){
 const vp=viewer.connectionProfile||{};
 return users.map(u=>{
  const p=u.connectionProfile,shared=(p.interests||[]).filter(x=>(vp.interests||[]).includes(x));
  const viewerFree=new Date(vp.availableUntil)>now;
  const overlapMinutes=viewerFree?Math.max(0,Math.floor((Math.min(+new Date(vp.availableUntil),+new Date(p.availableUntil))-now)/60000)):null;
  const sameActivity=viewerFree&&vp.availabilityActivity===p.availabilityActivity;
  return {user:u,sharedInterests:shared,overlapMinutes,reasons:[...(sameActivity?['Same activity']:[]),...(overlapMinutes?['Free together for '+overlapMinutes+' min']:[]),...(shared.length?['Both into '+shared.slice(0,2).join(' & ')]:[])],rank:(sameActivity?10:0)+shared.length*2+Math.min(overlapMinutes||0,60)/60};
 }).filter(x=>new Date(x.user.connectionProfile.availableUntil)>now).sort((a,b)=>b.rank-a.rank||a.user.id.localeCompare(b.user.id)).slice(0,12);
}
module.exports={rankAvailable};
