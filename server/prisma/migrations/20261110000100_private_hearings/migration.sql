CREATE TABLE hearing_slots (
 id UUID PRIMARY KEY, campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
 judge_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 starts_at TIMESTAMPTZ(6) NOT NULL, ends_at TIMESTAMPTZ(6) NOT NULL, cancelled_at TIMESTAMPTZ(6),
 CHECK (ends_at = starts_at + interval '30 minutes')
);
CREATE INDEX hearing_slots_campus_id_starts_at_idx ON hearing_slots(campus_id,starts_at);
CREATE INDEX hearing_slots_judge_id_starts_at_idx ON hearing_slots(judge_id,starts_at);
CREATE TABLE hearings (
 id UUID PRIMARY KEY, review_id UUID NOT NULL UNIQUE REFERENCES account_reviews(id) ON DELETE CASCADE,
 slot_id UUID UNIQUE REFERENCES hearing_slots(id) ON DELETE RESTRICT,
 judge_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','ended','cancelled')),
 floor VARCHAR(40) NOT NULL DEFAULT 'appellant', started_at TIMESTAMPTZ(6), deadline TIMESTAMPTZ(6), ended_at TIMESTAMPTZ(6),
 end_reason VARCHAR(100), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX hearings_judge_id_status_idx ON hearings(judge_id,status);
CREATE TABLE hearing_participants (
 id UUID PRIMARY KEY, hearing_id UUID NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(20) NOT NULL CHECK(role IN ('appellant','reporter')),
 label VARCHAR(40) NOT NULL, response VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK(response IN ('invited','accepted','declined','written')),
 joined_at TIMESTAMPTZ(6), last_seen_at TIMESTAMPTZ(6), UNIQUE(hearing_id,user_id)
);
CREATE INDEX hearing_participants_user_id_response_idx ON hearing_participants(user_id,response);
CREATE TABLE hearing_messages (
 id UUID PRIMARY KEY, hearing_id UUID NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
 author_id UUID REFERENCES users(id) ON DELETE SET NULL, label VARCHAR(40) NOT NULL,
 visibility VARCHAR(20) NOT NULL DEFAULT 'shared' CHECK(visibility IN ('shared','private')),
 body VARCHAR(4000) NOT NULL, attachments JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX hearing_messages_hearing_id_created_at_idx ON hearing_messages(hearing_id,created_at);
ALTER TABLE hearing_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hearing_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hearing_messages ENABLE ROW LEVEL SECURITY;
