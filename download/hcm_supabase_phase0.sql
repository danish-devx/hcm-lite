-- ============================================================================
-- HCM LITE — SUPABASE PHASE-0 ADDITIONS
-- Ye script aapke existing hcm_ tables ko touch NAHI karti.
-- Sirf missing cheezein add hoti hain:
--   1) Role helper functions (RLS policies ke liye)
--   2) Auto profile trigger (auth.users -> hcm_profiles)
--   3) Leave types seed data (brief ke quotas)
--   4) Complete RLS policies (sab 16 tables)
--   5) Tamper-proof RPCs: check-in / check-out / cancel-leave / contact-update
--   6) Kuch extra indexes
-- Supabase Dashboard -> SQL Editor -> paste -> Run
-- ============================================================================

-- ============================================================================
-- SECTION 1: ROLE HELPER FUNCTIONS
-- SECURITY DEFINER isliye ke policies khud hcm_profiles par RLS recursion
-- trigger na karein. Ye functions table owner (postgres) ke through parhte
-- hain, is liye RLS loop nahi hota.
-- ============================================================================

create or replace function public.hcm_my_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.hcm_profiles where id = auth.uid()
$$;

create or replace function public.hcm_my_employee_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select employee_id from public.hcm_profiles where id = auth.uid()
$$;

create or replace function public.hcm_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role from public.hcm_profiles where id = auth.uid()) in ('admin','hr'),
  false)
$$;

-- ============================================================================
-- SECTION 2: AUTO-CREATE PROFILE TRIGGER
-- Jab Admin/HR auth user banate hain (with user_metadata), profile khud ban
-- jati hai. Role metadata se aata hai (default: employee).
-- ============================================================================

create or replace function public.hcm_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.hcm_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.hcm_handle_new_user();

-- ============================================================================
-- SECTION 3: SEED DATA — LEAVE TYPES (brief Section 3 ke mutabiq quotas)
-- ============================================================================

insert into public.hcm_leave_types (code, name, yearly_quota, is_paid) values
  ('annual', 'Annual Leave', 14,    true),
  ('sick',   'Sick Leave',   8,     true),
  ('casual', 'Casual Leave', 10,    true),
  ('unpaid', 'Unpaid Leave', null,  false)
on conflict (code) do nothing;

-- ============================================================================
-- SECTION 4: RLS POLICIES (defense-in-depth)
-- Main guard Next.js API layer par hoga, lekin ye policies zaroori hain
-- taake direct DB access par bhi scope enforce ho. service_role in sab se
-- bypass hota hai (privileged ops ke liye use hoga).
-- ============================================================================

-- ---------------------------------------------------------------- profiles
create policy "profiles_select_staff_or_self" on public.hcm_profiles
  for select to authenticated
  using (public.hcm_is_staff() or id = auth.uid());

create policy "profiles_update_admin" on public.hcm_profiles
  for update to authenticated
  using (public.hcm_my_role() = 'admin')
  with check (public.hcm_my_role() = 'admin');
-- Note: role / employee_id / is_active / must_change_password sensitive
-- changes sirf app ke service-role routes se honge.

-- --------------------------------------------------------------- employees
create policy "employees_select_staff_or_self" on public.hcm_employees
  for select to authenticated
  using (public.hcm_is_staff() or id = public.hcm_my_employee_id());

create policy "employees_insert_staff" on public.hcm_employees
  for insert to authenticated
  with check (public.hcm_is_staff());

create policy "employees_update_staff" on public.hcm_employees
  for update to authenticated
  using (public.hcm_is_staff())
  with check (public.hcm_is_staff());
-- Employee apna phone/address sirf RPC (Section 5) se update karega —
-- direct row update allowed nahi (salary tampering se bachne ke liye).

-- ------------------------------------------------------------- departments
create policy "departments_select_all" on public.hcm_departments
  for select to authenticated using (true);
create policy "departments_insert_admin" on public.hcm_departments
  for insert to authenticated with check (public.hcm_my_role() = 'admin');
create policy "departments_update_admin" on public.hcm_departments
  for update to authenticated using (public.hcm_my_role() = 'admin');
create policy "departments_delete_admin" on public.hcm_departments
  for delete to authenticated using (public.hcm_my_role() = 'admin');

-- ------------------------------------------------------------ designations
create policy "designations_select_all" on public.hcm_designations
  for select to authenticated using (true);
create policy "designations_insert_admin" on public.hcm_designations
  for insert to authenticated with check (public.hcm_my_role() = 'admin');
create policy "designations_update_admin" on public.hcm_designations
  for update to authenticated using (public.hcm_my_role() = 'admin');
create policy "designations_delete_admin" on public.hcm_designations
  for delete to authenticated using (public.hcm_my_role() = 'admin');

-- ------------------------------------------------------------- leave_types
create policy "leave_types_select_all" on public.hcm_leave_types
  for select to authenticated using (true);
create policy "leave_types_insert_admin" on public.hcm_leave_types
  for insert to authenticated with check (public.hcm_my_role() = 'admin');
create policy "leave_types_update_admin" on public.hcm_leave_types
  for update to authenticated using (public.hcm_my_role() = 'admin');
create policy "leave_types_delete_admin" on public.hcm_leave_types
  for delete to authenticated using (public.hcm_my_role() = 'admin');

-- ---------------------------------------------------------------- holidays
create policy "holidays_select_all" on public.hcm_holidays
  for select to authenticated using (true);
create policy "holidays_insert_admin" on public.hcm_holidays
  for insert to authenticated with check (public.hcm_my_role() = 'admin');
create policy "holidays_update_admin" on public.hcm_holidays
  for update to authenticated using (public.hcm_my_role() = 'admin');
create policy "holidays_delete_admin" on public.hcm_holidays
  for delete to authenticated using (public.hcm_my_role() = 'admin');

-- -------------------------------------------------------- company_settings
create policy "settings_select_all" on public.hcm_company_settings
  for select to authenticated using (true);
create policy "settings_insert_admin" on public.hcm_company_settings
  for insert to authenticated with check (public.hcm_my_role() = 'admin');
create policy "settings_update_admin" on public.hcm_company_settings
  for update to authenticated using (public.hcm_my_role() = 'admin');
-- First-run insert service_role se hoga (us waqt koi session nahi hota).

-- -------------------------------------------------------------- attendance
create policy "attendance_select_staff_or_self" on public.hcm_attendance
  for select to authenticated
  using (public.hcm_is_staff() or employee_id = public.hcm_my_employee_id());

create policy "attendance_insert_own_or_staff" on public.hcm_attendance
  for insert to authenticated
  with check (public.hcm_is_staff() or employee_id = public.hcm_my_employee_id());

create policy "attendance_update_staff" on public.hcm_attendance
  for update to authenticated
  using (public.hcm_is_staff());
-- Employee direct UPDATE nahi kar sakta (status tamper na ho) —
-- check-in/out RPC functions (Section 5) se hoga jo server time stamp karte hain.

-- -------------------------------------------------- attendance_corrections
create policy "corr_select_staff_or_self" on public.hcm_attendance_corrections
  for select to authenticated
  using (public.hcm_is_staff() or employee_id = public.hcm_my_employee_id());

create policy "corr_insert_self" on public.hcm_attendance_corrections
  for insert to authenticated
  with check (employee_id = public.hcm_my_employee_id() and status = 'pending');

create policy "corr_decide_staff" on public.hcm_attendance_corrections
  for update to authenticated
  using (public.hcm_is_staff());

-- ---------------------------------------------------------- leave_requests
create policy "leave_select_staff_or_self" on public.hcm_leave_requests
  for select to authenticated
  using (public.hcm_is_staff() or employee_id = public.hcm_my_employee_id());

create policy "leave_insert_own_or_staff" on public.hcm_leave_requests
  for insert to authenticated
  with check (
    public.hcm_is_staff()
    or (employee_id = public.hcm_my_employee_id()
        and status = 'pending'
        and decided_by is null)
  );

create policy "leave_decide_staff" on public.hcm_leave_requests
  for update to authenticated
  using (public.hcm_is_staff());
-- Employee apni pending leave sirf RPC hcm_cancel_my_leave se cancel karega.

-- ------------------------------------------------------------ payroll_runs
create policy "runs_select_staff_or_finalized" on public.hcm_payroll_runs
  for select to authenticated
  using (public.hcm_is_staff() or status = 'finalized');

create policy "runs_insert_staff" on public.hcm_payroll_runs
  for insert to authenticated
  with check (public.hcm_is_staff());

create policy "runs_update_staff" on public.hcm_payroll_runs
  for update to authenticated
  using (public.hcm_is_staff());
-- Finalize admin-only API layer par enforce hoga + DB trigger lock already hai.

-- ----------------------------------------------------------- payroll_items
create policy "items_select_staff_or_own" on public.hcm_payroll_items
  for select to authenticated
  using (public.hcm_is_staff() or employee_id = public.hcm_my_employee_id());

create policy "items_insert_staff" on public.hcm_payroll_items
  for insert to authenticated
  with check (public.hcm_is_staff());

create policy "items_update_staff" on public.hcm_payroll_items
  for update to authenticated
  using (public.hcm_is_staff());

create policy "items_delete_staff" on public.hcm_payroll_items
  for delete to authenticated
  using (public.hcm_is_staff());

-- ----------------------------------------------------------- announcements
create policy "ann_select_all" on public.hcm_announcements
  for select to authenticated using (true);

create policy "ann_insert_staff" on public.hcm_announcements
  for insert to authenticated
  with check (public.hcm_is_staff());

create policy "ann_update_admin_or_author" on public.hcm_announcements
  for update to authenticated
  using (public.hcm_my_role() = 'admin' or author_id = auth.uid());

create policy "ann_delete_admin" on public.hcm_announcements
  for delete to authenticated
  using (public.hcm_my_role() = 'admin');

-- ----------------------------------------------------------- notifications
create policy "notif_select_own" on public.hcm_notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "notif_insert_staff_or_system" on public.hcm_notifications
  for insert to authenticated
  with check (public.hcm_is_staff() or user_id = auth.uid());
-- System notifications (leave decided, payslip ready) service_role se jayengi.

create policy "notif_update_own" on public.hcm_notifications
  for update to authenticated
  using (user_id = auth.uid());

create policy "notif_delete_own" on public.hcm_notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------- audit_logs
create policy "audit_insert_authenticated" on public.hcm_ai_logs
  for insert to authenticated with check (true);

create policy "audit_select_admin" on public.hcm_audit_logs
  for select to authenticated
  using (public.hcm_my_role() = 'admin');
-- Update/Delete: aapka immutable trigger pehle hi block karta hai. ✓

-- ---------------------------------------------------------------- ai_logs
create policy "ailogs_insert_authenticated" on public.hcm_ai_logs
  for insert to authenticated with check (true);

create policy "ailogs_select_staff_or_own" on public.hcm_ai_logs
  for select to authenticated
  using (public.hcm_is_staff() or user_id = auth.uid());

-- ============================================================================
-- SECTION 5: TAMPER-PROOF RPCs
-- Server time DB ke andar stamp hota hai; employee status khud set nahi kar
-- sakta. Ye functions security definer hain, rules DB layer par hain.
-- ============================================================================

-- CHECK-IN: duplicate par exception (API isko 409 me map karegi)
create or replace function public.hcm_check_in(
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_source text default 'web'
)
returns public.hcm_attendance
language plpgsql security definer set search_path = public
as $$
declare
  v_emp uuid;
  v_tz text;
  v_settings record;
  v_local_time time;
  v_status text;
  v_today date;
  v_row public.hcm_attendance;
begin
  select employee_id into v_emp from public.hcm_profiles where id = auth.uid();
  if v_emp is null then
    raise exception 'NO_EMPLOYEE_LINK';
  end if;

  select * into v_settings from public.hcm_company_settings where id = 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Karachi');
  v_today := (now() at time zone v_tz)::date;
  v_local_time := (now() at time zone v_tz)::time;

  -- Ek record per employee per day (409)
  if exists (
    select 1 from public.hcm_attendance
     where employee_id = v_emp and date = v_today
  ) then
    raise exception 'ALREADY_CHECKED_IN';
  end if;

  -- Late rule: office_start + grace_minutes ke baad = late
  if v_local_time > (v_settings.office_start + make_interval(mins => v_settings.grace_minutes)) then
    v_status := 'late';
  else
    v_status := 'present';
  end if;

  insert into public.hcm_attendance (
    employee_id, date, check_in, status, source, lat, lng, accuracy
  ) values (
    v_emp, v_today, now(), v_status, p_source, p_lat, p_lng, p_accuracy
  )
  returning * into v_row;

  return v_row;
end $$;

-- CHECK-OUT: worked_minutes calculate + half_day rule
create or replace function public.hcm_check_out()
returns public.hcm_attendance
language plpgsql security definer set search_path = public
as $$
declare
  v_emp uuid;
  v_tz text;
  v_settings record;
  v_row public.hcm_attendance;
  v_worked int;
begin
  select employee_id into v_emp from public.hcm_profiles where id = auth.uid();
  if v_emp is null then
    raise exception 'NO_EMPLOYEE_LINK';
  end if;

  select * into v_settings from public.hcm_company_settings where id = 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Karachi');

  select * into v_row from public.hcm_attendance
   where employee_id = v_emp
     and date = (now() at time zone v_tz)::date;

  if not found then
    raise exception 'NO_CHECK_IN_TODAY';
  end if;
  if v_row.check_out is not null then
    raise exception 'ALREADY_CHECKED_OUT';
  end if;

  v_worked := greatest(0, (extract(epoch from (now() - v_row.check_in))::int) / 60);

  update public.hcm_attendance
     set check_out = now(),
         worked_minutes = v_worked,
         status = case
                    when v_worked < (v_settings.half_day_hours * 60)::int then 'half_day'
                    else status
                  end
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

-- CANCEL MY LEAVE: sirf apni pending leave
create or replace function public.hcm_cancel_my_leave(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.hcm_leave_requests
     set status = 'cancelled'
   where id = p_request_id
     and employee_id = public.hcm_my_employee_id()
     and status = 'pending';

  if not found then
    raise exception 'LEAVE_NOT_CANCELLABLE';
  end if;
end $$;

-- UPDATE MY CONTACT: employee sirf phone/address (brief F06)
create or replace function public.hcm_update_my_contact(p_phone text, p_address text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.hcm_employees
     set phone = p_phone, address = p_address, updated_at = now()
   where id = public.hcm_my_employee_id();

  if not found then
    raise exception 'NO_EMPLOYEE_LINK';
  end if;
end $$;

-- ============================================================================
-- SECTION 6: EXTRA INDEXES (FK columns par indexes Postgres khud nahi banata)
-- ============================================================================

create index if not exists idx_corr_emp_status   on public.hcm_attendance_corrections (employee_id, status);
create index if not exists idx_payroll_items_emp on public.hcm_payroll_items (employee_id);
create index if not exists idx_employees_user    on public.hcm_employees (user_id);
create index if not exists idx_designations_dept on public.hcm_designations (department_id);
create index if not exists idx_announcements_created on public.hcm_announcements (created_at desc);

-- DONE. Ab Supabase side Phase-0 complete hai.
-- Verify: Table Editor me policies dikh rahi hongi (Database -> Policies).
