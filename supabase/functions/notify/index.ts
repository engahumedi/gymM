// =============================================================================
// Edge Function: notify — the real-send abstraction for the notifications queue.
//
// In dev, `enqueue_expiry_notifications()` writes rows with status 'simulated'
// (nothing is sent). To go live: (1) change that status to 'queued', (2) deploy
// this function, (3) set NOTIFY_PROVIDER + provider secrets, (4) schedule it
// (pg_cron via pg_net, or an external cron) to run every few minutes.
//
// It reads 'queued' notifications, sends each via the configured provider, and
// marks them 'sent' or 'failed'. The provider is swappable (Twilio / Meta
// WhatsApp Business) behind a single sendMessage() function — no schema change.
//
// Deploy:  supabase functions deploy notify
// Secrets: supabase secrets set NOTIFY_PROVIDER=twilio TWILIO_ACCOUNT_SID=... \
//            TWILIO_AUTH_TOKEN=... TWILIO_FROM=whatsapp:+14155238886
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationRow {
  id: string;
  member_id: string | null;
  channel: 'in_app' | 'whatsapp' | 'sms';
  type: string;
  message_ar: string | null;
  message_en: string | null;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // Service-role key is required to update rows regardless of RLS. It is set
  // automatically in the Edge Function environment; never ship it to the client.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async () => {
  // in_app notifications are read directly by the app; only messaging channels
  // need an outbound send.
  const { data: queued, error } = await supabase
    .from('notifications')
    .select('id, member_id, channel, type, message_ar, message_en')
    .eq('status', 'queued')
    .in('channel', ['whatsapp', 'sms'])
    .limit(100);

  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const n of (queued ?? []) as NotificationRow[]) {
    try {
      await sendMessage(n);
      await supabase.from('notifications').update({ status: 'sent' }).eq('id', n.id);
      sent++;
    } catch (_e) {
      await supabase.from('notifications').update({ status: 'failed' }).eq('id', n.id);
      failed++;
    }
  }
  return json({ processed: (queued ?? []).length, sent, failed });
});

// --- provider abstraction --------------------------------------------------
async function sendMessage(n: NotificationRow): Promise<void> {
  const provider = Deno.env.get('NOTIFY_PROVIDER') ?? 'simulated';
  const to = await recipientPhone(n.member_id);
  const body = n.message_ar ?? n.message_en ?? '';
  if (!to) throw new Error('no recipient phone');

  if (provider === 'twilio') return sendViaTwilio(to, body);
  if (provider === 'meta') return sendViaMeta(to, body);
  // default: log only (parity with the dev 'simulated' behaviour)
  console.log(`[simulated] → ${to}: ${body}`);
}

async function recipientPhone(memberId: string | null): Promise<string | null> {
  if (!memberId) return null;
  const { data } = await supabase.from('members').select('phone').eq('id', memberId).single();
  return data?.phone ?? null;
}

// Twilio (WhatsApp or SMS). Set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM.
async function sendViaTwilio(to: string, body: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const from = Deno.env.get('TWILIO_FROM')!; // e.g. whatsapp:+1415... or a sender number
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`twilio ${res.status}: ${await res.text()}`);
}

// Meta WhatsApp Business Cloud API. Set META_PHONE_ID/META_TOKEN.
async function sendViaMeta(to: string, body: string): Promise<void> {
  const phoneId = Deno.env.get('META_PHONE_ID')!;
  const token = Deno.env.get('META_TOKEN')!;
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) throw new Error(`meta ${res.status}: ${await res.text()}`);
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
