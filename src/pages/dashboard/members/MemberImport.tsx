import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { createMember, type MemberInsert } from '@/lib/api';
import type { Gender } from '@/lib/database.types';
import type { MessageKey } from '@/i18n/dictionary';
import { parseCsv, exportCsv } from '@/lib/csv';
import { SAUDI_PHONE_RE, SAUDI_ID_RE, normalizeSaudiPhone } from '@/lib/phone';
import { localizedName } from '@/lib/display';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { ErrorText, PageHeader } from '@/components/ui/misc';
import { Check, AlertCircle, ICON_SM } from '@/components/ui/icons';

const COLUMNS = [
  'full_name', 'phone', 'national_id', 'gender', 'dob',
  'emergency_contact_name', 'emergency_contact_phone', 'notes',
] as const;
type Col = (typeof COLUMNS)[number];

interface ParsedRow {
  data: Record<Col, string>;
  valid: boolean;
  errorKey: MessageKey | null;
}

function normGender(v: string): Gender | null {
  const s = v.trim().toLowerCase();
  if (['male', 'm', 'ذكر'].includes(s)) return 'male';
  if (['female', 'f', 'أنثى', 'انثى'].includes(s)) return 'female';
  return null;
}

function validateRow(data: Record<Col, string>): { valid: boolean; errorKey: MessageKey | null } {
  if (!data.full_name.trim()) return { valid: false, errorKey: 'import.err.no_name' };
  const phone = normalizeSaudiPhone(data.phone);
  if (!SAUDI_PHONE_RE.test(phone)) return { valid: false, errorKey: 'err.invalid_phone' };
  if (data.national_id.trim() && !SAUDI_ID_RE.test(data.national_id.trim()))
    return { valid: false, errorKey: 'err.invalid_national_id' };
  return { valid: true, errorKey: null };
}

export function MemberImport() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const navigate = useNavigate();

  const isReception = profile?.role === 'reception';
  const [branchId, setBranchId] = useState(profile?.branch_id ?? branches[0]?.id ?? '');
  const effectiveBranch = isReception ? profile?.branch_id ?? '' : branchId;

  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  const validCount = useMemo(() => (rows ?? []).filter((r) => r.valid).length, [rows]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileErr(null);
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCsv(String(reader.result ?? ''));
        if (grid.length < 2) { setFileErr(t('import.err.empty')); setRows(null); return; }
        const header = grid[0].map((h) => h.trim().toLowerCase());
        const idx = (c: Col) => header.indexOf(c);
        if (idx('full_name') === -1 || idx('phone') === -1) {
          setFileErr(t('import.err.headers'));
          setRows(null);
          return;
        }
        const parsed: ParsedRow[] = grid.slice(1).map((cells) => {
          const data = Object.fromEntries(
            COLUMNS.map((c) => [c, idx(c) >= 0 ? (cells[idx(c)] ?? '').trim() : '']),
          ) as Record<Col, string>;
          const { valid, errorKey } = validateRow(data);
          return { data, valid, errorKey };
        });
        setRows(parsed);
      } catch {
        setFileErr(t('import.err.parse'));
        setRows(null);
      }
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    exportCsv('members-template', [
      {
        full_name: 'محمد أحمد', phone: '0501234567', national_id: '1012345678',
        gender: 'male', dob: '1995-03-20', emergency_contact_name: 'أحمد',
        emergency_contact_phone: '0559876543', notes: '',
      },
    ]);
  }

  async function runImport() {
    if (!effectiveBranch || !rows) return;
    setBusy(true);
    setResult(null);
    let ok = 0;
    let failed = 0;
    for (const r of rows) {
      if (!r.valid) { failed++; continue; }
      const payload: MemberInsert = {
        gym_id: profile!.gym_id!,
        branch_id: effectiveBranch,
        full_name: r.data.full_name.trim(),
        phone: normalizeSaudiPhone(r.data.phone),
        national_id: r.data.national_id.trim() || null,
        gender: normGender(r.data.gender),
        dob: /^\d{4}-\d{2}-\d{2}$/.test(r.data.dob.trim()) ? r.data.dob.trim() : null,
        emergency_contact_name: r.data.emergency_contact_name.trim() || null,
        emergency_contact_phone: r.data.emergency_contact_phone.trim() || null,
        notes: r.data.notes.trim() || null,
      };
      try {
        await createMember(payload);
        ok++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setResult({ ok, failed });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={t('dashboard.members')}
        title={t('import.title')}
        action={<Button variant="secondary" onClick={() => navigate('/dashboard/members')}>{t('common.back')}</Button>}
      />

      <p className="mb-6 text-sm text-muted">{t('import.desc')}</p>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        {!isReception && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted">{t('member.field.branch')}</span>
            <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto">
              {branches.map((b) => <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>)}
            </SelectInput>
          </label>
        )}
        <button className="text-sm text-accent hover:underline" onClick={downloadTemplate}>
          {t('import.template')}
        </button>
      </div>

      <label className="mb-4 flex w-full cursor-pointer items-center justify-center rounded border border-dashed border-border-strong px-4 py-8 text-sm text-muted hover:border-accent hover:text-text">
        {t('import.choose_file')}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </label>
      <ErrorText error={fileErr} />

      {rows && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted">
            {t('import.summary').replace('{total}', String(rows.length)).replace('{valid}', String(validCount))}
          </p>
          <div className="max-h-96 overflow-auto rounded border border-border">
            <table className="w-full text-start text-sm">
              <thead className="sticky top-0 border-b border-border bg-surface text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">#</th>
                  <th className="px-3 py-2 text-start font-medium">{t('member.field.name')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('member.field.phone')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-1.5 text-faint">{i + 1}</td>
                    <td className="px-3 py-1.5">{r.data.full_name || '—'}</td>
                    <td className="px-3 py-1.5" dir="ltr">{r.data.phone || '—'}</td>
                    <td className="px-3 py-1.5">
                      {r.valid ? (
                        <span className="inline-flex items-center gap-1 text-good"><Check {...ICON_SM} /></span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-accent">
                          <AlertCircle {...ICON_SM} /> {r.errorKey && t(r.errorKey)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result ? (
            <div className="mt-5 border-s-2 border-good bg-surface-2 px-3 py-3 text-sm text-text">
              {t('import.done').replace('{ok}', String(result.ok)).replace('{failed}', String(result.failed))}
              <div className="mt-3">
                <Button onClick={() => navigate('/dashboard/members')}>{t('import.go_members')}</Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3">
              <Button onClick={runImport} loading={busy} disabled={validCount === 0 || !effectiveBranch}>
                {t('import.run').replace('{n}', String(validCount))}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
