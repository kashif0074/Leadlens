// workers/processors/emailWorker.ts
// Robust Nodemailer email-sending helper for Gmail and custom SMTP providers.
import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT?.trim() ?? (host === "smtp.gmail.com" ? "587" : "587"));
  const secure = process.env.SMTP_SECURE?.trim() === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim() || "";
  // Google App Passwords often contain spaces when copied (e.g. 'xxxx xxxx xxxx xxxx')
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "").trim() || "";

  return { host, port, secure, user, pass };
}

export type SmtpCredentials = {
  email: string;
  appPassword: string;
  displayName?: string;
};

function createTransporter(credentials?: SmtpCredentials) {
  if (credentials) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: credentials.email, pass: credentials.appPassword },
      pool: true,
      maxConnections: 1,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  const { host, port, secure, user, pass } = getSmtpConfig();

  if (!user || !pass) {
    throw new Error("SMTP credentials are not configured on the server. Please set SMTP_USER and SMTP_PASS in your .env file.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

export function createSenderTransport(credentials: SmtpCredentials) {
  return createTransporter(credentials);
}

// Lazy init transporter
let transporter: ReturnType<typeof createTransporter> | null = null;

function getTransporter(credentials?: SmtpCredentials) {
  if (credentials) return createTransporter(credentials);
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

export function resetTransporter() {
  transporter = null;
}

export function normalizeSmtpError(error: unknown): Error {
  if (!error) return new Error("Unknown SMTP error occurred.");

  const smtpError = error as {
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
    message?: unknown;
  };

  const messageStr = typeof smtpError.message === "string" ? smtpError.message : "";
  const codeStr = String(smtpError.code || "");
  const responseCode = Number(smtpError.responseCode || 0);
  const responseStr = typeof smtpError.response === "string" ? smtpError.response : "";

  // Authentication error (Gmail App Password missing / invalid)
  if (
    responseCode === 535 ||
    codeStr === "EAUTH" ||
    /invalid login|authentication failed|badcredentials|535-5.7.8/i.test(messageStr) ||
    /invalid login|authentication failed/i.test(responseStr)
  ) {
    return new Error(
      "Gmail rejected these credentials. Check that 2-Step Verification is enabled and reconnect using a valid 16-character App Password, not your regular Google password.",
    );
  }

  // Connection / Network timeouts
  if (
    codeStr === "ETIMEDOUT" ||
    codeStr === "ESOCKETTIMEDOUT" ||
    codeStr === "ECONNREFUSED" ||
    codeStr === "ENOTFOUND" ||
    /timeout|connect econnrefused|getaddrinfo enotfound/i.test(messageStr)
  ) {
    const { host, port } = getSmtpConfig();
    return new Error(
      `Failed to connect to SMTP server (${host}:${port}). Please verify your network connection and SMTP server host settings.`,
    );
  }

  // Rate limits
  if (
    responseCode === 421 ||
    responseCode === 450 ||
    responseCode === 451 ||
    responseCode === 452 ||
    /rate limit|daily quota|too many messages|hourly limit|user rate limit exceeded/i.test(messageStr) ||
    /rate limit|quota/i.test(responseStr)
  ) {
    return new Error("SMTP sending rate limit or daily quota reached. Please wait before launching additional emails.");
  }

  // Recipient mailbox unavailable / rejected
  if (
    responseCode === 550 ||
    responseCode === 551 ||
    responseCode === 553 ||
    responseCode === 501 ||
    /mailbox unavailable|recipient address rejected|user not found|no such user/i.test(messageStr)
  ) {
    return new Error(`Recipient email address was rejected by SMTP server: ${messageStr || "Address unavailable"}`);
  }

  return error instanceof Error ? error : new Error(messageStr || "SMTP communication failed.");
}

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  unsubscribeUrl?: string;
  credentials?: SmtpCredentials;
  transport?: ReturnType<typeof createSenderTransport>;
};

export async function verifySenderAddress(
  email?: string,
  credentials?: SmtpCredentials,
  transport?: ReturnType<typeof createSenderTransport>,
): Promise<string> {
  const { user } = getSmtpConfig();
  const sender = credentials?.email ?? user;
  if (!sender) {
    throw new Error("SMTP_USER is not configured in .env. Please configure your sending email credentials.");
  }

  if (email && email.trim() && sender.toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error(`The provided email (${email.trim()}) does not match the authenticated sending account (${sender}).`);
  }

  const activeTransporter = transport ?? getTransporter(credentials);
  try {
    await activeTransporter.verify();
  } catch (error) {
    if (!credentials && !transport) resetTransporter();
    throw normalizeSmtpError(error);
  } finally {
    if (credentials && !transport) activeTransporter.close();
  }

  return sender;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function sendEmail({
  to,
  subject,
  body,
  fromName,
  unsubscribeUrl,
  credentials,
  transport,
}: SendEmailInput) {
  const recipient = to?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error(`Invalid recipient email address: "${to}".`);
  }

  const cleanSubject = subject?.trim();
  if (!cleanSubject || /[\r\n\u0000-\u001f\u007f]/.test(cleanSubject) || cleanSubject.length > 200) {
    throw new Error("Email subject cannot be empty.");
  }

  if (!body?.trim()) {
    throw new Error("Email body cannot be empty.");
  }

  const { user } = getSmtpConfig();
  const sender = credentials?.email ?? user;
  if (!sender) {
    throw new Error("SMTP_USER is not configured in .env.");
  }

  const activeTransporter = transport ?? getTransporter(credentials);
  let info: Awaited<ReturnType<typeof activeTransporter.sendMail>>;
  const displayName = sanitizeHeaderValue(fromName || credentials?.displayName || "");
  const cleanUnsubscribeUrl = unsubscribeUrl?.trim();
  if (cleanUnsubscribeUrl) {
    const parsedUrl = new URL(cleanUnsubscribeUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
      throw new Error("Unsubscribe links must use HTTPS.");
    }
  }
  const textBody = [
    body.trim(),
    cleanUnsubscribeUrl ? `\n\nTo stop receiving these emails, unsubscribe: ${cleanUnsubscribeUrl}` : "",
  ].filter(Boolean).join("");
  const htmlBody = body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#202124">',
    htmlBody,
    cleanUnsubscribeUrl
      ? `<p style="margin:24px 0 0;font-size:12px;color:#5f6368"><a href="${escapeHtml(cleanUnsubscribeUrl)}">Unsubscribe</a></p>`
      : "",
    "</div>",
  ].join("");
  const headers = cleanUnsubscribeUrl
    ? {
        "List-Unsubscribe": `<${cleanUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  try {
    info = await activeTransporter.sendMail({
      from: displayName ? { name: displayName, address: sender } : sender,
      replyTo: sender,
      to: recipient,
      envelope: { from: sender, to: [recipient] },
      subject: cleanSubject,
      text: textBody,
      html,
      headers,
      xMailer: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } catch (error) {
    throw normalizeSmtpError(error);
  } finally {
    if (credentials && !transport) activeTransporter.close();
  }

  if (!info.accepted || !info.accepted.length || (info.rejected && info.rejected.length > 0)) {
    throw new Error(`SMTP server rejected delivery to recipient: ${recipient}.`);
  }

  return { status: "sent" as const, messageId: info.messageId || `msg-${Date.now()}` };
}