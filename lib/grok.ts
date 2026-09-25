import type { Lead } from "../types";

export type GeneratedEmail = {
  step: number;
  delayDays: number;
  subject: string;
  body: string;
};

const GROQ_MODEL = "openai/gpt-oss-20b";
const PER_KEY_TIMEOUT_MS = 15_000; // 15 seconds per key attempt to avoid hanging on a slow connection

export interface GroqKeyConfig {
  id: "key-1" | "key-2" | "key-3";
  label: string;
  key: string;
}

interface KeyHealthState {
  cooldownUntil: number;
  lastFailureReason?: string;
  failedAt?: number;
}

// In-memory key health state: tracks rate limits, token limits, and temporary downtime across requests
const keyHealthTracker = new Map<string, KeyHealthState>();

/**
 * Returns configured Groq API keys strictly in priority order: Key 1 -> Key 2 -> Key 3.
 * Server-side only; never exposed to the frontend.
 */
export function getConfiguredGroqKeys(): GroqKeyConfig[] {
  const definitions: Array<{ id: "key-1" | "key-2" | "key-3"; label: string; key?: string }> = [
    {
      id: "key-1",
      label: "Groq API Key 1",
      key: process.env.GROQ_API_KEY_1?.trim() || process.env.GROQ_API_KEY?.trim(),
    },
    {
      id: "key-2",
      label: "Groq API Key 2",
      key: process.env.GROQ_API_KEY_2?.trim(),
    },
    {
      id: "key-3",
      label: "Groq API Key 3",
      key: process.env.GROQ_API_KEY_3?.trim(),
    },
  ];

  const seen = new Set<string>();
  const validKeys: GroqKeyConfig[] = [];

  for (const def of definitions) {
    if (def.key && !seen.has(def.key)) {
      seen.add(def.key);
      validKeys.push({
        id: def.id,
        label: def.label,
        key: def.key,
      });
    }
  }

  return validKeys;
}

/**
 * Creates a structured error with an HTTP status code for API responses.
 */
function groqError(message: string, status = 500) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

/**
 * Determines whether a failure should trigger automatic failover to the next Groq key.
 */
function isFailoverEligible(status: number, message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    status === 401 || // Unauthorized / Invalid API key
    status === 403 || // Forbidden / Account quota exhausted
    status === 408 || // Request Timeout
    status === 425 || // Too early
    status === 429 || // Too Many Requests / Rate limit / Token limit
    status >= 500 || // Server errors (500, 502, 503, 504)
    /rate.?limit|quota|token|context length|too many requests|too many tokens|tpm|rpm|rpd|tpd|exceeded|capacity|overloaded|temporarily unavailable|service unavailable|auth|unauthorized|forbidden|invalid api key|fetch failed/i.test(
      normalized,
    )
  );
}

/**
 * Extracts cooldown duration in milliseconds from Groq response headers or error messages.
 */
function extractCooldownMs(response?: Response, errorMessage?: string, status?: number): number {
  if (response) {
    const retryHeader = response.headers.get("retry-after");
    if (retryHeader) {
      const seconds = parseFloat(retryHeader);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.min(Math.ceil(seconds * 1000) + 500, 10 * 60 * 1000); // Max 10 min
      }
    }
  }

  if (errorMessage) {
    const matchSec = errorMessage.match(/try again in ([\d\.]+)\s*s/i);
    if (matchSec) {
      const sec = parseFloat(matchSec[1]);
      if (!isNaN(sec) && sec > 0) return Math.ceil(sec * 1000) + 500;
    }
    const matchMin = errorMessage.match(/try again in ([\d\.]+)\s*m/i);
    if (matchMin) {
      const min = parseFloat(matchMin[1]);
      if (!isNaN(min) && min > 0) return Math.ceil(min * 60 * 1000) + 1000;
    }
  }

  // Specific default cooldowns by failure type
  if (status === 429) return 60_000; // Rate/token limit: 60s
  if (status === 401 || status === 403) return 5 * 60_000; // Auth/quota failure: 5 min
  if (status && status >= 500) return 20_000; // Groq server outage: 20s
  return 30_000; // Default: 30s
}

/**
 * Re-orders configured keys so that non-exhausted keys are tried in strict order (Key 1 -> Key 2 -> Key 3).
 * If all keys are currently cooling down, cooldowns are reset to avoid false permanent lockout.
 */
function getPrioritizedKeys(configuredKeys: GroqKeyConfig[]): GroqKeyConfig[] {
  const now = Date.now();
  const availableKeys: GroqKeyConfig[] = [];
  const coolingKeys: GroqKeyConfig[] = [];

  for (const item of configuredKeys) {
    const health = keyHealthTracker.get(item.key);
    if (health && health.cooldownUntil > now) {
      coolingKeys.push(item);
    } else {
      if (health) keyHealthTracker.delete(item.key);
      availableKeys.push(item);
    }
  }

  // If all keys are currently in cooldown, reset Key 1 to prevent deadlock
  if (availableKeys.length === 0) {
    console.warn("[Groq AI Failover] All keys are currently in cooldown. Resetting cooldowns and retrying Key 1...");
    keyHealthTracker.clear();
    return [...configuredKeys];
  }

  // Prioritize active available keys; cooling keys placed at the end as last-resort fallbacks
  return [...availableKeys, ...coolingKeys];
}

function extractJsonSubstring(text: string): string {
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, "$1")
    .trim();

  // Try direct parse first
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // Look for first '{' and matching last '}'
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = stripped.slice(firstBrace, lastBrace + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Continue to array check
      }
    }

    // Look for first '[' and matching last ']'
    const firstBracket = stripped.indexOf("[");
    const lastBracket = stripped.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = stripped.slice(firstBracket, lastBracket + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Continue
      }
    }
  }

  return stripped;
}

function parseGeneratedEmails(value: unknown): GeneratedEmail[] {
  if (typeof value === "string") {
    try {
      return parseGeneratedEmails(JSON.parse(value));
    } catch {
      throw groqError("Groq AI returned an invalid email sequence format. Please try again.", 502);
    }
  }

  const objectValue = value as Record<string, unknown> | null;
  const namedEmails = objectValue
    ? [objectValue.initial_email, objectValue.follow_up_1, objectValue.follow_up_2]
    : [];
  const candidate = Array.isArray(value)
    ? value
    : Array.isArray(objectValue?.emails)
      ? objectValue.emails
      : Array.isArray(objectValue?.sequence)
        ? objectValue.sequence
        : namedEmails.every(Boolean)
          ? namedEmails
          : null;

  if (!Array.isArray(candidate) || candidate.length !== 3) {
    throw groqError("Groq AI returned an incomplete email sequence. Expected 3 emails.", 502);
  }

  const emails = candidate.map((email, index) => {
    const item = email as Record<string, unknown>;
    const subject = item.subject ?? item.subject_line ?? item.title;
    const body = item.body ?? item.content ?? item.message;
    if (typeof subject !== "string" || !subject.trim() || typeof body !== "string" || !body.trim()) {
      throw groqError("Groq AI returned an incomplete email sequence item.", 502);
    }
    return {
      step: index + 1,
      delayDays: index === 0 ? 0 : index === 1 ? 3 : 5,
      subject: subject.trim(),
      body: body.trim(),
    };
  });

  return emails;
}

/**
 * Generates a 3-step personalized cold outbound email sequence using Groq AI
 * with automatic failover across 3 server-side API keys.
 *
 * Failover path:
 * 1. Groq API Key 1
 * 2. Groq API Key 2 (if Key 1 is rate-limited, token-limited, or unavailable)
 * 3. Groq API Key 3 (if Key 2 also fails)
 * 4. User-friendly error if Key 3 also fails.
 */
export async function generateCampaignEmails(
  prompt: string,
  leads: Lead[],
  instruction?: string,
  signal?: AbortSignal,
): Promise<GeneratedEmail[]> {
  const configuredKeys = getConfiguredGroqKeys();
  if (!configuredKeys.length) {
    throw groqError(
      "No Groq API keys are configured on the server. Please add GROQ_API_KEY_1 to .env.",
      500,
    );
  }
  if (!leads.length) {
    throw groqError("Select at least one lead before generating emails.", 400);
  }

  const leadContext = leads.map((lead) => ({
    firstName: lead.name.trim().split(/\s+/)[0],
    fullName: lead.name,
    jobTitle: lead.jobTitle,
    company: lead.company,
    industry: lead.industry,
    companySize: lead.companySize,
    domain: lead.domain ?? lead.email.split("@")[1] ?? "",
    email: lead.email,
    location: lead.location,
    matchReason: lead.matchReason,
  }));

  const instructionBlock = instruction?.trim() ? `\nRegeneration instruction: ${instruction.trim()}` : "";
  const requestBody = JSON.stringify({
    model: GROQ_MODEL,
    temperature: 0.3,
    reasoning_effort: "low",
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Return only valid JSON: {"emails":[{"subject":"...","body":"..."},{"subject":"...","body":"..."},{"subject":"...","body":"..."}]}. Write exactly 3 concise B2B emails: Step 1 (Initial Email), Step 2 (Follow-up 1), Step 3 (Follow-up 2). Each body must be 45 words or fewer. No markdown or explanation.',
      },
      {
        role: "user",
        content: `Original campaign brief:\n${prompt}${instructionBlock}\n\nPersonalize for this recipient using these facts without placeholders:\n${JSON.stringify(leadContext[0])}`,
      },
    ],
  });

  const keysToTry = getPrioritizedKeys(configuredKeys);
  const failureHistory: string[] = [];

  for (let i = 0; i < keysToTry.length; i++) {
    const keyConfig = keysToTry[i];
    const isLastKey = i === keysToTry.length - 1;
    const nextKeyConfig = !isLastKey ? keysToTry[i + 1] : null;

    if (signal?.aborted) {
      throw groqError("Campaign generation was cancelled.", 499);
    }

    // Set up a per-attempt abort timeout (15s) combined with the parent signal
    const attemptController = new AbortController();
    const timeoutId = setTimeout(() => attemptController.abort(), PER_KEY_TIMEOUT_MS);
    const onParentAbort = () => attemptController.abort();
    if (signal) signal.addEventListener("abort", onParentAbort, { once: true });

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyConfig.key}`,
        },
        signal: attemptController.signal,
        body: requestBody,
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onParentAbort);

      if (signal?.aborted) {
        throw groqError("Campaign generation was cancelled.", 499);
      }

      const isTimeout =
        (fetchError instanceof DOMException && fetchError.name === "AbortError") ||
        attemptController.signal.aborted;
      const errorMsg = isTimeout
        ? "Request timed out after 15 seconds"
        : fetchError instanceof Error
          ? fetchError.message
          : "Network request failed";

      const cooldown = 30_000;
      keyHealthTracker.set(keyConfig.key, {
        cooldownUntil: Date.now() + cooldown,
        lastFailureReason: errorMsg,
        failedAt: Date.now(),
      });

      failureHistory.push(`${keyConfig.label}: ${errorMsg}`);

      if (!isLastKey && nextKeyConfig) {
        console.warn(
          `[Groq AI Failover] ${keyConfig.label} failed (${errorMsg}). Automatically failing over to ${nextKeyConfig.label}...`,
        );
        continue;
      }

      console.error(
        `[Groq AI Failover] All configured Groq API keys failed. Failures: ${failureHistory.join("; ")}`,
      );
      throw groqError(
        "The AI email generation service is temporarily unavailable. Please try again in a few moments.",
        503,
      );
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onParentAbort);
    }

    // Parse JSON body or detect unreadable response
    let responseData: {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string; type?: string; code?: string };
    };

    try {
      responseData = await response.json();
    } catch {
      const cooldown = extractCooldownMs(response, "unreadable response", response.status);
      keyHealthTracker.set(keyConfig.key, {
        cooldownUntil: Date.now() + cooldown,
        lastFailureReason: `HTTP ${response.status} unreadable body`,
        failedAt: Date.now(),
      });
      failureHistory.push(`${keyConfig.label}: HTTP ${response.status} unreadable response`);

      if (!isLastKey && nextKeyConfig && isFailoverEligible(response.status, "unreadable")) {
        console.warn(
          `[Groq AI Failover] ${keyConfig.label} returned unreadable response (HTTP ${response.status}). Automatically failing over to ${nextKeyConfig.label}...`,
        );
        continue;
      }

      throw groqError(
        "The AI email generation service is temporarily unavailable. Please try again in a few moments.",
        503,
      );
    }

    // Check for HTTP errors or error payload
    if (!response.ok || responseData.error) {
      const rawErrorMsg =
        responseData.error?.message ||
        responseData.error?.code ||
        `HTTP ${response.status} error`;
      const cooldown = extractCooldownMs(response, rawErrorMsg, response.status);

      keyHealthTracker.set(keyConfig.key, {
        cooldownUntil: Date.now() + cooldown,
        lastFailureReason: rawErrorMsg,
        failedAt: Date.now(),
      });
      failureHistory.push(`${keyConfig.label}: [HTTP ${response.status}] ${rawErrorMsg}`);

      if (isFailoverEligible(response.status, rawErrorMsg)) {
        if (!isLastKey && nextKeyConfig) {
          console.warn(
            `[Groq AI Failover] ${keyConfig.label} encountered API/rate-limit issue (HTTP ${response.status}: ${rawErrorMsg}). Automatically failing over to ${nextKeyConfig.label}...`,
          );
          continue;
        }

        console.error(
          `[Groq AI Failover] All configured Groq API keys exhausted (last failed: ${keyConfig.label} - ${rawErrorMsg}).`,
        );
        throw groqError(
          "The AI email generation service is temporarily at peak capacity. Please wait a few moments and try again.",
          503,
        );
      }

      // Non-failover error (e.g. fatal bad parameters)
      if (!isLastKey && nextKeyConfig) {
        console.warn(
          `[Groq AI Failover] Unexpected error on ${keyConfig.label} (HTTP ${response.status}: ${rawErrorMsg}). Failing over to ${nextKeyConfig.label}...`,
        );
        continue;
      }
      throw groqError(`AI generation error: ${rawErrorMsg}`, response.status);
    }

    // Extract text content
    const text = responseData.choices?.[0]?.message?.content;
    if (!text?.trim()) {
      keyHealthTracker.set(keyConfig.key, {
        cooldownUntil: Date.now() + 15_000,
        lastFailureReason: "Empty completion returned",
        failedAt: Date.now(),
      });
      failureHistory.push(`${keyConfig.label}: Empty completion returned`);

      if (!isLastKey && nextKeyConfig) {
        console.warn(
          `[Groq AI Failover] ${keyConfig.label} returned empty text. Failing over to ${nextKeyConfig.label}...`,
        );
        continue;
      }
      throw groqError("The AI email generation service returned an empty response. Please retry.", 502);
    }

    // Parse email sequence
    try {
      const cleaned = extractJsonSubstring(text);
      const parsedEmails = parseGeneratedEmails(cleaned);

      // Succeeded! Reset cooldown for this key
      keyHealthTracker.delete(keyConfig.key);

      return parsedEmails;
    } catch (parseErr) {
      const parseMessage = parseErr instanceof Error ? parseErr.message : "Parse error";
      keyHealthTracker.set(keyConfig.key, {
        cooldownUntil: Date.now() + 10_000,
        lastFailureReason: parseMessage,
        failedAt: Date.now(),
      });
      failureHistory.push(`${keyConfig.label}: ${parseMessage}`);

      if (!isLastKey && nextKeyConfig) {
        console.warn(
          `[Groq AI Failover] ${keyConfig.label} returned unparseable sequence (${parseMessage}). Failing over to ${nextKeyConfig.label}...`,
        );
        continue;
      }

      throw groqError("The AI returned an invalid email sequence. Please retry.", 502);
    }
  }

  throw groqError(
    "The AI email generation service is temporarily at peak capacity. Please wait a few moments and try again.",
    503,
  );
}
