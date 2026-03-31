import fs from 'fs/promises';
import path from 'path';
import { UrlConfig, CreateUrlDto, UpdateUrlDto } from '../models/url-config';
import { MonitorResult } from '../models/monitor-result';
import { configManager } from '../config';

/**
 * JSON 파일 기반 저장소
 */
export class JsonRepository {
  private dataDir: string;
  private urlConfigPath: string;
  private webhookPath: string;

  constructor() {
    this.dataDir = configManager.getDataDir();
    this.urlConfigPath = configManager.getUrlConfigPath();
    this.webhookPath = path.join(this.dataDir, 'webhook.json');
  }

  /**
   * 데이터 디렉토리 초기화
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      // URL 설정 파일이 없으면 빈 배열 생성
      try {
        await fs.access(this.urlConfigPath);
      } catch {
        await fs.writeFile(this.urlConfigPath, JSON.stringify([], null, 2));
      }

      // Webhook 파일이 없으면 빈 문자열 생성
      try {
        await fs.access(this.webhookPath);
      } catch {
        await fs.writeFile(this.webhookPath, JSON.stringify('', null, 2));
      }
    } catch (error) {
      throw new Error(`저장소 초기화 실패: ${error}`);
    }
  }

  // ========== URL 설정 CRUD ==========

  /**
   * 전체 URL 목록 조회
   */
  async findAllUrls(): Promise<UrlConfig[]> {
    try {
      const content = await fs.readFile(this.urlConfigPath, 'utf-8');
      return JSON.parse(content) as UrlConfig[];
    } catch {
      return [];
    }
  }

  /**
   * ID로 URL 조회
   */
  async findUrlById(id: string): Promise<UrlConfig | null> {
    const urls = await this.findAllUrls();
    return urls.find((url) => url.id === id) || null;
  }

  /**
   * URL 생성
   */
  async createUrl(dto: CreateUrlDto): Promise<UrlConfig> {
    const urls = await this.findAllUrls();

    const newUrl: UrlConfig = {
      id: this.generateId(),
      name: dto.name,
      url: dto.url,
      method: dto.method || 'GET',
      errorConditions: dto.errorConditions || {},
      enabled: dto.enabled ?? true,
    };

    urls.push(newUrl);
    await this.saveUrls(urls);

    return newUrl;
  }

  /**
   * URL 수정
   */
  async updateUrl(id: string, dto: UpdateUrlDto): Promise<UrlConfig | null> {
    const urls = await this.findAllUrls();
    const index = urls.findIndex((url) => url.id === id);

    if (index === -1) {
      return null;
    }

    urls[index] = { ...urls[index], ...dto };
    await this.saveUrls(urls);

    return urls[index];
  }

  /**
   * URL 삭제
   */
  async deleteUrl(id: string): Promise<boolean> {
    const urls = await this.findAllUrls();
    const filteredUrls = urls.filter((url) => url.id !== id);

    if (filteredUrls.length === urls.length) {
      return false;
    }

    await this.saveUrls(filteredUrls);
    return true;
  }

  /**
   * URL 목록 저장
   */
  private async saveUrls(urls: UrlConfig[]): Promise<void> {
    await fs.writeFile(this.urlConfigPath, JSON.stringify(urls, null, 2));
  }

  // ========== 모니터링 결과 저장 ==========

  /**
   * 모니터링 결과 저장
   */
  async saveMonitorResult(result: MonitorResult): Promise<void> {
    const date = new Date(result.timestamp);
    const dateStr = this.formatDate(date);
    const filePath = path.join(this.dataDir, `monitoring-${dateStr}.json`);

    let results: MonitorResult[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      results = JSON.parse(content) as MonitorResult[];
    } catch {
      // 파일이 없으면 빈 배열로 시작
    }

    results.push(result);
    await fs.writeFile(filePath, JSON.stringify(results, null, 2));
  }

  /**
   * 날짜 범위로 모니터링 결과 조회
   */
  async findMonitorResults(
    startDate: Date,
    endDate: Date,
    urlId?: string
  ): Promise<MonitorResult[]> {
    const results: MonitorResult[] = [];

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = this.formatDate(currentDate);
      const filePath = path.join(this.dataDir, `monitoring-${dateStr}.json`);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const dayResults = JSON.parse(content) as MonitorResult[];

        if (urlId) {
          results.push(...dayResults.filter((r) => r.urlId === urlId));
        } else {
          results.push(...dayResults);
        }
      } catch {
        // 파일이 없으면 건너뜀
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * 특정 URL의 최근 결과 조회
   */
  async findLatestResults(urlId: string, limit = 10): Promise<MonitorResult[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const results = await this.findMonitorResults(startDate, endDate, urlId);
    return results.slice(0, limit);
  }

  /**
   * 오래된 데이터 삭제 (보관 정책)
   */
  async cleanupOldData(): Promise<void> {
    const retentionDays = configManager.getMonitoringConfig().retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const files = await fs.readdir(this.dataDir);
    const monitoringFiles = files.filter((f) => f.startsWith('monitoring-') && f.endsWith('.json'));

    for (const file of monitoringFiles) {
      const dateStr = file.replace('monitoring-', '').replace('.json', '');
      const fileDate = new Date(dateStr);

      if (fileDate < cutoffDate) {
        const filePath = path.join(this.dataDir, file);
        await fs.unlink(filePath);
      }
    }
  }

  // ========== 유틸리티 ==========

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 날짜 포맷 (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ========== Webhook 관리 ==========

  /**
   * Webhook URL 조회
   */
  async getWebhookUrl(): Promise<string> {
    try {
      const content = await fs.readFile(this.webhookPath, 'utf-8');
      const webhookUrl = JSON.parse(content) as string;
      return webhookUrl || '';
    } catch {
      return '';
    }
  }

  /**
   * Webhook URL 저장
   */
  async saveWebhookUrl(webhookUrl: string): Promise<void> {
    await fs.writeFile(this.webhookPath, JSON.stringify(webhookUrl, null, 2));
  }
}

export const jsonRepository = new JsonRepository();
