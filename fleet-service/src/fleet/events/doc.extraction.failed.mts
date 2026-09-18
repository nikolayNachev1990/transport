import type { BrokerEvent } from "@transport/core/broker";

export default async (event: BrokerEvent) => {
  const { default: ExtractionService } = await import("../services/extraction.service.mjs");
  await new ExtractionService().handleFailed(event);
};
