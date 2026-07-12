-- =============================================================================
-- 0009_freeze_requests.sql — member-initiated freeze requests + staff approval
-- A member asks to pause their subscription for N days; reception approves and
-- the freeze is applied via freeze_subscription (which extends the expiry by N,
-- so the paused days are NOT lost from the member's remaining days).
-- =============================================================================

do $$ begin
  create type freeze_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.freeze_requests (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  days            int not null check (days > 0),
  note            text,
  status          freeze_request_status not null default 'pending',
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id) on delete set null
);
create index if not exists idx_freeze_req_sub on public.freeze_requests(subscription_id);
create index if not exists idx_freeze_req_branch on public.freeze_requests(branch_id);
create index if not exists idx_freeze_req_status on public.freeze_requests(status);

alter table public.freeze_requests enable row level security;

-- Reads: member sees own; reception sees its branch; super admin sees the gym.
drop policy if exists freeze_req_member_read on public.freeze_requests;
create policy freeze_req_member_read on public.freeze_requests
  for select using (member_id = public.current_member_id());

drop policy if exists freeze_req_staff_read on public.freeze_requests;
create policy freeze_req_staff_read on public.freeze_requests
  for select using (
    public.is_super_admin()
    or (public.is_reception() and branch_id = public.current_branch_id())
  );

-- Writes go through the SECURITY DEFINER RPCs below (no direct insert/update policy).

-- -----------------------------------------------------------------------------
-- request_freeze — member asks to pause their own active subscription.
-- -----------------------------------------------------------------------------
create or replace function public.request_freeze(
  p_subscription_id uuid,
  p_days int,
  p_note text default null
) returns public.freeze_requests
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  v_sub    public.subscriptions;
  v_plan   public.plans;
  v_req    public.freeze_requests;
begin
  if v_member is null then raise exception 'not_member'; end if;
  if p_days is null or p_days <= 0 then raise exception 'invalid_days'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found or v_sub.member_id <> v_member then raise exception 'forbidden'; end if;
  if v_sub.status <> 'active' then raise exception 'not_active'; end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  if v_sub.frozen_days_used + p_days > v_plan.freeze_allowance_days then
    raise exception 'freeze_cap_exceeded';
  end if;
  if exists (select 1 from public.freeze_requests where subscription_id = p_subscription_id and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into public.freeze_requests (subscription_id, member_id, branch_id, days, note)
  values (p_subscription_id, v_member, v_sub.branch_id, p_days, p_note)
  returning * into v_req;
  return v_req;
end $$;

-- -----------------------------------------------------------------------------
-- approve_freeze_request — reception/admin approves; applies the freeze.
-- -----------------------------------------------------------------------------
create or replace function public.approve_freeze_request(p_request_id uuid)
returns public.freeze_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.freeze_requests;
begin
  select * into v_req from public.freeze_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (public.is_super_admin() or (public.is_reception() and v_req.branch_id = public.current_branch_id())) then
    raise exception 'forbidden';
  end if;

  -- Applies the freeze: extends expiry by the days and marks the sub frozen
  -- (raises not_active / freeze_cap_exceeded if no longer valid).
  perform public.freeze_subscription(v_req.subscription_id, v_req.days);

  update public.freeze_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;
  return v_req;
end $$;

-- -----------------------------------------------------------------------------
-- reject_freeze_request — reception/admin declines.
-- -----------------------------------------------------------------------------
create or replace function public.reject_freeze_request(p_request_id uuid)
returns public.freeze_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.freeze_requests;
begin
  select * into v_req from public.freeze_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (public.is_super_admin() or (public.is_reception() and v_req.branch_id = public.current_branch_id())) then
    raise exception 'forbidden';
  end if;
  update public.freeze_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;
  return v_req;
end $$;

grant execute on function
  public.request_freeze(uuid, int, text),
  public.approve_freeze_request(uuid),
  public.reject_freeze_request(uuid)
to authenticated;
