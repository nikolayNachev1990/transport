// Central cron dispatcher: fires scheduled trigger events onto Kafka:
// other services own the actual work and just consume the topic they
// care about (e.g. auth-service's src/qrcode/events/qrcodes.clear.queue.mts).
// core-service doesn't know or care who's listening — see Events/ for the
// producer/consumer wiring per topic.
import cron from "node-cron";
import { broker } from "./resources.mjs";

interface Schedule {
  topic: string;
  expression: string; // standard 5-field cron expression
}

const schedules: Schedule[] = [
  { topic: "qrcodes.clear.queue", expression: "*/30 * * * *" }, // every 30 minutes
  { topic: "userNotificationsSnooze.clear.queue", expression: "*/15 * * * *" }, // every 15 minutes
  { topic: "mobileBlock.cron.cleaning", expression: "*/15 * * * *" }, // every 15 minutes
  { topic: "uploads.clear.queue", expression: "0 * * * *" }, // every hour
  { topic: "company.subscription_expiry.tick", expression: "0 * * * *" }, // every hour
  { topic: "companyMembers.checksum.tick", expression: "0 3 * * *" }, // nightly at 03:00
  { topic: "tick.fleet.compliance.daily", expression: "0 4 * * *" }, // nightly at 04:00
];

export function startCrons(): void {
  for (const schedule of schedules) {
    cron.schedule(schedule.expression, async () => {
      const sent = await broker.send(schedule.topic, {});
      if (!sent) {
        console.log(`core-service: failed to dispatch cron trigger "${schedule.topic}"`);
      }
    });
  }
  console.log(`core-service: ${schedules.length} cron schedule(s) started`);
}
