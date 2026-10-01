import { promises as dns } from "dns";
import { randomUUID } from "crypto";

export interface DomainAuthResult {
  domain: string;
  spf: {
    configured: boolean;
    record?: string;
    details: string;
  };
  dkim: {
    configured: boolean;
    record?: string;
    selector?: string;
    details: string;
  };
  dmarc: {
    configured: boolean;
    record?: string;
    policy?: string;
    details: string;
  };
  score: number; // 0 to 100
  recommendations: string[];
  disclaimer: string;
}

/**
 * Checks DNS records for SPF, DKIM, and DMARC for a given sending domain.
 * Note: Mailbox providers (Gmail, Outlook, Yahoo) evaluate these records for domain authenticity,
 * but final inbox/spam placement depends on mailbox provider algorithms and domain reputation.
 */
export async function checkDomainAuthentication(domain: string): Promise<DomainAuthResult> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").trim().toLowerCase();
  
  const result: DomainAuthResult = {
    domain: cleanDomain,
    spf: {
      configured: false,
      details: "No SPF TXT record found. Emails may fail sender verification.",
    },
    dkim: {
      configured: false,
      details: "DKIM DNS selector could not be verified automatically.",
    },
    dmarc: {
      configured: false,
      details: "No DMARC record found at _dmarc." + cleanDomain,
    },
    score: 0,
    recommendations: [],
    disclaimer:
      "SPF, DKIM, and DMARC verify your domain's identity and protect against spoofing. Final folder placement (Primary, Promotions, Spam) is determined autonomously by each receiving email provider based on recipient engagement and reputation.",
  };

  if (!cleanDomain || cleanDomain.includes("localhost") || cleanDomain.endsWith(".invalid")) {
    result.recommendations.push("Use a valid custom business domain to configure email authentication.");
    return result;
  }

  // 1. Check SPF
  try {
    const txtRecords = await dns.resolveTxt(cleanDomain);
    const flattened = txtRecords.map((r) => r.join(""));
    const spfRecord = flattened.find((r) => r.toLowerCase().startsWith("v=spf1"));

    if (spfRecord && /include:_spf\.google\.com|redirect=_spf\.google\.com/i.test(spfRecord)) {
      result.spf.configured = true;
      result.spf.record = spfRecord;
      result.spf.details = "SPF record detected authorizing Google Workspace sending.";
      result.score += 35;
    } else if (spfRecord) {
      result.spf.record = spfRecord;
      result.spf.details = "An SPF record exists, but Google Workspace sending is not explicitly authorized.";
      result.recommendations.push(
        `Update the existing SPF record for "${cleanDomain}" to authorize Google Workspace with include:_spf.google.com; keep only one SPF record.`,
      );
    } else {
      result.recommendations.push(
        `Add a TXT record to "${cleanDomain}" with: "v=spf1 include:_spf.google.com ~all" (if using Google Workspace).`
      );
    }
  } catch (err) {
    result.spf.details = `Could not resolve SPF record: ${err instanceof Error ? err.message : "DNS lookup error"}`;
  }

  // 2. Check DMARC
  try {
    const dmarcDomain = `_dmarc.${cleanDomain}`;
    const dmarcRecords = await dns.resolveTxt(dmarcDomain);
    const flattened = dmarcRecords.map((r) => r.join(""));
    const dmarcRecord = flattened.find((r) => r.toLowerCase().startsWith("v=dmarc1"));

    if (dmarcRecord) {
      result.dmarc.configured = true;
      result.dmarc.record = dmarcRecord;
      const policyMatch = dmarcRecord.match(/p=([a-zA-Z]+)/i);
      const policy = policyMatch ? policyMatch[1].toLowerCase() : "none";
      result.dmarc.policy = policy;
      result.dmarc.details = `Valid DMARC policy (${policy}) active for ${cleanDomain}.`;
      result.score += 35;
    } else {
      result.recommendations.push(
        `Add a DMARC TXT record at "_dmarc.${cleanDomain}" with: "v=DMARC1; p=none; sp=none; rua=mailto:dmarc-reports@${cleanDomain}"`
      );
    }
  } catch {
    result.dmarc.details = `No DMARC TXT record published at _dmarc.${cleanDomain}.`;
    result.recommendations.push(
      `Add a DMARC TXT record at "_dmarc.${cleanDomain}" to satisfy current Google & Yahoo sender requirements.`
    );
  }

  // 3. Check Google Workspace DKIM (standard selector: google._domainkey)
  const selectorsToTest = [
    process.env.GMAIL_DKIM_SELECTOR?.trim(),
    "google",
    "default",
    "selector1",
    "selector2",
    "k1",
    "mail",
    "s1",
    "s2",
  ].filter((selector): selector is string => Boolean(selector));
  for (const selector of selectorsToTest) {
    try {
      const dkimHost = `${selector}._domainkey.${cleanDomain}`;
      const dkimRecords = await dns.resolveTxt(dkimHost);
      const flattened = dkimRecords.map((r) => r.join(""));
      const dkimRecord = flattened.find((r) => r.toLowerCase().startsWith("v=dkim1") || r.includes("p="));

      if (dkimRecord) {
        result.dkim.configured = true;
        result.dkim.selector = selector;
        result.dkim.record = dkimRecord;
        result.dkim.details = `Active DKIM public key verified at ${dkimHost}.`;
        result.score += 30;
        break;
      }
    } catch {
      // Continue checking next selector
    }
  }

  if (!result.dkim.configured) {
    result.recommendations.push(
      `Ensure DKIM key signing is activated in your email workspace admin console (e.g., Google Workspace Admin > Apps > Google Workspace > Gmail > Authenticate email).`
    );
  }

  return result;
}

/**
 * Escapes HTML entities safely for plain email generation.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Converts a plain-text email message into clean, spam-safe, semantic HTML.
 * Avoids aggressive styles, external trackers, or spammy markup.
 */
export function textToCleanHtml(plainText: string, unsubscribeUrl?: string): string {
  const paragraphs = plainText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const htmlParagraphs = paragraphs.map((p) => {
    // Convert single newlines inside a paragraph to <br/>
    const lines = p.split("\n").map((line) => escapeHtml(line.trim()));
    return `<p style="margin: 0 0 14px 0; line-height: 1.6; font-size: 14px; color: #222222;">${lines.join("<br/>")}</p>`;
  });

  let unsubscribeHtml = "";
  if (unsubscribeUrl) {
    unsubscribeHtml = `
      <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #eaeaea; font-size: 11px; color: #888888; line-height: 1.4;">
        <p style="margin: 0;">If you'd rather not receive future communications, you can <a href="${escapeHtml(
          unsubscribeUrl
        )}" style="color: #666666; text-decoration: underline;">unsubscribe here</a>.</p>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Message</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 16px 20px; background-color: #ffffff; color: #222222; max-width: 600px;">
  ${htmlParagraphs.join("\n")}
  ${unsubscribeHtml}
</body>
</html>`;
}

export interface BuildMimeOptions {
  to: string;
  from: string; // e.g. "John Doe <john@company.com>" or "john@company.com"
  replyTo?: string;
  subject: string;
  messageId?: string;
  plainText: string;
  inReplyTo?: string;
  references?: string;
  unsubscribeUrl?: string;
  senderDomain?: string;
}

export function sanitizeMimeHeader(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function encodeMimeHeaderValue(value: string): string {
  const sanitized = sanitizeMimeHeader(value);
  return /[^\x20-\x7e]/.test(sanitized)
    ? `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`
    : sanitized;
}

function encodeMimeBodyPart(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

/**
 * Builds an RFC 5322 & RFC 2046 compliant multipart/alternative MIME message
 * containing both UTF-8 Plain Text and clean HTML parts with standard email headers.
 */
export function buildCompliantMimeMessage(options: BuildMimeOptions): string {
  const {
    to,
    from,
    replyTo,
    subject,
    messageId: requestedMessageId,
    plainText,
    inReplyTo,
    references,
    unsubscribeUrl,
    senderDomain = "mail.leadlens.ai",
  } = options;

  const boundary = `----=_Part_${Date.now()}_${randomUUID().replace(/-/g, "")}`;
  const messageId = requestedMessageId && /^<[^<>\s@]+@[^<>\s@]+>$/.test(requestedMessageId)
    ? requestedMessageId
    : `<${randomUUID()}@${sanitizeMimeHeader(senderDomain) || "mail.leadlens.ai"}>`;
  const dateStr = new Date().toUTCString();

  // Construct plain text with unsubscribe note if provided
  const fullPlainText = unsubscribeUrl
    ? `${plainText.trim()}\n\n---\nTo stop receiving these emails: ${unsubscribeUrl}`
    : plainText.trim();

  // Construct clean HTML part
  const htmlContent = textToCleanHtml(plainText, unsubscribeUrl);

  const headers: string[] = [
    `From: ${sanitizeMimeHeader(from)}`,
    `To: ${sanitizeMimeHeader(to)}`,
    `Subject: ${encodeMimeHeaderValue(subject)}`,
    `Date: ${dateStr}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];

  if (replyTo && sanitizeMimeHeader(replyTo)) {
    headers.push(`Reply-To: ${sanitizeMimeHeader(replyTo)}`);
  }

  if (inReplyTo) {
    const cleanInReply = inReplyTo.replace(/[<>]/g, "");
    headers.push(`In-Reply-To: <${cleanInReply}>`);
    if (references) {
      const cleanRef = references.replace(/[<>]/g, "");
      headers.push(`References: <${cleanRef}>`);
    } else {
      headers.push(`References: <${cleanInReply}>`);
    }
  }

  if (unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${unsubscribeUrl}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }

  // Multipart header
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  // Build body parts
  const mimeBodyParts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeMimeBodyPart(fullPlainText),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeMimeBodyPart(htmlContent),
    "",
    `--${boundary}--`,
    "",
  ];

  return [...headers, "", ...mimeBodyParts].join("\r\n");
}
