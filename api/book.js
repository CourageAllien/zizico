// Vercel Serverless Function for booking API
// This file handles POST /api/book

const { Resend } = require('resend');

// ── Config ──────────────────────────────────────────────────
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'couragealison1@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Akobs <onboarding@resend.dev>';

let resendClient = null;
let anthropicClient = null;

function getResend() {
  if (!resendClient && RESEND_KEY && !RESEND_KEY.startsWith('re_xx')) {
    resendClient = new Resend(RESEND_KEY);
  }
  return resendClient;
}

function getAnthropic() {
  if (!anthropicClient && ANTHROPIC_KEY && !ANTHROPIC_KEY.startsWith('sk-ant-xx')) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      anthropicClient = new Anthropic({ apiKey: ANTHROPIC_KEY });
    } catch (err) {
      console.error('Failed to init Anthropic SDK:', err.message);
    }
  }
  return anthropicClient;
}

// ── Main Handler ────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      firstName, lastName, email, phone,
      company, role, industry, dealSize,
      whatYouSell, prospect,
      date, time, timezone
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !company || !role || !whatYouSell || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const booking = {
      firstName, lastName, email, phone,
      company, role, industry, dealSize,
      whatYouSell, prospect,
      date, time, timezone,
      bookedAt: new Date().toISOString()
    };

    const meetingDate = parseMeetingDateTime(date, time, timezone);

    console.log(`\n✅ New booking from ${firstName} ${lastName} (${company})`);
    console.log(`   Email: ${email}`);
    console.log(`   Meeting: ${meetingDate.toLocaleString()}`);

    // 1. Send confirmation emails (immediate)
    await Promise.all([
      sendBookerConfirmation(booking, meetingDate),
      sendTeamNotification(booking, meetingDate)
    ]);

    // 2. Generate & send personalized welcome email (don't block response)
    generateAndSendWelcomeEmail(booking).catch(err => {
      console.error('Error sending welcome email:', err.message);
    });

    // 3. Send pre-call emails immediately in serverless (no cron/schedule available)
    //    In production, use a queue service or Vercel Cron Jobs
    triggerPreCallEmails(booking, meetingDate);

    res.status(200).json({ success: true, message: 'Booking confirmed!' });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Failed to process booking. Please try again.' });
  }
};


// ═══════════════════════════════════════════════════════════════
// EMAIL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function sendBookerConfirmation(booking, meetingDate) {
  const client = getResend();
  if (!client) { console.log('   ⚠️  Resend not configured — skipping booker confirmation'); return; }

  const dateStr = meetingDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const timeStr = booking.time;

  try {
    await client.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `You're booked! Discovery call with Akobs — ${dateStr}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0a0a1e, #16163a); padding: 40px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px;">You're booked, ${booking.firstName}!</h1>
            <p style="color: rgba(255,255,255,0.65); font-size: 15px; margin: 0;">Your 15-minute discovery call is confirmed.</p>
          </div>
          <div style="padding: 32px;">
            <div style="background: #f8f7ff; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <table style="width: 100%; font-size: 14px; color: #333;">
                <tr><td style="padding: 6px 0; color: #888; width: 100px;">Date</td><td style="padding: 6px 0; font-weight: 600;">${dateStr}</td></tr>
                <tr><td style="padding: 6px 0; color: #888;">Time</td><td style="padding: 6px 0; font-weight: 600;">${timeStr}</td></tr>
                <tr><td style="padding: 6px 0; color: #888;">Duration</td><td style="padding: 6px 0; font-weight: 600;">15 minutes</td></tr>
              </table>
            </div>
            <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 12px;">What to expect:</h2>
            <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 16px;">
              This is a real conversation — not a sales pitch. We'll talk about your sales process,
              your prospects, and whether personalized microsites, lead magnets, and demos make sense
              for the way you sell.
            </p>
            <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 16px;">
              <strong style="color: #6c5ce7;">Keep an eye on your inbox.</strong> Before our call, we'll send you
              personalized examples showing exactly how Akobs could help ${booking.company} close more deals.
            </p>
            <p style="font-size: 14px; color: #888; margin: 24px 0 0;">— The Akobs Team</p>
          </div>
          <div style="padding: 20px 32px; background: #fafafe; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">&copy; 2026 Akobs · Personalized Outreach, Built for You</p>
          </div>
        </div>
      `
    });
    console.log(`   📧 Confirmation sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Failed to send confirmation:`, err.message);
  }
}

async function sendTeamNotification(booking, meetingDate) {
  const client = getResend();
  if (!client) { console.log('   ⚠️  Resend not configured — skipping team notification'); return; }

  const dateStr = meetingDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  try {
    await client.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      subject: `🔔 New Booking: ${booking.firstName} ${booking.lastName} from ${booking.company}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0a0a1e, #16163a); padding: 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; font-size: 22px; margin: 0;">🎉 New Discovery Call Booked!</h1>
          </div>
          <div style="padding: 32px; background: #fff;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888; width: 140px;">Name</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${booking.firstName} ${booking.lastName}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Email</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;"><a href="mailto:${booking.email}" style="color: #6c5ce7;">${booking.email}</a></td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Phone</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.phone || 'Not provided'}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Company</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${booking.company}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Role</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.role}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Industry</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.industry || 'Not specified'}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Deal Size</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.dealSize || 'Not specified'}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">What they sell</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.whatYouSell}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Named Prospect</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.prospect || 'Not provided'}</td></tr>
              <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Call Date</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${dateStr} at ${booking.time}</td></tr>
              <tr><td style="padding: 10px 0; color: #888;">Timezone</td><td style="padding: 10px 0;">${booking.timezone}</td></tr>
            </table>
          </div>
        </div>
      `
    });
    console.log(`   📧 Team notification sent to ${NOTIFICATION_EMAIL}`);
  } catch (err) {
    console.error(`   ❌ Failed to send team notification:`, err.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// CLAUDE-POWERED PERSONALIZED EMAILS
// ═══════════════════════════════════════════════════════════════

async function generateAndSendWelcomeEmail(booking) {
  const ai = getAnthropic();
  const emailClient = getResend();
  if (!ai || !emailClient) { console.log('   ⚠️  APIs not configured — skipping welcome email'); return; }

  console.log(`\n🤖 Generating personalized welcome email for ${booking.firstName}...`);

  const prompt = `You are a persuasive, conversational sales copywriter for Akobs — a service that builds personalized microsites, lead magnets, and tailored demos for sales teams who sell high-value deals.

A prospect just booked a discovery call. Here's what we know about them:

- Name: ${booking.firstName} ${booking.lastName}
- Company: ${booking.company}
- Role: ${booking.role}
- Industry: ${booking.industry || 'Unknown'}
- What they sell: ${booking.whatYouSell}
- Typical deal size: ${booking.dealSize || 'Unknown'}
- Named prospect they're working: ${booking.prospect || 'None provided'}

Write a personalized HTML email body (just the inner content, no <html>/<body> tags) that:

1. Greets them by first name
2. Acknowledges what they do and who they sell to (be specific to their business)
3. Explains with concrete, specific examples how each of our 3 deliverables could help THEIR business:
   - **Personalized Microsites**: A branded web page built for one prospect.
   - **Custom Lead Magnets**: A report, audit, or guide built for one company.
   - **Tailored Demos**: A pre-configured walkthrough with the prospect's name, data, and use case.
4. Builds excitement for the upcoming call
5. Signs off as "The Akobs Team"

Style: Use inline CSS, #6c5ce7 accent color, #1a1a2e dark text. Professional but warm. 300-500 words. No subject line.`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    await emailClient.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `${booking.firstName}, here's how Akobs can help ${booking.company} close more deals`,
      html: wrapEmailTemplate(response.content[0].text)
    });

    console.log(`   📧 Personalized welcome email sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Welcome email error:`, err.message);
  }
}

async function generateAndSendExamplesEmail(booking) {
  const ai = getAnthropic();
  const emailClient = getResend();
  if (!ai || !emailClient) { console.log('   ⚠️  APIs not configured — skipping examples email'); return; }

  console.log(`\n🤖 Generating examples email for ${booking.firstName} (1hr before call)...`);

  const prompt = `You are a persuasive sales copywriter for Akobs — a service that builds personalized microsites, lead magnets, and tailored demos for high-value sales teams.

A prospect has a discovery call in 1 hour. Here's what we know:

- Name: ${booking.firstName} ${booking.lastName}
- Company: ${booking.company}
- Role: ${booking.role}
- Industry: ${booking.industry || 'Unknown'}
- What they sell: ${booking.whatYouSell}
- Typical deal size: ${booking.dealSize || 'Unknown'}
- Named prospect: ${booking.prospect || 'None provided'}

Write a personalized HTML email body that:
1. Reminds them the call is in 1 hour
2. Provides 2 specific examples for each: Microsites, Lead Magnets, Tailored Demos (6 total)
3. Each example: specific title, 2-3 sentence description, who it targets
4. Signs off as "The Akobs Team"

Style: Use inline CSS, cards with #f8f7ff backgrounds, #6c5ce7 accent. No subject line.`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    await emailClient.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `Your call is in 1 hour — here are 6 examples we'd build for ${booking.company}`,
      html: wrapEmailTemplate(response.content[0].text)
    });

    console.log(`   📧 Examples email sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Examples email error:`, err.message);
  }
}

async function generateAndSendProspectEmail(booking) {
  const ai = getAnthropic();
  const emailClient = getResend();
  if (!ai || !emailClient) { console.log('   ⚠️  APIs not configured — skipping prospect email'); return; }

  console.log(`\n🤖 Generating prospect-specific email for ${booking.firstName} (10min before call)...`);

  const prompt = `You are a persuasive sales copywriter and researcher for Akobs — a service that builds personalized microsites, lead magnets, and tailored demos for high-value sales teams.

A prospect has a discovery call in 10 minutes. Here's what we know:

- Name: ${booking.firstName} ${booking.lastName}
- Company: ${booking.company}
- Role: ${booking.role}
- Industry: ${booking.industry || 'Unknown'}
- What they sell: ${booking.whatYouSell}
- Named prospect: ${booking.prospect || 'Create a realistic fictional prospect'}

Write an HTML email body that:
1. Opens with urgency about the 10-minute countdown
2. Shows ONE detailed, realistic deliverable preview (microsite, lead magnet, or demo)
3. Includes title, structure, data points, personalization details
4. Ends with "This is what we build for every single prospect. See you in a few minutes."
5. Signs off as "The Akobs Team"

Style: inline CSS, bordered card for the example, #6c5ce7 accent. 400-600 words. No subject line.`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    const subjectProspect = booking.prospect
      ? `Here's what we'd build for ${booking.prospect.split('—')[0].trim()}`
      : `Here's what we'd build for your next prospect`;

    await emailClient.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `10 minutes to your call — ${subjectProspect}`,
      html: wrapEmailTemplate(response.content[0].text)
    });

    console.log(`   📧 Prospect-specific email sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Prospect email error:`, err.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// SCHEDULING (serverless-compatible)
// ═══════════════════════════════════════════════════════════════

function triggerPreCallEmails(booking, meetingDate) {
  const oneHourBefore = new Date(meetingDate.getTime() - 60 * 60 * 1000);
  const tenMinBefore = new Date(meetingDate.getTime() - 10 * 60 * 1000);
  const now = new Date();

  // In serverless, we can't use setTimeout/scheduleJob — send immediately if within window
  if (oneHourBefore <= now) {
    console.log(`   ⏰ Call is less than 1hr away — sending examples email now`);
    generateAndSendExamplesEmail(booking).catch(err => console.error('Examples email error:', err.message));
  } else {
    console.log(`   ⏰ Examples email would be scheduled for ${oneHourBefore.toLocaleString()} (use Vercel Cron for production)`);
  }

  if (tenMinBefore <= now) {
    console.log(`   ⏰ Call is less than 10min away — sending prospect email now`);
    generateAndSendProspectEmail(booking).catch(err => console.error('Prospect email error:', err.message));
  } else {
    console.log(`   ⏰ Prospect email would be scheduled for ${tenMinBefore.toLocaleString()} (use Vercel Cron for production)`);
  }
}


// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function parseMeetingDateTime(dateStr, timeStr, timezone) {
  const dateObj = new Date(dateStr);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const day = dateObj.getDate();

  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return dateObj;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return new Date(year, month, day, hours, minutes, 0);
}

function wrapEmailTemplate(innerHtml) {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0a0a1e, #16163a); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 800;">Akobs</h2>
        <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 4px 0 0;">Personalized Outreach, Built for You</p>
      </div>
      <div style="padding: 32px;">
        ${innerHtml}
      </div>
      <div style="padding: 20px 32px; background: #fafafe; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
        <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">
          &copy; 2026 Akobs &middot; Personalized Outreach, Built for You<br>
          <a href="#" style="color: #6c5ce7; text-decoration: none;">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
}

