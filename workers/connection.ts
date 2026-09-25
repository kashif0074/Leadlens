import "dotenv/config";
import { Redis } from "ioredis";

function getRedisUrl() {
  const configuredUrl = process.env.REDIS_URL?.trim().replace(/^["']|["']$/g, "");

  if (!configuredUrl) {
    throw new Error(
      "REDIS_URL is required. Set it to a Redis TCP URL in .env.",
    );
  }

  let redisUrl: URL;
  try {
    redisUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      "REDIS_URL is invalid. Use redis:// for local Redis or rediss:// for TLS.",
    );
  }

  if (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") {
    throw new Error(
      "REDIS_URL must use the redis:// or rediss:// protocol.",
    );
  }

  if (!redisUrl.username || !redisUrl.password) {
    throw new Error(
      "REDIS_URL must include the Redis username and password/token.",
    );
  }

  if (redisUrl.password === "******" || redisUrl.password.length < 16) {
    throw new Error(
      "REDIS_URL contains an invalid or redacted Redis token. Generate a new Upstash token and update .env.",
    );
  }

  // Upstash Redis TCP endpoints require TLS. The Upstash dashboard may show a
  // redis:// URL alongside a --tls redis-cli command, so normalize that form.
  if (
    redisUrl.protocol === "redis:" &&
    redisUrl.hostname.endsWith(".upstash.io")
  ) {
    redisUrl.protocol = "rediss:";
  }

  return redisUrl;
}

const redisUrl = getRedisUrl();
const redisOptions = {
  maxRetriesPerRequest: null,
  connectTimeout: 10_000,
  ...(redisUrl.protocol === "rediss:"
    ? { tls: { servername: redisUrl.hostname } }
    : {}),
};

export const connection = new Redis(redisUrl.toString(), redisOptions);