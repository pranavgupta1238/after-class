const {Prisma}=require('@prisma/client');
const day=86400000;
function analyticsWindow(value,now=new Date()){
 const days=value===undefined?30:Number(value);
 if(![7,30,90].includes(days))throw Object.assign(new Error('Choose 7, 30 or 90 days.'),{status:400});
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-(days-1)*day);
 return {days,start,end:now,previousStart:new Date(start.getTime()-days*day)};
}
async function analytics(prisma,campusId,window){
 const {start,end,previousStart}=window;
 // Aggregate in PostgreSQL: no email addresses, message bodies, demographics or evidence leave the database.
 const scope=Prisma.sql`SELECT id,name,status,audience,enrollment_open FROM campuses WHERE (${campusId}::uuid IS NULL OR id=${campusId}::uuid)`;
 const events=Prisma.sql`
 SELECT r.campus_id,u.sender_id AS user_id,u.created_at FROM messages u JOIN chat_rooms r ON r.id=u.room_id JOIN scope s ON s.id=r.campus_id WHERE u.created_at>=${previousStart} AND u.created_at<=${end}
 UNION ALL SELECT r.campus_id,r.requester_id,r.created_at FROM match_requests r JOIN scope s ON s.id=r.campus_id WHERE r.created_at>=${previousStart} AND r.created_at<=${end}
 UNION ALL SELECT r.campus_id,a.applicant_id,a.created_at FROM match_applications a JOIN match_requests r ON r.id=a.request_id JOIN scope s ON s.id=r.campus_id WHERE a.created_at>=${previousStart} AND a.created_at<=${end}`;
 const rowsQuery=prisma.$queryRaw(Prisma.sql`
 WITH scope AS (${scope}), events AS (${events}),
 participation AS (SELECT campus_id,COUNT(DISTINCT user_id) FILTER(WHERE created_at>=${start})::int participants,
 COUNT(DISTINCT user_id) FILTER(WHERE created_at>=${start} AND user_id IN (SELECT user_id FROM events WHERE created_at<${start}))::int "returning" FROM events GROUP BY campus_id),
 users AS (SELECT campus_id,COUNT(*)::int accounts,COUNT(*) FILTER(WHERE is_verified AND verification_status='approved')::int verified,
 COUNT(*) FILTER(WHERE verification_status='pending')::int verification_pending,COUNT(*) FILTER(WHERE created_at>=${start} AND created_at<=${end})::int signups FROM users WHERE campus_id IN(SELECT id FROM scope) GROUP BY campus_id),
 plans AS (SELECT r.campus_id,COUNT(*) FILTER(WHERE r.created_at>=${start} AND r.created_at<=${end})::int plans,
 COUNT(*) FILTER(WHERE r.created_at>=${start} AND r.created_at<=${end} AND EXISTS(SELECT 1 FROM matches m WHERE m.request_id=r.id))::int matched_plans,
 COUNT(*) FILTER(WHERE r.status IN ('open','pending_acceptance') AND r.scheduled_at>${end} AND r.expires_at>${end})::int open_plans,
 COUNT(*) FILTER(WHERE r.created_at>=${start} AND r.created_at<=${end} AND r.scheduled_at<=${end} AND NOT EXISTS(SELECT 1 FROM matches m WHERE m.request_id=r.id))::int unmatched_past_plans FROM match_requests r WHERE r.campus_id IN(SELECT id FROM scope) GROUP BY r.campus_id),
 matches AS (SELECT r.campus_id,COUNT(*)::int matches,COUNT(*) FILTER(WHERE m.confirmed_one_at IS NOT NULL AND m.confirmed_two_at IS NOT NULL AND m.status!='cancelled')::int confirmed,
 COUNT(*) FILTER(WHERE m.status='completed')::int completed,COUNT(*) FILTER(WHERE m.status='cancelled')::int cancelled FROM matches m JOIN match_requests r ON r.id=m.request_id WHERE r.campus_id IN(SELECT id FROM scope) AND m.created_at>=${start} AND m.created_at<=${end} GROUP BY r.campus_id),
 reports AS (SELECT campus_id,COUNT(*) FILTER(WHERE created_at>=${start} AND created_at<=${end})::int reports,
 COUNT(*) FILTER(WHERE status IN ('pending','reviewing'))::int pending_reports,
 COUNT(DISTINCT reported_user_id) FILTER(WHERE status IN ('pending','reviewing'))::int reported_accounts,
 COUNT(*) FILTER(WHERE status IN ('pending','reviewing') AND created_at<${new Date(end-day*2)})::int aged_reports,
 COUNT(*) FILTER(WHERE resolved_at>=${start} AND resolved_at<=${end})::int resolved_reports,
 MIN(created_at) FILTER(WHERE status IN ('pending','reviewing')) oldest_report FROM reports WHERE campus_id IN(SELECT id FROM scope) GROUP BY campus_id),
 reviews AS (SELECT a.campus_id,COUNT(*) FILTER(WHERE v.status!='resolved')::int open_reviews FROM account_reviews v JOIN moderation_actions a ON a.id=v.action_id WHERE a.campus_id IN(SELECT id FROM scope) GROUP BY a.campus_id),
 hearings AS (SELECT a.campus_id,COUNT(*)::int upcoming_hearings FROM hearings h JOIN account_reviews v ON v.id=h.review_id JOIN moderation_actions a ON a.id=v.action_id JOIN hearing_slots s ON s.id=h.slot_id WHERE a.campus_id IN(SELECT id FROM scope) AND h.status IN ('scheduled','live') AND s.ends_at>${end} GROUP BY a.campus_id)
 SELECT s.id,s.name,s.status,s.audience,s.enrollment_open,COALESCE(u.accounts,0) accounts,COALESCE(u.verified,0) verified,COALESCE(u.verification_pending,0) verification_pending,COALESCE(u.signups,0) signups,
 COALESCE(p.plans,0) plans,COALESCE(p.matched_plans,0) matched_plans,COALESCE(p.open_plans,0) open_plans,COALESCE(p.unmatched_past_plans,0) unmatched_past_plans,
 COALESCE(m.matches,0) matches,COALESCE(m.confirmed,0) confirmed,COALESCE(m.completed,0) completed,COALESCE(m.cancelled,0) cancelled,
 COALESCE(r.reports,0) reports,COALESCE(r.pending_reports,0) pending_reports,COALESCE(r.reported_accounts,0) reported_accounts,COALESCE(r.aged_reports,0) aged_reports,COALESCE(r.resolved_reports,0) resolved_reports,r.oldest_report,
 COALESCE(v.open_reviews,0) open_reviews,COALESCE(h.upcoming_hearings,0) upcoming_hearings,COALESCE(t.participants,0) participants,COALESCE(t."returning",0) "returning"
 FROM scope s LEFT JOIN users u ON u.campus_id=s.id LEFT JOIN plans p ON p.campus_id=s.id LEFT JOIN matches m ON m.campus_id=s.id LEFT JOIN reports r ON r.campus_id=s.id LEFT JOIN reviews v ON v.campus_id=s.id LEFT JOIN hearings h ON h.campus_id=s.id LEFT JOIN participation t ON t.campus_id=s.id ORDER BY s.name`);
 const seriesQuery=prisma.$queryRaw(Prisma.sql`
 WITH scope AS (${scope}), events AS (
 SELECT (created_at AT TIME ZONE 'UTC')::date AS bucket_date,'signups' kind FROM users WHERE campus_id IN(SELECT id FROM scope) AND created_at BETWEEN ${start} AND ${end}
 UNION ALL SELECT (created_at AT TIME ZONE 'UTC')::date,'plans' FROM match_requests WHERE campus_id IN(SELECT id FROM scope) AND created_at BETWEEN ${start} AND ${end}
 UNION ALL SELECT (m.created_at AT TIME ZONE 'UTC')::date,'matches' FROM matches m JOIN match_requests r ON r.id=m.request_id WHERE r.campus_id IN(SELECT id FROM scope) AND m.created_at BETWEEN ${start} AND ${end})
 SELECT bucket_date,COUNT(*) FILTER(WHERE kind='signups')::int signups,COUNT(*) FILTER(WHERE kind='plans')::int plans,COUNT(*) FILTER(WHERE kind='matches')::int matches FROM events GROUP BY bucket_date ORDER BY bucket_date`);
 const reasonsQuery= prisma.report.groupBy({by:['reason'],where:{...(campusId?{campusId}:{}),createdAt:{gte:start,lte:end}},_count:{_all:true}});
 const [rows,series,reasons]=await Promise.all([rowsQuery,seriesQuery,reasonsQuery]);
 const byDate=new Map(series.map(r=>[r.bucket_date.toISOString().slice(0,10),r]));
 const daily=Array.from({length:window.days},(_,i)=>{const date=new Date(start.getTime()+i*day).toISOString().slice(0,10);const r=byDate.get(date);return {date,signups:r?.signups||0,plans:r?.plans||0,matches:r?.matches||0};});

 return {generatedAt:end.toISOString(),days:window.days,start:start.toISOString(),end:end.toISOString(),timezone:'UTC',campuses:rows,daily,reasons:reasons.map(r=>({reason:r.reason,count:r._count._all}))};
}
module.exports={analyticsWindow,analytics};
