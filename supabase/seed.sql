-- =============================================================================
-- seed.sql — realistic demo data so the dashboard & analytics look alive.
-- 1 gym, 2 branches, 4 plans, trainers, site content, ~50 members with mixed
-- statuses, payments, freezes and check-in history.
--
-- Deterministic UUIDs are used for the gym / branches / plans so references are
-- easy to reason about. Members and their history are generated in a loop.
--
-- NOTE: staff/member AUTH accounts are NOT created here (they require Supabase
-- Auth). Create them from the dashboard and set profiles.role/branch_id — see
-- README. The domain data below stands alone so analytics render immediately.
-- =============================================================================

-- Clean slate (safe to re-run). Order respects FKs.
truncate table public.notifications, public.check_ins, public.freezes,
               public.payments, public.subscriptions, public.members,
               public.trainers, public.site_content, public.plans,
               public.branches, public.gyms restart identity cascade;

-- -----------------------------------------------------------------------------
-- Gym (white-label branding)
-- -----------------------------------------------------------------------------
insert into public.gyms (id, name_ar, name_en, primary_color, secondary_color, contact_email, contact_phone, social_links)
values (
  '11111111-1111-1111-1111-111111111111',
  'نادي القوة', 'Power Gym',
  '#e11d2a', '#0f172a',
  'info@powergym.sa', '+966112223344',
  '{"instagram":"https://instagram.com/powergym","twitter":"https://x.com/powergym","tiktok":"https://tiktok.com/@powergym","whatsapp":"+966500000000"}'
);

-- -----------------------------------------------------------------------------
-- Branches
-- -----------------------------------------------------------------------------
insert into public.branches (id, gym_id, name_ar, name_en, address_ar, address_en, city, phone, map_url, working_hours)
values
('22222222-2222-2222-2222-222222220001', '11111111-1111-1111-1111-111111111111',
 'فرع العليا', 'Olaya Branch', 'طريق العليا العام', 'Olaya Main Rd', 'الرياض', '+966112223301',
 'https://maps.google.com/?q=Olaya+Riyadh',
 '{"sun":{"open":"06:00","close":"23:59"},"mon":{"open":"06:00","close":"23:59"},"tue":{"open":"06:00","close":"23:59"},"wed":{"open":"06:00","close":"23:59"},"thu":{"open":"06:00","close":"23:59"},"fri":{"open":"14:00","close":"23:59"},"sat":{"open":"08:00","close":"23:59"}}'),
('22222222-2222-2222-2222-222222220002', '11111111-1111-1111-1111-111111111111',
 'فرع الملقا', 'Malqa Branch', 'حي الملقا', 'Al Malqa District', 'الرياض', '+966112223302',
 'https://maps.google.com/?q=Al+Malqa+Riyadh',
 '{"sun":{"open":"06:00","close":"23:59"},"mon":{"open":"06:00","close":"23:59"},"tue":{"open":"06:00","close":"23:59"},"wed":{"open":"06:00","close":"23:59"},"thu":{"open":"06:00","close":"23:59"},"fri":{"open":"14:00","close":"23:59"},"sat":{"open":"08:00","close":"23:59"}}');

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
insert into public.plans (id, gym_id, name_ar, name_en, description_ar, description_en, duration_months, price, freeze_allowance_days, all_branches_access, sessions_count, sort_order)
values
('33333333-3333-3333-3333-333333330001','11111111-1111-1111-1111-111111111111','اشتراك شهري','Monthly','وصول كامل لفرع واحد','Full access, single branch',1,200,7,false,null,1),
('33333333-3333-3333-3333-333333330002','11111111-1111-1111-1111-111111111111','اشتراك ربع سنوي','Quarterly','ثلاثة أشهر لفرع واحد','3 months, single branch',3,500,14,false,null,2),
('33333333-3333-3333-3333-333333330003','11111111-1111-1111-1111-111111111111','اشتراك نصف سنوي','Semi-Annual','ستة أشهر وصول لكل الفروع','6 months, all branches',6,900,30,true,null,3),
('33333333-3333-3333-3333-333333330004','11111111-1111-1111-1111-111111111111','اشتراك سنوي','Annual','سنة كاملة وصول لكل الفروع','12 months, all branches',12,1600,60,true,null,4);

-- -----------------------------------------------------------------------------
-- Trainers
-- -----------------------------------------------------------------------------
insert into public.trainers (gym_id, branch_id, name_ar, name_en, specialty_ar, specialty_en, sort_order)
values
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220001','خالد العتيبي','Khalid Al-Otaibi','كمال الأجسام','Bodybuilding',1),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220001','سارة الشمري','Sara Al-Shammari','لياقة وتخسيس','Fitness & Weight Loss',2),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220002','فهد القحطاني','Fahad Al-Qahtani','رفع أثقال','Powerlifting',3),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220002','نورة الدوسري','Noura Al-Dosari','يوغا وكارديو','Yoga & Cardio',4);

-- -----------------------------------------------------------------------------
-- Site content (public website, data-driven)
-- -----------------------------------------------------------------------------
insert into public.site_content (gym_id, key, content) values
('11111111-1111-1111-1111-111111111111','hero',
 '{"title_ar":"طوّر قوتك في نادي القوة","title_en":"Build Your Strength at Power Gym","subtitle_ar":"أحدث الأجهزة ومدربون محترفون في فرعين بالرياض","subtitle_en":"State-of-the-art equipment and pro coaches across two Riyadh branches"}'),
('11111111-1111-1111-1111-111111111111','faq',
 '{"items":[{"q_ar":"هل يمكنني تجميد اشتراكي؟","a_ar":"نعم، حسب باقة أيام التجميد في خطتك.","q_en":"Can I freeze my subscription?","a_en":"Yes, up to your plan freeze allowance."},{"q_ar":"هل يوجد وصول لكل الفروع؟","a_ar":"الخطط النصف سنوية والسنوية تتيح الوصول لكل الفروع.","q_en":"Is there all-branch access?","a_en":"Semi-annual and annual plans include all-branch access."}]}'),
('11111111-1111-1111-1111-111111111111','testimonials',
 '{"items":[{"name_ar":"عبدالله","name_en":"Abdullah","text_ar":"أفضل نادي التزمت فيه.","text_en":"Best gym I have stuck with."},{"name_ar":"ريم","name_en":"Reem","text_ar":"مدربات محترفات وأجواء رائعة.","text_en":"Professional coaches and great vibe."}]}'),
('11111111-1111-1111-1111-111111111111','facilities',
 '{"items":[{"ar":"منطقة أوزان حرة","en":"Free weights area"},{"ar":"صالة كارديو","en":"Cardio hall"},{"ar":"استوديو مجموعات","en":"Group studio"},{"ar":"ساونا","en":"Sauna"}]}');

-- -----------------------------------------------------------------------------
-- Members + subscriptions + payments + freezes + check-ins (generated)
-- -----------------------------------------------------------------------------
do $$
declare
  v_gym   uuid := '11111111-1111-1111-1111-111111111111';
  v_branch_a uuid := '22222222-2222-2222-2222-222222220001';
  v_branch_b uuid := '22222222-2222-2222-2222-222222220002';
  v_plans uuid[] := array[
    '33333333-3333-3333-3333-333333330001',
    '33333333-3333-3333-3333-333333330002',
    '33333333-3333-3333-3333-333333330003',
    '33333333-3333-3333-3333-333333330004'];
  v_dur   int[]  := array[1,3,6,12];
  v_price numeric[] := array[200,500,900,1600];
  v_freeze int[] := array[7,14,30,60];
  v_first_m text[] := array['محمد','أحمد','عبدالله','خالد','سعود','فيصل','نايف','بندر','تركي','ماجد','عمر','ياسر','سلطان','راكان','مشعل'];
  v_first_f text[] := array['نورة','سارة','ريم','مها','هند','لمى','دانة','جواهر','العنود','شهد','رنا','بشاير','وجدان','أمل','غادة'];
  v_last  text[] := array['العتيبي','القحطاني','الشمري','الدوسري','الحربي','الغامدي','الزهراني','المطيري','السبيعي','البقمي'];

  i int;
  v_member uuid;
  v_sub uuid;
  v_branch uuid;
  v_plan_idx int;
  v_plan uuid;
  v_gender gender_type;
  v_name text;
  v_status subscription_status;
  v_start date;
  v_end date;
  v_frozen int;
  v_checkins int;
  j int;
  v_hour int;
  v_receipt int := 1000;
  v_hist_start date;
  v_hist_end date;
begin
  for i in 1..50 loop
    v_branch := case when i % 2 = 0 then v_branch_a else v_branch_b end;
    v_plan_idx := 1 + (i % 4);              -- 1..4
    v_plan := v_plans[v_plan_idx];
    v_gender := case when i % 3 = 0 then 'female'::gender_type else 'male'::gender_type end;
    if v_gender = 'female' then
      v_name := v_first_f[1 + (i % array_length(v_first_f,1))] || ' ' || v_last[1 + (i % array_length(v_last,1))];
    else
      v_name := v_first_m[1 + (i % array_length(v_first_m,1))] || ' ' || v_last[1 + (i % array_length(v_last,1))];
    end if;

    -- Status distribution: 1-30 active, 31-36 expiring, 37-44 expired, 45-48 frozen, 49-50 pending
    if i <= 30 then
      v_status := 'active'; v_end := current_date + (15 + (i % 40)); v_frozen := 0;
    elsif i <= 36 then
      v_status := 'active'; v_end := current_date + (1 + (i % 6)); v_frozen := 0;     -- expiring soon
    elsif i <= 44 then
      v_status := 'expired'; v_end := current_date - (1 + (i % 30)); v_frozen := 0;
    elsif i <= 48 then
      v_status := 'frozen'; v_end := current_date + (20 + (i % 10)); v_frozen := 5;
    else
      v_status := 'pending'; v_end := null; v_frozen := 0;
    end if;

    if v_end is not null then
      v_start := v_end - (v_dur[v_plan_idx] || ' months')::interval;
    else
      v_start := null;
    end if;

    -- Member
    insert into public.members (gym_id, branch_id, full_name, phone, gender, dob,
                                emergency_contact_name, emergency_contact_phone, notes)
    values (v_gym, v_branch, v_name,
            '05' || (10000000 + i)::text,
            v_gender,
            date '1990-01-01' + ((i * 137) % 4000),
            'ولي الأمر', '05' || (19000000 + i)::text,
            null)
    returning id into v_member;

    -- Current subscription
    insert into public.subscriptions (member_id, plan_id, branch_id, status, start_date, end_date,
                                       frozen_days_used, price_paid)
    values (v_member, v_plan, v_branch, v_status, v_start, v_end, v_frozen,
            case when v_status = 'pending' then 0 else v_price[v_plan_idx] end)
    returning id into v_sub;

    -- Payment for everything except pending
    if v_status <> 'pending' then
      v_receipt := v_receipt + 1;
      insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, created_at)
      values (v_gym, v_sub, v_member, v_branch, v_price[v_plan_idx],
              case when i % 2 = 0 then 'mada'::payment_method else 'cash'::payment_method end,
              'R' || v_receipt::text,
              v_start::timestamptz + interval '10 hours');
    end if;

    -- Freeze record for frozen members
    if v_status = 'frozen' then
      insert into public.freezes (subscription_id, start_date, end_date, days)
      values (v_sub, current_date - 5, current_date, 5);
    end if;

    -- A prior (historical, renewed) subscription for the first 8 active members
    if i <= 8 then
      v_hist_end := v_start;
      v_hist_start := v_hist_end - (v_dur[v_plan_idx] || ' months')::interval;
      insert into public.subscriptions (member_id, plan_id, branch_id, status, start_date, end_date, price_paid)
      values (v_member, v_plan, v_branch, 'expired', v_hist_start, v_hist_end, v_price[v_plan_idx])
      returning id into v_sub;
      v_receipt := v_receipt + 1;
      insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, created_at)
      values (v_gym, v_sub, v_member, v_branch, v_price[v_plan_idx], 'cash', 'R' || v_receipt::text,
              v_hist_start::timestamptz + interval '10 hours');
    end if;

    -- Check-in history for active/frozen members (feeds analytics/heatmap)
    if v_status in ('active','frozen') then
      v_checkins := 3 + (i % 10);
      for j in 1..v_checkins loop
        v_hour := (array[7,8,9,10,17,18,19,20,21])[1 + (floor(random()*9))::int];
        insert into public.check_ins (member_id, branch_id, checked_in_at)
        values (v_member, v_branch,
                (current_date - (floor(random()*28))::int)::timestamptz + (v_hour || ' hours')::interval);
      end loop;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- A couple of in-app notifications so the bell isn't empty on first load.
-- -----------------------------------------------------------------------------
insert into public.notifications (gym_id, member_id, channel, type, message_ar, message_en, status)
select '11111111-1111-1111-1111-111111111111', m.id, 'in_app', 'expiring_7',
       'اشتراكك ينتهي خلال أسبوع. جدّد الآن.', 'Your subscription expires within a week. Renew now.', 'simulated'
from public.members m
join public.subscriptions s on s.member_id = m.id
where s.status = 'active' and s.end_date <= current_date + 7
limit 6;
