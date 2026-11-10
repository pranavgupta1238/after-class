function registerActionCentre({app,prisma,requireAdmin,pushReady}) {
 app.get('/api/admin/action-centre',requireAdmin,async(req,res)=>{
  try {
   if(req.query.scope==='all'&&!req.isPlatformAdmin)return res.status(403).json({error:'Platform administrator access required.'});
   const campus=req.query.scope==='all'?null:req.adminCampusId;
   const [reports,verifications,appeals,delivery,alerts,pilot] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE r.created_at<now()-interval '48 hours')::int overdue,COUNT(*) FILTER(WHERE a.assignee_id IS NULL)::int unassigned,MIN(r.created_at) oldest FROM reports r LEFT JOIN report_assignments a ON a.report_id=r.id WHERE r.status IN ('pending','reviewing') AND (${campus}::uuid IS NULL OR r.campus_id=${campus}::uuid)`,
    prisma.user.count({where:{...(campus?{campusId:campus}:{}),verificationStatus:'pending'}}),
    prisma.$queryRaw`SELECT COUNT(*)::int count FROM account_reviews r JOIN users u ON u.id=r.user_id WHERE r.status IN ('submitted','in_review','awaiting_user') AND (${campus}::uuid IS NULL OR u.campus_id=${campus}::uuid)`,
    prisma.$queryRaw`SELECT n.status,COUNT(*)::int count FROM notification_deliveries n JOIN push_devices d ON d.id=n.device_id JOIN users u ON u.id=d.user_id WHERE n.created_at>now()-interval '24 hours' AND (${campus}::uuid IS NULL OR u.campus_id=${campus}::uuid) GROUP BY n.status`,
    req.isPlatformAdmin?prisma.$queryRaw`SELECT id::text,severity,summary,first_seen,acknowledged_at FROM operational_alerts WHERE resolved_at IS NULL ORDER BY CASE WHEN severity='critical' THEN 0 ELSE 1 END,first_seen LIMIT 20`:[],
    prisma.$queryRaw`SELECT c.id,c.name,COUNT(t.task_key) FILTER(WHERE t.completed)::int complete FROM campuses c LEFT JOIN campus_pilot_tasks t ON t.campus_id=c.id WHERE c.status='active' AND (${campus}::uuid IS NULL OR c.id=${campus}::uuid) GROUP BY c.id,c.name ORDER BY c.name`
   ]);
   res.set('Cache-Control','no-store').json({at:new Date(),reports:reports[0],verifications,appeals:appeals[0].count,delivery,alerts,pilot,pilotTotal:require('./reliability').PILOT_TASKS.length,
    configuration:req.isPlatformAdmin?{push:pushReady,redisConfigured:!!process.env.REDIS_URL,production:process.env.NODE_ENV==='production',externalAlertRecipientConfigured:!!process.env.OPERATIONS_ALERT_EMAIL}:null});
  }catch{res.status(503).json({error:'Action centre could not load. Please retry.'});}
 });
}
module.exports={registerActionCentre};
