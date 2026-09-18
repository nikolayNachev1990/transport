import type { BrokerEvent } from "@transport/core/broker";

interface UserActivated extends BrokerEvent {
  body: {
    id: string;
  };
}

// Dynamic import, not a top-level one — same deadlock reasoning as
// company.requested.mts.
export default async (event: UserActivated) => {
  const { default: MemberService } = await import("../services/member.service.mjs");
  const service = new MemberService();
  await service.activate(event.body.id);
};
