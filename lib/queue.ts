import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export const leadDiscoveryQueue = new Queue("lead-discovery", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2, // fail hone par 1 retry
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 }, // 1 hour baad purane completed jobs hatao
    removeOnFail: { age: 86400 },
  },
});

export type LeadDiscoveryJobData = {
  prompt: string;
  userId: string; // job kis user ke liye hai, taake result trace kar sakein
};