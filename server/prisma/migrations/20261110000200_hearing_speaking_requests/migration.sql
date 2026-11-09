ALTER TABLE hearings ADD COLUMN judge_last_seen_at TIMESTAMPTZ(6);
ALTER TABLE hearing_participants
 ADD COLUMN speak_requested_at TIMESTAMPTZ(6),
 ADD COLUMN speak_request_kind VARCHAR(20) CHECK (speak_request_kind IN ('objection','speak')),
 ADD COLUMN speak_requested_last_at TIMESTAMPTZ(6);
