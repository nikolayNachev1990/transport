// /health and /ready answer different questions (requirement 3):
// - ready: should this instance receive NEW traffic right now? Flips to
//   false the instant shutdown begins, before anything else happens.
// - healthy: is the process still fundamentally alive and doing its job?
//   Stays true through a graceful shutdown's drain phase — an orchestrator
//   that kill -9'd on the first unhealthy reading would cut off in-flight
//   work exactly when we're trying hardest to finish it cleanly.
export interface HealthState {
  isReady(): boolean;
  isHealthy(): boolean;
}

export interface MutableHealthState extends HealthState {
  setReady(value: boolean): void;
  setHealthy(value: boolean): void;
}

export function createHealthState(): MutableHealthState {
  let ready = false;
  let healthy = true;

  return {
    isReady: () => ready,
    isHealthy: () => healthy,
    setReady: (value: boolean) => {
      ready = value;
    },
    setHealthy: (value: boolean) => {
      healthy = value;
    },
  };
}
