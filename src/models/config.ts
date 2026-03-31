export interface Config {
  server: ServerConfig;
  slack: SlackConfig;
  monitoring: MonitoringConfig;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface SlackConfig {
  webhookUrl: string;
}

export interface MonitoringConfig {
  interval: string;
  timeout: number;
  retentionDays: number;
}
