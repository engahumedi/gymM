import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { useAuth } from '@/auth/AuthProvider';
import { useAsync } from '@/lib/useAsync';
import {
  fetchStaff,
  fetchStaffInvites,
  createStaffInvite,
  deleteStaffInvite,
  updateStaffBranch,
  type StaffMember,
} from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import type { Branch, StaffInvite } from '@/lib/database.types';
import type { MessageKey } from '@/i18n/dictionary';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { ErrorText, InlineLoading } from '@/components/ui/misc';

function branchName(branches: Branch[], id: string | null, locale: 'ar' | 'en'): string {
  const b = branches.find((x) => x.id === id);
  return b ? localizedName(b, locale) : '';
}

// The token is the invite's only proof of ownership (email alone proves nothing
// with autoconfirm on), so it travels in the link and must reach the invitee.
function staffSignupLink(token: string, email: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/staff-signup?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function isExpired(invite: StaffInvite): boolean {
  return Date.parse(invite.expires_at) < Date.now();
}

export function StaffSettings() {
  const { t, locale } = useI18n();
  const { branches } = useReferenceData();
  const { profile } = useAuth();
  const staff = useAsync(fetchStaff, []);
  const invites = useAsync(fetchStaffInvites, []);
  const [inviting, setInviting] = useState(false);

  const pendingInvites = (invites.data ?? []).filter((i) => i.status === 'pending');

  async function reassign(m: StaffMember, branchId: string) {
    try {
      await updateStaffBranch(m.id, branchId || null);
      staff.reload();
    } catch {
      /* surfaced on next load */
    }
  }

  async function revoke(inv: StaffInvite) {
    await deleteStaffInvite(inv.id);
    invites.reload();
  }

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-text">{t('staff.current')}</h2>
          <Button onClick={() => setInviting(true)}>{t('staff.invite')}</Button>
        </div>
        {staff.loading ? (
          <InlineLoading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.name')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.role')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.branch')}</th>
                </tr>
              </thead>
              <tbody>
                {(staff.data ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border">
                    <td className="px-3 py-2 font-medium">{m.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{t(`role.${m.role}` as MessageKey)}</td>
                    <td className="px-3 py-2">
                      {m.role === 'reception' ? (
                        <SelectInput
                          value={m.branch_id ?? ''}
                          onChange={(e) => reassign(m, e.target.value)}
                          className="max-w-[12rem]"
                        >
                          <option value="">{t('staff.no_branch')}</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
                          ))}
                        </SelectInput>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingInvites.length > 0 && (
        <div>
          <h2 className="mb-4 font-display text-xl text-text">{t('staff.invites')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.email')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.branch')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('staff.col.status')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => (
                  <tr key={inv.id} className="border-b border-border align-top">
                    <td className="px-3 py-2" dir="ltr">{inv.email}</td>
                    <td className="px-3 py-2">{branchName(branches, inv.branch_id, locale) || '—'}</td>
                    <td className={`px-3 py-2 ${isExpired(inv) ? 'text-faint' : 'text-warn'}`}>
                      {isExpired(inv) ? t('staff.invite.expired') : t('staff.status.pending')}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <div className="flex flex-col items-end gap-1.5">
                        <CopyLink token={inv.token} email={inv.email} />
                        <button className="text-xs text-muted hover:text-accent" onClick={() => revoke(inv)}>
                          {t('staff.invite.revoke')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inviting && (
        <InviteModal
          gymId={profile!.gym_id!}
          branches={branches}
          onClose={() => setInviting(false)}
          onSaved={() => {
            setInviting(false);
            invites.reload();
          }}
        />
      )}
    </div>
  );
}

function CopyLink({ token, email }: { token: string; email: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(staffSignupLink(token, email));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button className="text-xs text-text hover:text-accent" onClick={copy}>
      {copied ? t('staff.invite.copied') : t('staff.invite.copy')}
    </button>
  );
}

function InviteModal({
  gymId,
  branches,
  onClose,
  onSaved,
}: {
  gymId: string;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const [f, setF] = useState({ email: '', full_name: '', branch_id: branches[0]?.id ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) {
      setError(t('err.email_required'));
      return;
    }
    setBusy(true);
    try {
      const invite = await createStaffInvite({
        gym_id: gymId,
        email: f.email.trim().toLowerCase(),
        full_name: f.full_name.trim() || null,
        branch_id: f.branch_id || null,
      });
      setLink(staffSignupLink(invite.token, invite.email));
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={link ? onSaved : onClose} title={t('staff.invite.title')}>
      {link ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('staff.invite.link')}</p>
          <TextInput dir="ltr" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-xs text-faint">{t('staff.invite.expires')}</p>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(link).catch(() => {});
            }}
          >
            {t('staff.invite.copy')}
          </Button>
          <Button variant="secondary" onClick={onSaved}>{t('common.close')}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t('staff.invite.email')} required>
            <TextInput dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={t('staff.invite.name')}>
            <TextInput value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          </Field>
          <Field label={t('staff.invite.branch')} required>
            <SelectInput value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
              ))}
            </SelectInput>
          </Field>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button onClick={submit} loading={busy}>{t('staff.invite.create')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
