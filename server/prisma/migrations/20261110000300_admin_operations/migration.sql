CREATE TABLE admin_measurement_config (
  id INTEGER PRIMARY KEY CHECK (id=1), started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO admin_measurement_config(id) VALUES(1);
CREATE TABLE account_activity_days (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  PRIMARY KEY(user_id,activity_date)
);
CREATE INDEX activity_campus_day ON account_activity_days(campus_id,activity_date);
CREATE TABLE admin_audit_events (
  id BIGSERIAL PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  operation VARCHAR(150) NOT NULL, target_id UUID, outcome VARCHAR(20) NOT NULL,
  status_code INTEGER NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_campus_time ON admin_audit_events(campus_id,occurred_at DESC,id DESC);
CREATE TABLE report_assignments (
  report_id UUID PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE service_budget_snapshots (
  service VARCHAR(30) PRIMARY KEY, used NUMERIC NOT NULL CHECK(used>=0),
  capacity NUMERIC NOT NULL CHECK(capacity>0), unit VARCHAR(40) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL, updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
ALTER TABLE admin_measurement_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_activity_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_budget_snapshots ENABLE ROW LEVEL SECURITY;
