-- Earlier releases added these fields outside the migration history.
-- Reconcile clean installs and those existing databases without dropping data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_config JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_gesture VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_photo VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ(6);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS messages_expires_at_idx ON messages(expires_at);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS disappearing_mode BOOLEAN NOT NULL DEFAULT false;
