ALTER TABLE campuses ADD COLUMN audience text NOT NULL DEFAULT 'students', ADD COLUMN enrollment_open boolean NOT NULL DEFAULT true, ADD COLUMN access_policy jsonb, ADD COLUMN policy_revision integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN campus_role text NOT NULL DEFAULT 'student', ADD COLUMN campus_eligible boolean NOT NULL DEFAULT true;
ALTER TABLE campuses ADD CONSTRAINT campus_audience_valid CHECK (audience IN ('students','faculty','both'));
ALTER TABLE users ADD CONSTRAINT campus_role_valid CHECK (campus_role IN ('student','faculty','unknown'));
UPDATE campuses SET access_policy='{"domains":[{"domain":"st.niituniversity.in","role":"student"},{"domain":"niituniversity.in","role":"faculty"}],"members":[]}'::jsonb WHERE slug='niit-university';
UPDATE users u SET campus_role=CASE WHEN split_part(lower(email),'@',2)='st.niituniversity.in' THEN 'student' WHEN split_part(lower(email),'@',2)='niituniversity.in' THEN 'faculty' ELSE 'unknown' END, campus_eligible=(split_part(lower(email),'@',2)='st.niituniversity.in') FROM campuses c WHERE u.campus_id=c.id AND c.slug='niit-university';
