-- =============================================================================
-- 0008_national_id_and_rebrand.sql
--  · Adds national ID to members (required in the app registration forms;
--    nullable at the DB level so existing rows are unaffected).
--  · public_join gains p_national_id.
--  · Rebrand the demo gym to "أبطال الرياضة".
-- =============================================================================

alter table public.members add column if not exists national_id text;

-- Recreate public_join with the national ID captured at sign-up.
drop function if exists public.public_join(text, text, gender_type, uuid, uuid);

create or replace function public.public_join(
  p_full_name   text,
  p_phone       text,
  p_national_id text,
  p_gender      gender_type,
  p_plan_id     uuid,
  p_branch_id   uuid
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
  select member_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then raise exception 'already_member'; end if;

  insert into public.members (gym_id, branch_id, full_name, phone, national_id, gender, user_id)
  values (v_gym, p_branch_id, p_full_name, p_phone, p_national_id, p_gender, v_uid)
  returning id into v_member;

  update public.profiles
     set member_id = v_member, gym_id = v_gym, full_name = p_full_name
   where id = v_uid;

  insert into public.subscriptions (member_id, plan_id, branch_id, status)
  values (v_member, p_plan_id, p_branch_id, 'pending');

  return v_member;
end $$;

grant execute on function
  public.public_join(text, text, text, gender_type, uuid, uuid)
to authenticated;

-- Rebrand
update public.gyms
   set name_ar = 'أبطال الرياضة', name_en = 'Sports Champions'
 where name_ar = 'نادي القوة' or name_en = 'Power Gym';
