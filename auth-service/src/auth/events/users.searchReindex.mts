import type { BrokerEvent } from "@transport/core/broker";

// Dynamic import, not a top-level one — see qrcodes.clear.queue.mts for
// why.
export default async (_event: BrokerEvent) => {
  const { default: AuthService } = await import("../services/auth.service.mjs");
  const service = new AuthService();
  await service.searchReindex();
};
