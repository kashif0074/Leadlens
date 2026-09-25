import IORedis from "ioredis";

export const redisConnection = new IORedis(process.env.REDIS_URL || "", {
  maxRetriesPerRequest: null, // BullMQ ki requirement
});