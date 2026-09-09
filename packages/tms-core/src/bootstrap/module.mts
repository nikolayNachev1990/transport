export interface BootstrapModule {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
