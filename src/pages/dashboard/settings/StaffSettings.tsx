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
import { TableWrap, Th, Td, CardList, DataCard, CardHead, CardMeta, CardRow } from '@/components/dashboard/DataTable';

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
        <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-xl text-text">{t('staff.current')}</h2>
          <Button onClick={() => setInviting(true)} className="w-full sm:w-auto">{t('staff.invite')}</Button>
        </div>
        {staff.loading ? (
          <InlineLoading />
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-border">
                <tr>
                  <Th>{t('staff.col.name')}</Th>
                  <Th>{t('staff.col.role')}</Th>
                  <Th>{t('staff.col.branch')}</Th>
                </tr>
              </thead>
              <tbody>
                {(staff.data ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border">
                    <Td className="font-medium">{m.full_name ?? '—'}</Td>
                    <Td className="text-muted">{t(`role.${m.role}` as MessageKey)}</Td>
                    <Td>
                      {m.role === 'reception' ? (
                        <SelectInput
                          value={m.branch_id ?? ''}
                          onChange={(e) => reassign(m, e.target.value)}
                          className="max-w-[12rem]"
                          aria-label={t('staff.col.branch')}
                        >
                          <option value="">{t('staff.no_branch')}</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
                          ))}
                        </SelectInput>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <CardList>
              {(staff.data ?? []).map((m) => (
                <DataCard key={m.id}>
                  <CardHead
                    title={m.full_name ?? '—'}
                    aside={<span className="text-sm text-muted">{t(`role.${m.role}` as MessageKey)}</span>}
                  />
                  {m.role === 'reception' && (
                    <CardMeta>
                      <div>
                        <dt className="mb-1.5 text-xs text-faint">{t('staff.col.branch')}</dt>
                        <dd>
                          <SelectInput
                            value={m.branch_id ?? ''}
                            onChange={(e) => reassign(m, e.target.value)}
                            aria-label={t('staff.col.branch')}
                          >
                            <option value="">{t('staff.no_branch')}</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
                            ))}
                          </SelectInput>
                        </dd>
                      </div>
                    </CardMeta>
                  )}
                </DataCard>
              ))}
            </CardList>
          </>
        )}
      </div>

      {pendingInvites.length > 0 && (
        <div>
          <h2 className="mb-4 font-display text-xl text-text">{t('staff.invites')}</h2>
          <TableWrap>
            <thead className="border-b border-border">
              <tr>
                <Th>{t('staff.col.email')}</Th>
                <Th>{t('staff.col.branch')}</Th>
                <Th>{t('staff.col.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((inv) => (
                <tr key={inv.id} className="border-b border-border align-top">
                  <Td dir="ltr" className="text-start">{inv.email}</Td>
                  <Td>{branchName(branches, inv.branch_id, locale) || '—'}</Td>
                  <Td className={isExpired(inv) ? 'text-faint' : 'text-warn'}>
                    {isExpired(inv) ? t('staff.invite.expired') : t('staff.status.pending')}
                  </Td>
                  <Td className="text-end">
                    <div className="flex flex-col items-end">
                      <CopyLink token={inv.token} email={inv.email} />
                      <button
                        className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted hover:text-accent"
                        onClick={() => revoke(inv)}
                      >
                        {t('staff.invite.revoke')}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <CardList>
            {pendingInvites.map((inv) => (
              <DataCard key={inv.id}>
                <CardHead
                  title={<span dir="ltr" className="inline-block break-all text-start">{inv.email}</span>}
                  aside={
                    <span className={`text-xs ${isExpired(inv) ? 'text-faint' : 'text-warn'}`}>
                      {isExpired(inv) ? t('staff.invite.expired') : t('staff.status.pending')}
                    </span>
                  }
                />
                <CardMeta>
                  <CardRow label={t('staff.col.branch')}>{branchName(branches, inv.branch_id, locale) || '—'}</CardRow>
                </CardMeta>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CopyLink token={inv.token} email={inv.email} block />
                  <Button variant="secondary" onClick={() => revoke(inv)}>{t('staff.invite.revoke')}</Button>
                </div>
              </DataCard>
            ))}
          </CardList>
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

// `block` renders it as a real button in the phone card; the table keeps the
// quiet text link.
function CopyLink({ token, email, block }: { token: string; email: string; block?: boolean }) {
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
  const label = copied ? t('staff.invite.copied') : t('staff.invite.copy');
  if (block) return <Button variant="secondary" onClick={copy}>{label}</Button>;
  return (
    <button
      className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 text-xs text-text hover:text-accent"
      onClick={copy}
    >
      {label}
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => {
                navigator.clipboard?.writeText(link).catch(() => {});
              }}
            >
              {t('staff.invite.copy')}
            </Button>
            <Button variant="secondary" onClick={onSaved}>{t('common.close')}</Button>
          </div>
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
