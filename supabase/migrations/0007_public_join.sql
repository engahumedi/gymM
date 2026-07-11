-- =============================================================================
-- 0007_public_join.sql — Phase 7: public "Join Now" flow
-- A newly signed-up visitor calls public_join() to create their member record
-- and a PENDING subscription in one step. SECURITY DEFINER so it can write the
-- member/subscription rows (a self-serve member cannot insert into `members`
-- under RLS); it is tightly scoped to the caller's own auth.uid().
-- =============================================================================

create or replace function public.public_join(
  p_full_name text,
  p_phone     text,
  p_gender    gender_type,
  p_plan_id   uuid,
  p_branch_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_gym      uuid;
  v_member   uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select gym_id into v_gym from public.branches where id = p_branch_id;
  if v_gym is null then raise exception 'branch_not_found'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id and gym_id = v_gym) then
    raise exception 'plan_not_found';
  end if;

  -- One member per auth user.
  select member_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then raise exception 'already_member'; end if;

  -- Phone format/uniqueness are enforced by the members table constraints;
  -- a duplicate raises members_phone_unique which the UI maps to a message.
  insert into public.members (gym_id, branch_id, full_name, phone, gender, user_id)
  values (v_gym, p_branch_id, p_full_name, p_phone, p_gender, v_uid)
  returning id into v_member;

  update public.profiles
     set member_id = v_member, gym_id = v_gym, full_name = p_full_name
   where id = v_uid;

  insert into public.subscriptions (member_id, plan_id, branch_id, status)
  values (v_member, p_plan_id, p_branch_id, 'pending');

  return v_member;
end $$;

grant execute on function
  public.public_join(text, text, gender_type, uuid, uuid)
to authenticated;
