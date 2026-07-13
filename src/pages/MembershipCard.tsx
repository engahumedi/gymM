import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '@/i18n/I18nProvider';
import { fetchMember } from '@/lib/api';
import { useBrand } from '@/lib/Brand';
import { useAsync } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import { Button } from '@/components/ui/Button';
import { InlineLoading, ErrorText } from '@/components/ui/misc';
import { ChevronRight, Printer, ICON_SM } from '@/components/ui/icons';

// Printable membership card. Top-level route (no dashboard chrome) so the print
// output is just the card. Accessible to the member (own row) and staff (scope)
// — RLS on `members` enforces who can load which id.
export function MembershipCard() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const { gym } = useBrand();
  const member = useAsync(() => fetchMember(id!), [id]);

  if (member.loading) return <InlineLoading />;
  if (member.error || !member.data) return <ErrorText error={member.error ?? 'not found'} />;

  const m = member.data;
  const gymName = gym ? localizedName(gym, locale) : t('app.name');

  return (
    <div className="min-h-screen bg-bg p-5 print:bg-white print:p-0">
      <div className="mx-auto max-w-sm">
        <div className="mb-5 flex items-center justify-between print:hidden">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ChevronRight {...ICON_SM} className="rotate-180 rtl:rotate-0" /> {t('common.back')}
          </button>
          <Button onClick={() => window.print()}><Printer {...ICON_SM} />{t('card.print')}</Button>
        </div>

        {/* The card itself — light "paper" so print is clean */}
        <div className="overflow-hidden rounded-lg border border-[#e6e2da] bg-white text-[#14171a]">
          <div className="flex items-center justify-between bg-[#0d0f12] px-6 py-4 text-[#ece7df]">
            {gym?.logo_url ? (
              <img src={gym.logo_url} alt={gymName} className="h-7 w-auto object-contain" />
            ) : (
              <span className="font-display text-lg">{gymName}</span>
            )}
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[#8b8b82]">{t('card.title')}</span>
          </div>

          <div className="flex items-center gap-5 px-6 py-6">
            <div className="shrink-0 rounded bg-white p-1.5 ring-1 ring-[#e6e2da]">
              <QRCodeSVG value={m.member_code ?? m.id} size={104} bgColor="#ffffff" fgColor="#0d0f12" level="M" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.7rem] uppercase tracking-wider text-[#8a8578]">{t('card.member')}</p>
              <p className="mt-1 truncate font-display text-xl">{m.full_name}</p>
              <p dir="ltr" className="mt-3 text-[0.7rem] uppercase tracking-wider text-[#8a8578] text-start">{t('card.code')}</p>
              <p dir="ltr" className="font-mono text-lg tracking-wider text-start">{m.member_code ?? '—'}</p>
            </div>
          </div>

          <p className="border-t border-[#e6e2da] px-6 py-3 text-xs text-[#a8a294]">{t('card.hint')}</p>
        </div>
      </div>
    </div>
  );
}
