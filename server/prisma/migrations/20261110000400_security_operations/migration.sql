CREATE TABLE staff_access (
 email text PRIMARY KEY, role text NOT NULL CHECK (role IN ('super_admin','moderator')),
 revoked_at timestamptz, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff_authenticators (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secret text NOT NULL, confirmed boolean NOT NULL DEFAULT false,
 expires_at timestamptz, last_step bigint NOT NULL DEFAULT -1,
 recovery_hashes jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1
);
CREATE TABLE staff_auth_attempts (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, attempts integer NOT NULL, window_start timestamptz NOT NULL);
CREATE TABLE operational_alerts (
 id bigserial PRIMARY KEY, alert_key text NOT NULL UNIQUE, severity text NOT NULL,
 summary text NOT NULL, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz, acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL, acknowledged_at timestamptz
);
CREATE TABLE service_observations (
 id bigserial PRIMARY KEY, observed_at timestamptz NOT NULL DEFAULT now(), instance_id text NOT NULL,
 database_ms integer NOT NULL, cache_ok boolean NOT NULL, requests integer NOT NULL, errors integer NOT NULL
);
CREATE INDEX service_observations_time ON service_observations(observed_at);
CREATE TABLE campus_pilot_tasks (
 campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE, task_key text NOT NULL,
 completed boolean NOT NULL DEFAULT false, note text NOT NULL DEFAULT '', updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(campus_id,task_key)
);
ALTER TABLE staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_authenticators ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_pilot_tasks ENABLE ROW LEVEL SECURITY;
