import { sendDueFollowUps } from "./sendDueFollowUps";
import { processAllPendingQueueItems } from "./emailQueue";

declare global {
  var __leadlensFollowUpScheduler: NodeJS.Timeout | null | undefined;
  var __leadlensEmailQueueScheduler: NodeJS.Timeout | null | undefined;
  var __leadlensSchedulerRunning: boolean | undefined;
  var __leadlensEmailQueueRunning: boolean | undefined;
}

const FOLLOW_UP_CHECK_INTERVAL_MS = 60 * 1000;
const EMAIL_QUEUE_CHECK_INTERVAL_MS = 5 * 1000;

export function startBackgroundFollowUpScheduler() {
  if (typeof window !== "undefined") return; // Only run on server

  if (!global.__leadlensFollowUpScheduler) {
    const runFollowUpTick = async () => {
      if (global.__leadlensSchedulerRunning) return;
      global.__leadlensSchedulerRunning = true;
      try {
        await sendDueFollowUps();
      } catch (err) {
        console.error("[Scheduler] Error sending due follow-ups:", err);
      } finally {
        global.__leadlensSchedulerRunning = false;
      }
    };

    setTimeout(runFollowUpTick, 10000);
    global.__leadlensFollowUpScheduler = setInterval(runFollowUpTick, FOLLOW_UP_CHECK_INTERVAL_MS);
  }

  if (!global.__leadlensEmailQueueScheduler) {
    const runEmailQueueTick = async () => {
      if (global.__leadlensEmailQueueRunning) return;
      global.__leadlensEmailQueueRunning = true;
      try {
        await processAllPendingQueueItems(3);
      } catch (err) {
        console.error("[Scheduler] Error processing queued campaign emails:", err);
      } finally {
        global.__leadlensEmailQueueRunning = false;
      }
    };

    setTimeout(runEmailQueueTick, 1500);
    global.__leadlensEmailQueueScheduler = setInterval(runEmailQueueTick, EMAIL_QUEUE_CHECK_INTERVAL_MS);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[Scheduler] Follow-up scheduler and persistent email queue started.");
  }
}

// Auto-start on server load
startBackgroundFollowUpScheduler();
