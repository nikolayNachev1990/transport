import type { BrokerEvent } from "@transport/core/broker";
import { createCronTracker } from "@transport/core/crons";
import cronsConfig from "../../config/crons.mjs";

// Dynamic imports, not top-level ones — this file is imported by
// config/broker.mts's consumer scan, which resources.mjs's own broker
// creation runs during its top-level await; a top-level import of
// resources.mjs here would deadlock (see auth-service's qrcodes.clear.queue
// for the same pattern).
export default async (_event: BrokerEvent) => {
  const [{ db }, { default: UploadService }] = await Promise.all([
    import("../../resources.mjs"),
    import("../services/upload.service.mjs"),
  ]);
  const cronTracker = createCronTracker(db, cronsConfig.timeoutMinutes);
  const service = new UploadService();

  const cronResult = await cronTracker.addEvent("uploads.clear.queue");
  if (!cronResult) {
    return false;
  }
  await service.clearStaleQueue(cronsConfig.staleQueueHours);
  await cronTracker.completeEvent(cronResult.id);
};
