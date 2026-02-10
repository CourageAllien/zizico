require('dotenv').config();
const express = require('express');
const path = require('path');
const schedule = require('node-schedule');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config (lazy-init to avoid crashes when keys aren't set) ────
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'couragealison1@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'ZiziCo <onboarding@resend.dev>';

let resend = null;
let anthropic = null;

function getResend() {
  if (!resend && RESEND_KEY && !RESEND_KEY.startsWith('re_xx')) {
    resend = new Resend(RESEND_KEY);
  }
  return resend;
}

function getAnthropic() {
  if (!anthropic && ANTHROPIC_KEY && !ANTHROPIC_KEY.startsWith('sk-ant-xx')) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    } catch (err) {
      console.error('Failed to init Anthropic SDK:', err.message);
    }
  }
  return anthropic;
}

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Routes ─────────────────────────────────────────────────────
// Serve booking page
app.get('/book', (req, res) => {
  res.sendFile(path.join(__dirname, 'book.html'));
});

// ── Booking API ────────────────────────────────────────────────
app.post('/api/book', async (req, res) => {
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

    // Parse the meeting date/time
    const meetingDate = parseMeetingDateTime(date, time, timezone);

    console.log(`\n✅ New booking from ${firstName} ${lastName} (${company})`);
    console.log(`   Email: ${email}`);
    console.log(`   Meeting: ${meetingDate.toLocaleString()}`);
    console.log(`   What they sell: ${whatYouSell}`);

    // ── 1. Send confirmation emails (immediate) ─────────────
    await Promise.all([
      sendBookerConfirmation(booking, meetingDate),
      sendTeamNotification(booking, meetingDate)
    ]);

    // ── 2. Generate & send personalized welcome email (async, don't block response) ──
    generateAndSendWelcomeEmail(booking).catch(err => {
      console.error('Error sending welcome email:', err.message);
    });

    // ── 3. Schedule pre-call emails ─────────────────────────
    schedulePreCallEmails(booking, meetingDate);

    res.json({ success: true, message: 'Booking confirmed!' });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Failed to process booking. Please try again.' });
  }
});


// ═══════════════════════════════════════════════════════════════
// EMAIL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// ── Confirmation email to the person who booked ─────────────
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
      subject: `You're booked! Discovery call with ZiziCo — ${dateStr}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0a0a1e, #16163a); padding: 40px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px;">You're booked, ${booking.firstName}!</h1>
            <p style="color: rgba(255,255,255,0.65); font-size: 15px; margin: 0;">Your 15-minute discovery call is confirmed.</p>
          </div>

          <div style="padding: 32px;">
            <div style="background: #f8f7ff; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <table style="width: 100%; font-size: 14px; color: #333;">
                <tr>
                  <td style="padding: 6px 0; color: #888; width: 100px;">Date</td>
                  <td style="padding: 6px 0; font-weight: 600;">${dateStr}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #888;">Time</td>
                  <td style="padding: 6px 0; font-weight: 600;">${timeStr}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #888;">Duration</td>
                  <td style="padding: 6px 0; font-weight: 600;">15 minutes</td>
                </tr>
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
              personalized examples showing exactly how ZiziCo could help ${booking.company} close more deals.
            </p>

            <p style="font-size: 14px; color: #888; margin: 24px 0 0;">
              — The ZiziCo Team
            </p>
          </div>

          <div style="padding: 20px 32px; background: #fafafe; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">
              &copy; 2026 ZiziCo · Personalized Outreach, Built for You
            </p>
          </div>
        </div>
      `
    });
    console.log(`   📧 Confirmation sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Failed to send confirmation to booker:`, err.message);
  }
}

// ── Notification email to ZiziCo team ───────────────────────
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
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888; width: 140px;">Name</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${booking.firstName} ${booking.lastName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Email</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;"><a href="mailto:${booking.email}" style="color: #6c5ce7;">${booking.email}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Phone</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.phone || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Company</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${booking.company}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Role</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.role}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Industry</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.industry || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Typical Deal Size</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.dealSize || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">What they sell</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.whatYouSell}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Named Prospect</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${booking.prospect || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #888;">Call Date</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${dateStr} at ${booking.time}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #888;">Timezone</td>
                <td style="padding: 10px 0;">${booking.timezone}</td>
              </tr>
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

// ── Email 1: Immediately after booking ──────────────────────
// Personalized message showing HOW lead magnets, microsites, and demos can help them
async function generateAndSendWelcomeEmail(booking) {
  const ai = getAnthropic();
  const emailClient = getResend();
  if (!ai || !emailClient) { console.log('   ⚠️  APIs not configured — skipping welcome email'); return; }

  console.log(`\n🤖 Generating personalized welcome email for ${booking.firstName}...`);

  const prompt = `You are a persuasive, conversational sales copywriter for ZiziCo — a service that builds personalized microsites, lead magnets, and tailored demos for sales teams who sell high-value deals.

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
   - **Personalized Microsites**: A branded web page built for one prospect. Give a specific example relevant to their industry/product.
   - **Custom Lead Magnets**: A report, audit, or guide built for one company. Give a specific example relevant to their business.
   - **Tailored Demos**: A pre-configured walkthrough with the prospect's name, data, and use case. Give a specific example.
4. Builds excitement for the upcoming call
5. Signs off as "The ZiziCo Team"

Style rules:
- Use inline CSS for all styling
- Keep it professional but warm and conversational
- Use #6c5ce7 as accent color, #1a1a2e for dark text
- Make it visually clean with good spacing
- Use <strong> tags and bullet points where appropriate
- Total length: 300-500 words
- Do NOT include subject line — just the HTML body content`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const emailHtml = response.content[0].text;

    await emailClient.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `${booking.firstName}, here's how ZiziCo can help ${booking.company} close more deals`,
      html: wrapEmailTemplate(emailHtml)
    });

    console.log(`   📧 Personalized welcome email sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Welcome email error:`, err.message);
  }
}

// ── Email 2: 1 hour before the call ─────────────────────────
// 2 examples each of lead magnets, microsites, and demos
async function generateAndSendExamplesEmail(booking) {
  const ai = getAnthropic();
  const emailClient = getResend();
  if (!ai || !emailClient) { console.log('   ⚠️  APIs not configured — skipping examples email'); return; }

  console.log(`\n🤖 Generating examples email for ${booking.firstName} (1hr before call)...`);

  const prompt = `You are a persuasive sales copywriter for ZiziCo — a service that builds personalized microsites, lead magnets, and tailored demos for high-value sales teams.

A prospect has a discovery call in 1 hour. Here's what we know:

- Name: ${booking.firstName} ${booking.lastName}
- Company: ${booking.company}
- Role: ${booking.role}
- Industry: ${booking.industry || 'Unknown'}
- What they sell: ${booking.whatYouSell}
- Typical deal size: ${booking.dealSize || 'Unknown'}
- Named prospect they're working: ${booking.prospect || 'None provided'}

Write a personalized HTML email body (just inner content, no <html>/<body> tags) that:

1. Reminds them the call is in 1 hour
2. Says "We put together some examples of what we'd build for ${booking.company}. Here's a preview:"
3. Provides **2 specific examples** for each deliverable type, tailored to their business:

   **Personalized Microsites** (2 examples):
   - For each: Give it a specific title, describe what it would contain, who it would be sent to, and why it would work. Make each example feel like a real deliverable we'd build for one of their prospects.

   **Custom Lead Magnets** (2 examples):
   - For each: Give it a specific title (e.g., "[Prospect Company]'s ___ Report"), describe the content, who would receive it, and the expected impact.

   **Tailored Demos** (2 examples):
   - For each: Describe the demo scenario, what data it would be pre-loaded with, and how the prospect would react.

4. Builds excitement: "We'll walk through these on the call and show you exactly how we'd build them."
5. Signs off as "The ZiziCo Team"

Style rules:
- Use inline CSS for all styling
- Use cards or sections with light backgrounds (#f8f7ff) for each deliverable category
- Use #6c5ce7 as accent color
- Each example should have a bold title and 2-3 sentence description
- Professional, specific, and energizing tone
- Do NOT include subject line`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    const emailHtml = response.content[0].text;

    await emailClient.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `Your call is in 1 hour — here are 6 examples we'd build for ${booking.company}`,
      html: wrapEmailTemplate(emailHtml)
    });

    console.log(`   📧 Examples email sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Examples email error:`, err.message);
  }
}

// ── Email 3: 10 minutes before the call ─────────────────────
// A real-life example built for one of THEIR actual prospects
async function generateAndSendProspectEmail(booking) {
  const ai = getAnthropic();
  const emailClient = getResend();
  if (!ai || !emailClient) { console.log('   ⚠️  APIs not configured — skipping prospect email'); return; }

  console.log(`\n🤖 Generating prospect-specific email for ${booking.firstName} (10min before call)...`);

  const prospectInfo = booking.prospect || 'a typical prospect in their pipeline';

  const prompt = `You are a persuasive sales copywriter and researcher for ZiziCo — a service that builds personalized microsites, lead magnets, and tailored demos for high-value sales teams.

A prospect has a discovery call in 10 minutes. Here's what we know:

- Name: ${booking.firstName} ${booking.lastName}
- Company: ${booking.company}
- Role: ${booking.role}
- Industry: ${booking.industry || 'Unknown'}
- What they sell: ${booking.whatYouSell}
- Typical deal size: ${booking.dealSize || 'Unknown'}
- Named prospect/target account: ${booking.prospect || 'Not provided — create a realistic fictional prospect company that would be a perfect fit for what they sell'}

Write a personalized HTML email body (just inner content, no <html>/<body> tags) that:

1. Opens with urgency: "Your call starts in 10 minutes. Before we jump on, we wanted to show you something."
2. Says we did some quick research and put together a REAL example of what we'd build for ${booking.company} targeting ${booking.prospect || 'a specific prospect'}.
3. Pick ONE deliverable type (whichever is most impressive for their use case — microsite, lead magnet, or demo) and create a detailed, realistic preview:

   - Give it a specific, compelling title
   - Describe the full structure/outline (sections, data points, visuals)
   - Explain what research we'd pull in (company info, pain points, tech stack, public data)
   - Show how it would be personalized for that specific prospect
   - Explain the expected impact ("When the [title] at [prospect] opens this...")

4. End with: "This is what we build for every single prospect. Imagine sending something like this to every deal in your pipeline. See you in a few minutes."
5. Sign off as "The ZiziCo Team"

Style rules:
- Use inline CSS for all styling
- The example should be presented like a detailed blueprint/preview with a bordered card
- Use #6c5ce7 as accent color, #1a1a2e for dark text
- Make it feel like we ALREADY did the work — this is a proof of capability
- Specific, detailed, and impressive
- 400-600 words
- Do NOT include subject line`;

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    const emailHtml = response.content[0].text;

    const subjectProspect = booking.prospect
      ? `Here's what we'd build for ${booking.prospect.split('—')[0].trim()}`
      : `Here's what we'd build for your next prospect`;

    await emailClient.emails.send({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `10 minutes to your call — ${subjectProspect}`,
      html: wrapEmailTemplate(emailHtml)
    });

    console.log(`   📧 Prospect-specific email sent to ${booking.email}`);
  } catch (err) {
    console.error(`   ❌ Prospect email error:`, err.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// SCHEDULING
// ═══════════════════════════════════════════════════════════════

function schedulePreCallEmails(booking, meetingDate) {
  // 1 hour before
  const oneHourBefore = new Date(meetingDate.getTime() - 60 * 60 * 1000);
  // 10 minutes before
  const tenMinBefore = new Date(meetingDate.getTime() - 10 * 60 * 1000);

  const now = new Date();

  // Schedule 1-hour-before email
  if (oneHourBefore > now) {
    schedule.scheduleJob(`examples-${booking.email}-${meetingDate.getTime()}`, oneHourBefore, () => {
      generateAndSendExamplesEmail(booking).catch(err => {
        console.error('Scheduled examples email error:', err.message);
      });
    });
    console.log(`   ⏰ Examples email scheduled for ${oneHourBefore.toLocaleString()}`);
  } else {
    // If less than 1 hour away, send immediately
    console.log(`   ⏰ Call is less than 1hr away — sending examples email now`);
    generateAndSendExamplesEmail(booking).catch(err => {
      console.error('Examples email error:', err.message);
    });
  }

  // Schedule 10-minutes-before email
  if (tenMinBefore > now) {
    schedule.scheduleJob(`prospect-${booking.email}-${meetingDate.getTime()}`, tenMinBefore, () => {
      generateAndSendProspectEmail(booking).catch(err => {
        console.error('Scheduled prospect email error:', err.message);
      });
    });
    console.log(`   ⏰ Prospect email scheduled for ${tenMinBefore.toLocaleString()}`);
  } else {
    // If less than 10 min away, send immediately
    console.log(`   ⏰ Call is less than 10min away — sending prospect email now`);
    generateAndSendProspectEmail(booking).catch(err => {
      console.error('Prospect email error:', err.message);
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function parseMeetingDateTime(dateStr, timeStr, timezone) {
  // dateStr: ISO string like "2026-02-20T12:00:00.000Z"
  // timeStr: like "10:00 AM"
  const dateObj = new Date(dateStr);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const day = dateObj.getDate();

  // Parse time
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
        <h2 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 800;">ZiziCo</h2>
        <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 4px 0 0;">Personalized Outreach, Built for You</p>
      </div>

      <div style="padding: 32px;">
        ${innerHtml}
      </div>

      <div style="padding: 20px 32px; background: #fafafe; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
        <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">
          &copy; 2026 ZiziCo &middot; Personalized Outreach, Built for You<br>
          <a href="#" style="color: #6c5ce7; text-decoration: none;">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
}


// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🚀 ZiziCo server running at http://localhost:${PORT}`);
  console.log(`   Landing page: http://localhost:${PORT}`);
  console.log(`   Booking page: http://localhost:${PORT}/book`);
  console.log(`\n   Notification email: ${NOTIFICATION_EMAIL}`);
  console.log(`   From email: ${FROM_EMAIL}`);

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_xx')) {
    console.log('\n   ⚠️  RESEND_API_KEY not configured — emails will fail');
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-xx')) {
    console.log('   ⚠️  ANTHROPIC_API_KEY not configured — AI emails will fail');
  }
  console.log('');
});

