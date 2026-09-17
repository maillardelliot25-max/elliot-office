import nodemailer from "nodemailer";

// No filesystem writes here — serverless functions don't have persistent
// disk. When SMTP isn't configured, the caller already has the full brief
// text (stored on the agent_runs row and shown in the UI), so dry-run mode
// just reports that nothing was actually emailed.
export async function deliverBrief({ toEmail, subject, body }) {
  const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!smtpConfigured) {
    return {
      delivered: false,
      dryRun: true,
      to: toEmail,
      note: "SMTP not configured — email not sent. Full brief text is above.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({ from: process.env.SMTP_FROM, to: toEmail, subject, text: body });

  return { delivered: true, dryRun: false, to: toEmail };
}
