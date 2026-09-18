import type { BrokerEvent } from "@transport/core/broker";

interface TokenExpire extends BrokerEvent {
  body: {
    device_token: string[];
  };
}

// Dynamic import, not a top-level one — deviceTokenService.mts imports
// resources.mjs, and this file is itself imported by
// config/broker.mts's consumer scan, which resources.mjs's own broker
// creation runs during its top-level await. A top-level import here would
// deadlock: resources.mjs can't finish evaluating until this file
// resolves, and this file can't resolve until resources.mjs finishes.
export default async (event: TokenExpire) => {
  const tokens = event.body.device_token;

  const { default: TokenService } = await import("../services/deviceTokenService.mjs");
  const service = new TokenService();
  await service.deleteExpireToken(tokens);
};
