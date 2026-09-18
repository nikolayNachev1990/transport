import type { BrokerEvent } from "@transport/core/broker";
import { createCronTracker } from "@transport/core/crons";
import cronsConfig from "../../config/crons.mjs";

// Dynamic imports, not top-level ones — see qrcode/events/qrcodes.clear.queue.mts
// for why.
export default async (_event: BrokerEvent) => {
  const [{ db }, { default: NotificationService }, { default: AuthService }] = await Promise.all([
    import("../../resources.mjs"),
    import("../services/notifications.service.mjs"),
    import("../../auth/services/auth.service.mjs"),
  ]);
  const cronTracker = createCronTracker(db, cronsConfig.timeoutMinutes);
  const authService = new AuthService();
  const service = new NotificationService(authService);

  const cronResult = await cronTracker.addEvent("userNotificationsSnooze.clear.queue");
  if (!cronResult) {
    return false;
  }
  await service.queueDelete();
  await cronTracker.completeEvent(cronResult.id);
};
