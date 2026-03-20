-- VårdKö Initial Migration
-- Creates all core tables, RLS policies, and indexes

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  address TEXT,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Stockholm',
  default_language VARCHAR(10) NOT NULL DEFAULT 'sv',
  settings JSONB NOT NULL DEFAULT '{}',
  qr_code_secret VARCHAR(64) NOT NULL,
  daily_salt VARCHAR(64) NOT NULL,
  daily_salt_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinics_org_slug_unique UNIQUE (organization_id, slug)
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  clinic_id UUID REFERENCES clinics(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'sv',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_org_unique UNIQUE (organization_id, email)
);

CREATE TABLE superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  name VARCHAR(100) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'closed',
  current_staff_id UUID REFERENCES users(id),
  current_ticket_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE queue_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  ticket_number INTEGER NOT NULL,
  anonymous_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  priority INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  assigned_room_id UUID REFERENCES rooms(id),
  session_token VARCHAR(128) NOT NULL UNIQUE,
  estimated_wait_minutes INTEGER,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  language VARCHAR(10) NOT NULL DEFAULT 'sv',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT queue_tickets_clinic_day_ticket UNIQUE (clinic_id, ticket_number)
);

CREATE TABLE queue_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  date DATE NOT NULL,
  hour_slot INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  total_patients INTEGER NOT NULL DEFAULT 0,
  avg_service_time_seconds INTEGER,
  median_service_time_seconds INTEGER,
  p90_service_time_seconds INTEGER,
  avg_wait_time_seconds INTEGER,
  max_wait_time_seconds INTEGER,
  rooms_available INTEGER,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  postpone_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT queue_statistics_clinic_date_hour UNIQUE (clinic_id, date, hour_slot)
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  clinic_id UUID,
  actor_type VARCHAR(20) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_hash VARCHAR(64),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE superadmin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES superadmins(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_hash VARCHAR(64),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK for rooms.current_ticket_id (deferred because queue_tickets didn't exist yet)
ALTER TABLE rooms ADD CONSTRAINT rooms_current_ticket_fk
  FOREIGN KEY (current_ticket_id) REFERENCES queue_tickets(id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX audit_log_timestamp_idx ON audit_log (timestamp);
CREATE INDEX audit_log_clinic_action_idx ON audit_log (clinic_id, action);
CREATE INDEX queue_tickets_clinic_status_idx ON queue_tickets (clinic_id, status);
CREATE INDEX queue_tickets_session_token_idx ON queue_tickets (session_token);
CREATE INDEX queue_statistics_clinic_date_idx ON queue_statistics (clinic_id, date);
CREATE INDEX clinics_org_id_idx ON clinics (organization_id);
CREATE INDEX users_org_id_idx ON users (organization_id);
CREATE INDEX users_clinic_id_idx ON users (clinic_id);
CREATE INDEX rooms_clinic_id_idx ON rooms (clinic_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Clinic isolation
CREATE POLICY tenant_isolation_clinics ON clinics
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- User isolation (org-level)
CREATE POLICY tenant_isolation_users ON users
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- Room isolation (org + clinic)
CREATE POLICY tenant_isolation_rooms ON rooms
  USING (
    organization_id = current_setting('app.current_organization_id', true)::uuid
    AND clinic_id = current_setting('app.current_clinic_id', true)::uuid
  );

-- Queue ticket isolation
CREATE POLICY tenant_isolation_queue_tickets ON queue_tickets
  USING (
    organization_id = current_setting('app.current_organization_id', true)::uuid
    AND clinic_id = current_setting('app.current_clinic_id', true)::uuid
  );

-- Statistics isolation
CREATE POLICY tenant_isolation_queue_statistics ON queue_statistics
  USING (
    organization_id = current_setting('app.current_organization_id', true)::uuid
    AND clinic_id = current_setting('app.current_clinic_id', true)::uuid
  );

-- Audit log isolation
CREATE POLICY tenant_isolation_audit_log ON audit_log
  USING (
    organization_id = current_setting('app.current_organization_id', true)::uuid
    AND clinic_id = current_setting('app.current_clinic_id', true)::uuid
  );

-- ============================================================
-- HELPER FUNCTION for updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER clinics_updated_at BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER queue_tickets_updated_at BEFORE UPDATE ON queue_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
