import { Config } from '../models/config';
import path from 'path';

/**
 * 애플리케이션 설정 관리
 */
class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * 설정 로드 (환경 변수 우선 적용)
   */
  private loadConfig(): Config {
    return {
      server: {
        port: parseInt(process.env.PORT || '11111', 10),
        host: process.env.HOST || '0.0.0.0',
      },
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
      },
      monitoring: {
        interval: process.env.MONITORING_INTERVAL || '0 * * * *',
        timeout: parseInt(process.env.MONITORING_TIMEOUT || '30000', 10),
        retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
      },
    };
  }

  /**
   * 전체 설정 반환
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * 서버 설정 반환
   */
  getServerConfig() {
    return this.config.server;
  }

  /**
   * Slack 설정 반환
   */
  getSlackConfig() {
    return this.config.slack;
  }

  /**
   * 모니터링 설정 반환
   */
  getMonitoringConfig() {
    return this.config.monitoring;
  }

  /**
   * 데이터 파일 경로 반환
   */
  getDataDir(): string {
    return process.env.DATA_DIR || path.join(process.cwd(), 'data');
  }

  /**
   * URL 설정 파일 경로
   */
  getUrlConfigPath(): string {
    return path.join(this.getDataDir(), 'config.json');
  }
}

export const configManager = new ConfigManager();
