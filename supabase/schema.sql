-- ============================================================
-- HCM Lite — Supabase schema (generated from live DB, Phase 10)
-- Fresh install:
--   1) Run this file in Supabase SQL editor (creates tables).
--   2) Run hcm_supabase_phase0.sql (RLS policies, RPCs, triggers note, seeds).
-- NOTE: DB triggers (e.g. "Finalized payroll run is locked", late rules)
-- were added manually in the dashboard — phase0 SQL contains their logic
-- comments. The hosted demo DB is already fully configured.
-- ============================================================

create table if not exists public.hcm_ai_logs (
  id text default gen_random_uuid(),
  user_id text,
  role text,
  kind text not null,
  prompt text,
  tool_calls text,
  response text,
  latency_ms integer,
  status text,
  created_at text default now()
);

alter table public.hcm_ai_logs add primary key (id);

create table if not exists public.hcm_announcements (
  id text default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id text,
  created_at text default now()
);

alter table public.hcm_announcements add primary key (id);

create table if not exists public.hcm_attendance (
  id text default gen_random_uuid(),
  employee_id text not null,
  date text not null,
  check_in text,
  check_out text,
  status text not null,
  source text default web,
  lat text,
  lng text,
  accuracy text,
  worked_minutes integer,
  created_at text default now()
);

alter table public.hcm_attendance add primary key (id);

create table if not exists public.hcm_attendance_corrections (
  id text default gen_random_uuid(),
  employee_id text not null,
  date text not null,
  requested_check_in text,
  requested_check_out text,
  reason text not null,
  status text default pending,
  decided_by text,
  decision_comment text,
  created_at text default now()
);

alter table public.hcm_attendance_corrections add primary key (id);

create table if not exists public.hcm_audit_logs (
  id text default gen_random_uuid(),
  actor_id text,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  before_json text,
  after_json text,
  created_at text default now()
);

alter table public.hcm_audit_logs add primary key (id);

create table if not exists public.hcm_company_settings (
  id integer default 1,
  company_name text not null,
  office_start text default 09:00:00,
  grace_minutes integer default 15,
  half_day_hours text default 5,
  weekend_days text not null,
  office_lat text,
  office_lng text,
  radius_m integer default 150,
  timezone text default Asia/Karachi,
  setup_done boolean not null default false,
  created_at text default now(),
  updated_at text default now()
);

alter table public.hcm_company_settings add primary key (id);

create table if not exists public.hcm_departments (
  id text default gen_random_uuid(),
  name text not null,
  is_active boolean default true,
  created_at text default now()
);

alter table public.hcm_departments add primary key (id);

create table if not exists public.hcm_designations (
  id text default gen_random_uuid(),
  name text not null,
  department_id text,
  created_at text default now()
);

alter table public.hcm_designations add primary key (id);

create table if not exists public.hcm_employees (
  id text default gen_random_uuid(),
  code text not null,
  full_name text not null,
  email text not null,
  phone text,
  address text,
  gender text,
  department_id text,
  designation_id text,
  join_date text not null,
  exit_date text,
  status text default active,
  basic_salary text not null,
  user_id text,
  created_at text default now(),
  updated_at text default now()
);

alter table public.hcm_employees add primary key (id);

create table if not exists public.hcm_holidays (
  id text default gen_random_uuid(),
  date text not null,
  name text not null,
  created_at text default now()
);

alter table public.hcm_holidays add primary key (id);

create table if not exists public.hcm_leave_requests (
  id text default gen_random_uuid(),
  employee_id text not null,
  leave_type_id text not null,
  start_date text not null,
  end_date text not null,
  days text not null,
  reason text,
  status text default pending,
  decided_by text,
  decision_comment text,
  created_at text default now()
);

alter table public.hcm_leave_requests add primary key (id);

create table if not exists public.hcm_leave_types (
  id text default gen_random_uuid(),
  code text not null,
  name text not null,
  yearly_quota text,
  is_paid boolean default true,
  created_at text default now()
);

alter table public.hcm_leave_types add primary key (id);

create table if not exists public.hcm_notifications (
  id text default gen_random_uuid(),
  user_id text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at text default now()
);

alter table public.hcm_notifications add primary key (id);

create table if not exists public.hcm_payroll_items (
  id text default gen_random_uuid(),
  run_id text not null,
  employee_id text not null,
  basic text not null,
  gross text not null,
  working_days integer not null,
  payable_days text not null,
  absent_days text not null default 0,
  unpaid_days text not null default 0,
  half_days text not null default 0,
  deductions text not null default 0,
  tax text not null default 0,
  net text not null,
  created_at text default now()
);

alter table public.hcm_payroll_items add primary key (id);

create table if not exists public.hcm_payroll_runs (
  id text default gen_random_uuid(),
  month text not null,
  status text default draft,
  created_by text,
  finalized_by text,
  finalized_at text,
  created_at text default now()
);

alter table public.hcm_payroll_runs add primary key (id);

create table if not exists public.hcm_profiles (
  id text not null,
  email text not null,
  full_name text not null,
  role text not null,
  employee_id text,
  is_active boolean default true,
  must_change_password boolean not null default false,
  created_at text default now()
);

alter table public.hcm_profiles add primary key (id);

