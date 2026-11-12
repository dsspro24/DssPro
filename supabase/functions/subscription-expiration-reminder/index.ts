import { createClient } from 'npm:@supabase/supabase-js@2';

type ReminderRow = {
  subscription_id: string;
  organization_id: string;
  organization_name: string;
  ends_at: string;
  manager_name: string;
  manager_email: string;
};

const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });

  const cronSecret = Deno.env.get('SUBSCRIPTION_REMINDER_CRON_SECRET');
  const authorization = request.headers.get('Authorization');
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return response(401, { error: 'Unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const senderEmail = Deno.env.get('RESEND_FROM_EMAIL');
  if (!supabaseUrl || !serviceKey || !resendApiKey || !senderEmail) {
    return response(500, { error: 'Subscription reminder email configuration is incomplete' });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: reminders, error: claimError } = await adminClient.rpc('claim_subscription_expiration_reminders');
  if (claimError) return response(500, { error: `Could not claim subscription reminders: ${claimError.message}` });

  const remindersBySubscription = new Map<string, ReminderRow[]>();
  for (const reminder of (reminders ?? []) as ReminderRow[]) {
    const subscriptionReminders = remindersBySubscription.get(reminder.subscription_id) ?? [];
    subscriptionReminders.push(reminder);
    remindersBySubscription.set(reminder.subscription_id, subscriptionReminders);
  }

  const failures: string[] = [];
  let sentCount = 0;
  for (const [subscriptionId, subscriptionReminders] of remindersBySubscription) {
    const firstReminder = subscriptionReminders[0];
    const endDate = new Date(firstReminder.ends_at);
    const formattedEndDate = new Intl.DateTimeFormat('lt-LT', {
      dateStyle: 'long',
      timeZone: 'Europe/Vilnius',
    }).format(endDate);
    const organizationName = firstReminder.organization_name;
    const subject = `Priminimas: „${organizationName}“ prenumerata baigsis po 3 dienų`;
    const html = `<p>Sveiki, ${escapeHtml(firstReminder.manager_name || 'įmonės vadove')},</p>
      <p>Primename, kad įmonės <strong>${escapeHtml(organizationName)}</strong> DSS Pro prenumerata baigsis <strong>${escapeHtml(formattedEndDate)}</strong>, maždaug po 3 dienų.</p>
      <p>Jei norite toliau naudotis visomis sistemos funkcijomis, prisijunkite prie DSS Pro ir atnaujinkite prenumeratą.</p>
      <p><a href="https://www.dsspro.lt/">Prisijungti prie DSS Pro</a></p>
      <p>Pasibaigus prenumeratai darbo sritis pereis į peržiūros režimą.</p>
      <p>DSS Pro komanda</p>`;
    const text = `Sveiki, ${firstReminder.manager_name || 'įmonės vadove'},\n\n`
      + `Primename, kad įmonės „${organizationName}“ DSS Pro prenumerata baigsis ${formattedEndDate}, maždaug po 3 dienų.\n\n`
      + 'Jei norite toliau naudotis visomis sistemos funkcijomis, prisijunkite prie DSS Pro ir atnaujinkite prenumeratą: https://www.dsspro.lt/\n\n'
      + 'Pasibaigus prenumeratai darbo sritis pereis į peržiūros režimą.\n\nDSS Pro komanda';

    let subscriptionFailed = false;
    for (const reminder of subscriptionReminders) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `subscription-expiration-${subscriptionId}-${endDate.toISOString()}-${reminder.manager_email.toLowerCase()}`,
          },
          body: JSON.stringify({
            from: senderEmail,
            to: [reminder.manager_email],
            subject,
            html,
            text,
          }),
        });
        if (!resendResponse.ok) {
          const errorBody = await resendResponse.text();
          subscriptionFailed = true;
          failures.push(`${subscriptionId} (${reminder.manager_email}): Resend returned ${resendResponse.status}: ${errorBody}`);
        } else {
          sentCount += 1;
        }
      } catch (error) {
        subscriptionFailed = true;
        failures.push(`${subscriptionId} (${reminder.manager_email}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const { error: finishError } = await adminClient.rpc('finish_subscription_expiration_reminder', {
      input_subscription_id: subscriptionId,
      input_sent: !subscriptionFailed,
    });
    if (finishError) failures.push(`${subscriptionId}: could not update reminder status: ${finishError.message}`);
  }

  if (failures.length) {
    console.error('Subscription reminder failures', failures);
    return response(500, { sent: sentCount, failures });
  }
  return response(200, { sent: sentCount, subscriptions: remindersBySubscription.size });
});
