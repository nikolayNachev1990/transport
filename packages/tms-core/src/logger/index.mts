import pino from "pino";
import { getLogContext } from "./context.mjs";
import { redactSensitive } from "./redact.mjs";
import type { SlackProvider } from "./slack-provider.mjs";

export { runWithContext, getLogContext } from "./context.mjs";
export type { LogContext } from "./context.mjs";
export { createSlackProvider } from "./slack-provider.mjs";
export type { SlackAlert, SlackProvider, SlackProviderOptions } from "./slack-provider.mjs";

export type Logger = pino.Logger;

export interface CreateLoggerOptions {
  // Only fatal-level log calls are forwarded to Slack — this is the
  // "критични" channel from PLAN-backend.md stage 3, not general errors.
  slack?: SlackProvider;
  destination?: pino.DestinationStream;
  level?: pino.LevelWithSilent;
}

function extractLogMessage(args: readonly unknown[]): string {
  const [first, second] = args;
  if (typeof first === "string") {
    return first;
  }
  if (typeof second === "string") {
    return second;
  }
  if (first !== null && typeof first === "object" && "msg" in first && typeof first.msg === "string") {
    return first.msg;
  }
  return "(no message)";
}

export function createLogger(serviceName: string, options: CreateLoggerOptions = {}): Logger {
  const pinoOptions: pino.LoggerOptions = {
    level: options.level ?? "info",
    base: { service: serviceName },
    // No pino `serializers` option here on purpose: our formatters.log runs
    // its own redactSensitive walk first, which would see the raw Error
    // (non-enumerable message/stack) before a registered serializer ever
    // gets a turn. redactSensitive itself special-cases Error instances —
    // see logger/redact.mts.
    mixin(): Record<string, unknown> {
      const context = getLogContext();
      return {
        ...(context.requestId !== undefined && { request_id: context.requestId }),
        ...(context.tenantId !== undefined && { tenant_id: context.tenantId }),
        ...(context.userId !== undefined && { user_id: context.userId }),
        ...(context.role !== undefined && { role: context.role }),
      };
    },
    formatters: {
      log(logObject) {
        return redactSensitive(logObject) as Record<string, unknown>;
      },
    },
  };

  const slack = options.slack;
  if (slack) {
    pinoOptions.hooks = {
      logMethod(args, method, level) {
        if (level === this.levels.values.fatal) {
          const message = extractLogMessage(args);
          void slack.notify({ service: serviceName, message }).catch((slackError: unknown) => {
            method.apply(this, [{ slackError }, "failed to send Slack alert"]);
          });
        }
        return method.apply(this, args);
      },
    };
  }

  return options.destination ? pino(pinoOptions, options.destination) : pino(pinoOptions);
}
