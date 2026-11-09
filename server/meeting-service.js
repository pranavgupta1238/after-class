const { isBlocked } = require('./connection-policy');
async function act(db, user, id, body) {
  return db.$transaction(async tx => {
    // Serialize competing confirms, proposals, acceptances, completions and cancellations.
    await tx.$queryRaw`SELECT id FROM matches WHERE id = ${id}::uuid FOR UPDATE`;
    const m = await tx.match.findUnique({where:{id},include:{request:true}});
    if (!m || ![m.userOneId,m.userTwoId].includes(user.id)) throw new Error('Meeting not found.');
    const other = m.userOneId===user.id?m.userTwoId:m.userOneId;
    if (await isBlocked(tx,user.id,other)) throw new Error('Meeting unavailable.');
    if (!Number.isInteger(body.revision) || body.revision!==m.revision) throw new Error('This meeting changed. Refresh it and try again.');
    if (m.status!=='active') throw new Error('This meeting is no longer active.');
    const data={revision:{increment:1}}, now=new Date();
    switch(body.action) {
      case 'confirm':
        if (m.proposedAt || m.scheduledAt<=now) throw new Error('Confirm a future meeting after any proposed changes are settled.');
        data[m.userOneId===user.id?'confirmedOneAt':'confirmedTwoAt']=now; break;
      case 'propose': {
        const d=new Date(body.scheduledAt);
        if (!Number.isFinite(d.getTime()) || d<=now || d.getTime()>Date.now()+30*864e5) throw new Error('Choose a future time within 30 days.');
        if (typeof body.location!=='string' || !body.location.trim() || body.location.length>120) throw new Error('Add a public meeting place.');
        data.proposedAt=d;data.proposedById=user.id;data.proposedLocation=body.location.trim();break;
      }
      case 'accept-change':
      case 'decline-change':
        if (!m.proposedAt || m.proposedById===user.id) throw new Error('Only the other student can respond to this proposal.');
        if (body.action==='accept-change') {
          if(m.proposedAt<=now) throw new Error('That proposed time has passed. Suggest a new time.');
          data.scheduledAt=m.proposedAt;data.confirmedOneAt=null;data.confirmedTwoAt=null;
          await tx.matchRequest.update({where:{id:m.requestId},data:{scheduledAt:m.proposedAt,location:m.proposedLocation}});
        }
        data.proposedAt=null;data.proposedById=null;data.proposedLocation=null;break;
      case 'withdraw-change':
        if (!m.proposedAt || m.proposedById!==user.id) throw new Error('There is no proposal to withdraw.');
        data.proposedAt=null;data.proposedById=null;data.proposedLocation=null;break;
      case 'cancel':
        data.status='cancelled';data.proposedAt=null;data.proposedById=null;data.proposedLocation=null;
        await tx.matchRequest.update({where:{id:m.requestId},data:{status:'cancelled',cancelledAt:now}});break;
      case 'complete':
        if(m.scheduledAt>now) throw new Error('You can mark a meeting complete after its scheduled time.');
        data.status='completed';data.completedAt=now;data.proposedAt=null;data.proposedById=null;data.proposedLocation=null;
        await tx.matchRequest.update({where:{id:m.requestId},data:{status:'completed'}});break;
      default: throw new Error('Unknown meeting action.');
    }
    return tx.match.update({where:{id},data});
  });
}
async function feedback(db,user,id,body) {
  const m=await db.match.findUnique({where:{id}});
  if(!m || ![m.userOneId,m.userTwoId].includes(user.id) || m.scheduledAt>new Date() || m.status!=='completed') throw new Error('Feedback opens after a meeting is marked complete.');
  if(!['comfortable','not_comfortable','did_not_meet'].includes(body.outcome) || typeof body.note!=='string' || body.note.length>400) throw new Error('Choose an outcome and keep your note under 400 characters.');
  return db.meetingFeedback.upsert({where:{matchId_userId:{matchId:id,userId:user.id}},create:{matchId:id,userId:user.id,outcome:body.outcome,note:body.note.trim()},update:{outcome:body.outcome,note:body.note.trim()}});
}
module.exports={act,feedback};
