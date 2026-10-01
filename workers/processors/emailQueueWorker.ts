import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import { db } from "@/lib/db";
import { processAllPendingQueueItems } from "@/lib/emailQueue";

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

async function runEmailQueueWorker() {
  console.log("[EmailQueueWorker] Started persistent delivery polling.");

  try {
    while (!shuttingDown) {
      try {
        const result = await processAllPendingQueueItems(3);
        if (result.processed > 0) {
          console.log(
            `[EmailQueueWorker] Processed ${result.processed}: ${result.sent} sent, ${result.failed} failed, ${result.pending} pending.`,
          );
        }
      } catch (error) {
        console.error("[EmailQueueWorker] Queue poll failed:", error);
      }

      if (!shuttingDown) await sleep(5000);
    }
  } finally {
    await db.$disconnect();
  }
}

void runEmailQueueWorker();
