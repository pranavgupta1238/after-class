ALTER TABLE moderation_actions ADD COLUMN public_summary VARCHAR(1000), ADD COLUMN policy VARCHAR(100), ADD COLUMN evidence JSONB, ADD COLUMN lifted_at TIMESTAMPTZ(6);
CREATE TABLE account_reviews (
 id UUID PRIMARY KEY, action_id UUID NOT NULL UNIQUE REFERENCES moderation_actions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
 status VARCHAR(30) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','in_review','awaiting_user','resolved')),
 outcome VARCHAR(30) CHECK(outcome IN ('restored','reduced','upheld')),
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMPTZ(6), reopened_at TIMESTAMPTZ(6)
);
CREATE INDEX account_reviews_user_id_created_at_idx ON account_reviews(user_id,created_at);
CREATE INDEX account_reviews_status_created_at_idx ON account_reviews(status,created_at);
CREATE TABLE review_entries (
 id UUID PRIMARY KEY, review_id UUID NOT NULL REFERENCES account_reviews(id) ON DELETE CASCADE ON UPDATE CASCADE,
 kind VARCHAR(30) NOT NULL CHECK(kind IN ('submitted','assigned','evidence','question','decision','reopened')),
 body VARCHAR(4000) NOT NULL, attachments JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX review_entries_review_id_created_at_idx ON review_entries(review_id,created_at);
ALTER TABLE account_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_entries ENABLE ROW LEVEL SECURITY;
