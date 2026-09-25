import { Worker } from "bullmq";
import { redisConnection } from "./redis";
import { discoverCompaniesFromPrompt } from "./leads";
import { db } from "./db";
import type { LeadDiscoveryJobData } from "./queue";

export const leadDiscoveryWorker = new Worker<LeadDiscoveryJobData>(
  "lead-discovery",
  async (job) => {
    const { prompt, userId } = job.data;

    await job.updateProgress(10);

    const result = await discoverCompaniesFromPrompt(prompt);

    await job.updateProgress(100);

    // Job result ko ek JobResult table mein save karein taake frontend poll kar sake
    await db.jobResult.create({
      data: {
        jobId: job.id!,
        userId,
        status: "completed",
        totalFound: result.totalFound,
        savedCount: result.leads.length,
      },
    });

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 2, // ek time pe max 2 jobs process karein (rate-limit safe)
  }
);

leadDiscoveryWorker.on("failed", async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
  if (job) {
    await db.jobResult.create({
      data: {
        jobId: job.id!,
        userId: job.data.userId,
        status: "failed",
        totalFound: 0,
        savedCount: 0,
      },
    });
  }
});