-- =============================================================================
-- 0005_checkin_payment_functions.sql — Phase 4: check-in + manual payments
-- RPCs are SECURITY INVOKER so RLS still scopes every write to the caller's
-- branch. Business rules (block expired/frozen, decrement sessions) live here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- record_check_in — validate the member's current subscription and log a visit.
-- Raises a coded exception when check-in must be blocked so the UI can show a
-- clear reason and a "Renew" shortcut:
--   checkin_no_subscription | checkin_pending | checkin_frozen
--   checkin_expired | checkin_no_sessions
-- -----------------------------------------------------------------------------
create or replace function public.record_check_in(
  p_member_id uuid,
  p_branch_id uuid
) returns public.check_ins
language plpgsql security invoker as $$
declare
  v_sub    public.subscriptions;
  v_today  date := public.riyadh_today();
  v_check  public.check_ins;
begin
  -- Best candidate subscription: prefer active, then frozen/pending, else latest.
  select * into v_sub
    from public.subscriptions
   where member_id = p_member_id
   order by (case status
              when 'active' then 0 when 'frozen' then 1 when 'pending' then 2
              when 'expired' then 3 else 4 end),
            end_date desc nulls last
   limit 1;

  if not found then raise exception 'checkin_no_subscription'; end if;
  if v_sub.status = 'pending' then raise exception 'checkin_pending'; end if;
  if v_sub.status = 'frozen'  then raise exception 'checkin_frozen'; end if;
  if v_sub.status in ('expired','cancelled')
     or (v_sub.end_date is not null and v_sub.end_date < v_today) then
    raise exception 'checkin_expired';
  end if;
  if v_sub.sessions_remaining is not null and v_sub.sessions_remaining <= 0 then
    raise exception 'checkin_no_sessions';
  end if;

  insert into public.check_ins (member_id, branch_id, subscription_id, recorded_by)
  values (p_member_id, p_branch_id, v_sub.id, auth.uid())
  returning * into v_check;

  -- Consume a session for sessions-based plans.
  if v_sub.sessions_remaining is not null then
    update public.subscriptions
       set sessions_remaining = sessions_remaining - 1
     where id = v_sub.id;
  end if;

  return v_check;
end $$;

-- -----------------------------------------------------------------------------
-- record_payment — standalone manual payment (cash/mada/…) linked to a member
-- and optionally a subscription. gym_id/branch_id are derived from the member.
-- -----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_member_id uuid,
  p_subscription_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_receipt text default null
) returns public.payments
language plpgsql security invoker as $$
declare
  v_member public.members;
  v_pay    public.payments;
begin
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount'; end if;
  select * into v_member from public.members where id = p_member_id;
  if not found then raise exception 'member_not_found'; end if;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_member.gym_id, p_subscription_id, p_member_id, v_member.branch_id, p_amount, p_method, p_receipt, auth.uid())
  returning * into v_pay;

  return v_pay;
end $$;

grant execute on function
  public.record_check_in(uuid, uuid),
  public.record_payment(uuid, uuid, numeric, payment_method, text)
to authenticated;
