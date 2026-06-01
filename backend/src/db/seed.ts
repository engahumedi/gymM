import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb, initDb } from './index';

function seedDatabase() {
  initDb();
  const db = getDb();

  // In production, skip if already seeded to preserve real data
  if (process.env.NODE_ENV === 'production') {
    const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (count > 0) {
      console.log('✅ Database already seeded, skipping...');
      return;
    }
  }

  console.log('🌱 Seeding database...');

  // Clear existing data (except settings structure)
  db.exec(`
    DELETE FROM attendance;
    DELETE FROM subscription_freezes;
    DELETE FROM subscriptions;
    DELETE FROM members;
    DELETE FROM refresh_tokens;
    DELETE FROM notifications;
    DELETE FROM users;
    DELETE FROM subscription_plans;
    DELETE FROM branches;
    UPDATE settings SET value='0' WHERE key='member_code_counter';
  `);

  // Reset sequences
  db.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
      'attendance','subscription_freezes','subscriptions','members',
      'refresh_tokens','notifications','users','subscription_plans','branches'
    );
  `);

  // ── Branches ──────────────────────────────────────────────────────────────
  const insertBranch = db.prepare(`
    INSERT INTO branches (name, address, phone, manager_name) VALUES (?, ?, ?, ?)
  `);
  const b1 = insertBranch.run('الفرع الرئيسي', 'شارع الملك فهد، الرياض', '0112345678', 'أحمد الرشيد');
  const b2 = insertBranch.run('فرع الشمال', 'حي النخيل، الرياض', '0112345679', 'خالد العمري');
  const b3 = insertBranch.run('فرع الجنوب', 'حي العزيزية، الرياض', '0112345680', 'محمد الحربي');
  const branchIds = [b1.lastInsertRowid as number, b2.lastInsertRowid as number, b3.lastInsertRowid as number];

  // ── Users ──────────────────────────────────────────────────────────────────
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, branch_id) VALUES (?, ?, ?, ?, ?)
  `);
  const adminHash = bcrypt.hashSync('Admin@123', 10);
  insertUser.run('مدير النظام', 'admin@gym.com', adminHash, 'admin', null);

  const receptionHash = bcrypt.hashSync('Receptionist@123', 10);
  const receptionists = [
    { name: 'سارة الأحمد', email: 'sara@gym.com', branchId: branchIds[0] },
    { name: 'نورة السعيد', email: 'noura@gym.com', branchId: branchIds[0] },
    { name: 'فاطمة الزهراني', email: 'fatima@gym.com', branchId: branchIds[1] },
    { name: 'هند القحطاني', email: 'hind@gym.com', branchId: branchIds[1] },
    { name: 'ريم العتيبي', email: 'reem@gym.com', branchId: branchIds[2] },
    { name: 'لمياء الشمري', email: 'lamia@gym.com', branchId: branchIds[2] },
  ];
  for (const r of receptionists) {
    insertUser.run(r.name, r.email, receptionHash, 'receptionist', r.branchId);
  }

  // ── Subscription Plans ────────────────────────────────────────────────────
  const insertPlan = db.prepare(`
    INSERT INTO subscription_plans (name, duration_days, price, description, features_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  const p1 = insertPlan.run('شهري', 30, 200, 'اشتراك شهري', JSON.stringify(['دخول غير محدود', 'استخدام الصالة الرئيسية']));
  const p2 = insertPlan.run('ربع سنوي', 90, 500, 'اشتراك ربع سنوي', JSON.stringify(['دخول غير محدود', 'استخدام الصالة الرئيسية', 'توفير 16%']));
  const p3 = insertPlan.run('نصف سنوي', 180, 900, 'اشتراك نصف سنوي', JSON.stringify(['دخول غير محدود', 'جميع المرافق', 'توفير 25%']));
  const p4 = insertPlan.run('سنوي', 365, 1600, 'اشتراك سنوي', JSON.stringify(['دخول غير محدود', 'جميع المرافق', 'جلسات إرشادية', 'توفير 33%']));
  const planIds = [
    p1.lastInsertRowid as number,
    p2.lastInsertRowid as number,
    p3.lastInsertRowid as number,
    p4.lastInsertRowid as number,
  ];
  const planDurations = [30, 90, 180, 365];
  const planPrices = [200, 500, 900, 1600];

  // ── Members ────────────────────────────────────────────────────────────────
  const generateMemberCode = db.transaction(() => {
    const row = db.prepare("SELECT value FROM settings WHERE key='member_code_counter'").get() as { value: string };
    const next = parseInt(row.value, 10) + 1;
    db.prepare("UPDATE settings SET value=? WHERE key='member_code_counter'").run(String(next));
    return `GYM-${String(next).padStart(4, '0')}`;
  });

  const insertMember = db.prepare(`
    INSERT INTO members (member_code, name_ar, name_en, phone, gender, dob, national_id, home_branch_id, join_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `);

  const memberNames = [
    { ar: 'محمد العتيبي', en: 'Mohammed Al-Otaibi', gender: 'male', dob: '1990-03-15' },
    { ar: 'عبدالله القحطاني', en: 'Abdullah Al-Qahtani', gender: 'male', dob: '1988-07-22' },
    { ar: 'سلطان الزهراني', en: 'Sultan Al-Zahrani', gender: 'male', dob: '1995-01-10' },
    { ar: 'فيصل الحربي', en: 'Faisal Al-Harbi', gender: 'male', dob: '1992-11-05' },
    { ar: 'خالد العمري', en: 'Khalid Al-Omari', gender: 'male', dob: '1985-09-30' },
    { ar: 'أحمد الشمري', en: 'Ahmed Al-Shammari', gender: 'male', dob: '1993-06-18' },
    { ar: 'سعد البقمي', en: 'Saad Al-Baqami', gender: 'male', dob: '1991-04-25' },
    { ar: 'علي الدوسري', en: 'Ali Al-Dosari', gender: 'male', dob: '1987-12-08' },
    { ar: 'عمر الغامدي', en: 'Omar Al-Ghamdi', gender: 'male', dob: '1996-08-14' },
    { ar: 'ناصر المطيري', en: 'Nasser Al-Mutairi', gender: 'male', dob: '1989-02-28' },
    { ar: 'يوسف السبيعي', en: 'Yousef Al-Subaie', gender: 'male', dob: '1994-05-17' },
    { ar: 'طارق العنزي', en: 'Tariq Al-Anzi', gender: 'male', dob: '1990-10-03' },
    { ar: 'بدر الرشيدي', en: 'Badr Al-Rashidi', gender: 'male', dob: '1986-07-09' },
    { ar: 'ماجد القرني', en: 'Majed Al-Qarni', gender: 'male', dob: '1997-03-21' },
    { ar: 'وليد الحمدان', en: 'Waleed Al-Hamdan', gender: 'male', dob: '1993-11-16' },
    { ar: 'هاني السهلي', en: 'Hani Al-Suhli', gender: 'male', dob: '1991-09-04' },
    { ar: 'راشد المالكي', en: 'Rashed Al-Maliki', gender: 'male', dob: '1988-01-27' },
    { ar: 'تركي العسيري', en: 'Turki Al-Asiri', gender: 'male', dob: '1995-06-13' },
    { ar: 'فراس الجعيد', en: 'Firas Al-Juaid', gender: 'male', dob: '1992-04-02' },
    { ar: 'زياد اليامي', en: 'Ziad Al-Yami', gender: 'male', dob: '1990-12-19' },
    { ar: 'مريم الشهري', en: 'Mariam Al-Shahri', gender: 'female', dob: '1993-08-07' },
    { ar: 'نورة السلمي', en: 'Noura Al-Salmi', gender: 'female', dob: '1990-05-11' },
    { ar: 'هند القحطاني', en: 'Hind Al-Qahtani', gender: 'female', dob: '1988-02-23' },
    { ar: 'أسماء العتيبي', en: 'Asma Al-Otaibi', gender: 'female', dob: '1995-10-30' },
    { ar: 'ريم الزهراني', en: 'Reem Al-Zahrani', gender: 'female', dob: '1991-07-14' },
    { ar: 'لمياء العمري', en: 'Lamia Al-Omari', gender: 'female', dob: '1989-03-08' },
    { ar: 'سارة الحربي', en: 'Sara Al-Harbi', gender: 'female', dob: '1994-01-25' },
    { ar: 'نجلاء الشمري', en: 'Najlaa Al-Shammari', gender: 'female', dob: '1992-09-17' },
    { ar: 'دانة البقمي', en: 'Dana Al-Baqami', gender: 'female', dob: '1996-06-03' },
    { ar: 'رنا الغامدي', en: 'Rana Al-Ghamdi', gender: 'female', dob: '1987-11-21' },
  ];

  const memberIds: number[] = [];
  const today = new Date();

  for (let i = 0; i < memberNames.length; i++) {
    const m = memberNames[i];
    const branchId = branchIds[i % 3];
    const code = generateMemberCode();
    const joinDate = new Date(today);
    joinDate.setDate(joinDate.getDate() - Math.floor(Math.random() * 300));
    const result = insertMember.run(
      code, m.ar, m.en,
      `05${Math.floor(10000000 + Math.random() * 89999999)}`,
      m.gender, m.dob,
      `${1000000000 + i}`,
      branchId,
      joinDate.toISOString().split('T')[0]
    );
    memberIds.push(result.lastInsertRowid as number);
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const insertSub = db.prepare(`
    INSERT INTO subscriptions (member_id, plan_id, branch_id, start_date, end_date, price_paid, payment_method, status, freeze_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  const subIds: number[] = [];

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  const todayStr = today.toISOString().split('T')[0];

  const subscriptionScenarios = [
    // Active subscriptions (12)
    ...Array(12).fill(null).map((_, i) => ({
      memberId: memberIds[i],
      planIdx: i % 4,
      startOffset: -Math.floor(Math.random() * 60),
      status: 'active' as const,
    })),
    // Expiring soon ≤7 days (5)
    ...Array(5).fill(null).map((_, i) => ({
      memberId: memberIds[12 + i],
      planIdx: 0,
      startOffset: -23 - i,
      status: 'active' as const,
      forceEndOffset: Math.floor(Math.random() * 7),
    })),
    // Expired (8)
    ...Array(8).fill(null).map((_, i) => ({
      memberId: memberIds[17 + i],
      planIdx: i % 2,
      startOffset: -60 - Math.floor(Math.random() * 60),
      status: 'expired' as const,
    })),
    // Frozen (3)
    ...Array(2).fill(null).map((_, i) => ({
      memberId: memberIds[25 + i],
      planIdx: 1,
      startOffset: -30,
      status: 'frozen' as const,
    })),
    // Cancelled (2)
    ...Array(2).fill(null).map((_, i) => ({
      memberId: memberIds[28 + i],
      planIdx: 0,
      startOffset: -90,
      status: 'cancelled' as const,
    })),
  ];

  const paymentMethods = ['cash', 'transfer', 'card', 'online'];

  for (const scenario of subscriptionScenarios) {
    const planIdx = scenario.planIdx;
    const planId = planIds[planIdx];
    const duration = planDurations[planIdx];
    const price = planPrices[planIdx];
    const branchId = branchIds[scenario.memberId % 3];

    const startDate = addDays(todayStr, scenario.startOffset);
    let endDate = addDays(startDate, duration - 1);

    if ('forceEndOffset' in scenario && scenario.forceEndOffset != null) {
      endDate = addDays(todayStr, scenario.forceEndOffset as number);
    }

    const createdAt = `${startDate}T10:00:00`;
    const result = insertSub.run(
      scenario.memberId, planId, branchId,
      startDate, endDate, price,
      paymentMethods[Math.floor(Math.random() * 4)],
      scenario.status, createdAt
    );
    subIds.push(result.lastInsertRowid as number);
  }

  // ── Attendance (90 days) ──────────────────────────────────────────────────
  const insertAttendance = db.prepare(`
    INSERT INTO attendance (member_id, subscription_id, branch_id, check_in_time, method)
    VALUES (?, ?, ?, ?, 'manual')
  `);

  // Only use active/expiring members for attendance
  const activeMembers = memberIds.slice(0, 17);

  for (let day = 89; day >= 0; day--) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split('T')[0];

    const numCheckins = 5 + Math.floor(Math.random() * 11);
    const shuffled = [...activeMembers].sort(() => Math.random() - 0.5);
    const checkInMembers = shuffled.slice(0, numCheckins);

    for (const memberId of checkInMembers) {
      const hour = 6 + Math.floor(Math.random() * 14);
      const minute = Math.floor(Math.random() * 60);
      const checkInTime = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
      const branchId = branchIds[Math.floor(Math.random() * 3)];
      const subIndex = memberIds.indexOf(memberId);
      const subId = subIndex < subIds.length ? subIds[subIndex] : null;

      insertAttendance.run(memberId, subId, branchId, checkInTime);
    }
  }

  // ── Notifications (sample) ────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO notifications (type, title, message, branch_id, is_read)
    VALUES ('system', 'مرحباً بك', 'تم تشغيل النظام بنجاح', NULL, 0)
  `).run();

  console.log('✅ Database seeded successfully!');
  console.log('  Admin: admin@gym.com / Admin@123');
  console.log('  3 branches, 6 receptionists, 30 members');
  console.log('  4 plans, ~30 subscriptions, 90 days attendance');
}

seedDatabase();
