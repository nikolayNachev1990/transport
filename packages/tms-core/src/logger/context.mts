import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

// Never merges with an outer context — each Kafka message/BullMQ job/HTTP request must call this with its own values.
export function runWithContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}
