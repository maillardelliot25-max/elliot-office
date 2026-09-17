import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../output");

export async function deliverBrief({ client, subject, body }) {
  const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!smtpConfigured) {
    return dryRunDeliver({ client, subject, body });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: client.deliveryEmail,
    subject,
    text: body,
  });

  return { delivered: true, dryRun: false, to: client.deliveryEmail };
}

// No SMTP configured: write the would-be email to output/ so the pipeline
// still runs end-to-end and produces a reviewable artifact.
async function dryRunDeliver({ client, subject, body }) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const filename = `${client.clientId}-${Date.now()}.eml`;
  const filePath = path.join(OUTPUT_DIR, filename);
  const content = `To: ${client.deliveryEmail}\nSubject: ${subject}\n\n${body}\n`;
  await writeFile(filePath, content, "utf8");
  return { delivered: false, dryRun: true, to: client.deliveryEmail, filePath };
}
