import type { BrokerEvent } from "@transport/core/broker";

// Dynamic import, not a top-level one — see qrcodes.clear.queue.mts for
// why (sms.service.mts imports resources.mjs, and this file is itself
// imported during resources.mjs's own top-level broker creation).
export default async (_event: BrokerEvent) => {
  const { default: SmsService } = await import("../services/sms.service.mjs");
  const service = new SmsService();
  await service.clean();
};
