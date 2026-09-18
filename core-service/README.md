# core-service

Two jobs, both cross-cutting infrastructure rather than business logic:

1. **Kafka topic bootstrap** — on startup, creates every topic declared in
   the shared `Events/` folder that doesn't already exist in Kafka (see
   `src/kafkaAdmin.mts`). Every other service's `broker.send()` call
   refuses to produce to a topic that isn't in its own `Events/` schema
   (a code-level check), but the topic also has to actually exist on the
   Kafka cluster — that's this service's job, not each producer's.
2. **Cron dispatcher** — fires scheduled trigger events onto Kafka; the
   services that actually do the work just consume the topic they care
   about (see `src/cron.mts` for the schedule list, and each consuming
   service's own `src/**/events/<topic>.mts` handler).

REST (`/api/topics/health`, `/api/topics/offsets`) exposes the same two
concerns for manual/ops inspection.
