import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import { db } from "@/lib/db";
import { processAllPendingQueueItems } from "@/lib/emailQueue";
import http from "http";

const PORT = process.env.PORT || 3001;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Worker is alive");
}).listen(PORT, () => {
  console.log(`Health-check server listening on port ${PORT}`);
});

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
