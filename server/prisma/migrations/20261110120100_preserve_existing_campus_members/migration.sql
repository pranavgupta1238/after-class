-- Preserve previously enrolled NIIT members. The root email domain alone does not
-- establish a faculty appointment; new shared-domain accounts require an approved roster.
UPDATE campuses c SET access_policy=jsonb_build_object(
  'domains', jsonb_build_array(
    jsonb_build_object('domain','st.niituniversity.in','role','student'),
    jsonb_build_object('domain','niituniversity.in','role','roster')),
  'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('email',lower(u.email),'role','student'))
    FROM users u WHERE u.campus_id=c.id AND split_part(lower(u.email),'@',2)='niituniversity.in'), '[]'::jsonb)
) WHERE c.slug='niit-university';
UPDATE users u SET campus_role='student', campus_eligible=true
FROM campuses c WHERE u.campus_id=c.id AND c.slug='niit-university'
AND split_part(lower(u.email),'@',2) IN ('st.niituniversity.in','niituniversity.in');
