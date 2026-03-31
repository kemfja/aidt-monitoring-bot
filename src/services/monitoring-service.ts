import { MonitorResult, UrlStatus, MonitorResultSummary } from '../models/monitor-result';
import { jsonRepository } from '../repositories/json-repository';
import { urlService } from './url-service';
import logger from '../utils/logger';

/**
 * 모니터링 서비스
 */
export class MonitoringService {
  /**
   * 날짜 범위로 결과 조회
   */
  async findResults(
    startDate?: string,
    endDate?: string,
    urlId?: string
  ): Promise<MonitorResult[]> {
    try {
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      return await jsonRepository.findMonitorResults(start, end, urlId);
    } catch (error) {
      logger.error('모니터링 결과 조회 실패', { startDate, endDate, urlId, error });
      throw error;
    }
  }

  /**
   * 특정 URL의 최근 결과 조회
   */
  async findUrlHistory(urlId: string, limit = 100): Promise<MonitorResult[]> {
    try {
      return await jsonRepository.findLatestResults(urlId, limit);
    } catch (error) {
      logger.error('URL 기록 조회 실패', { urlId, error });
      throw error;
    }
  }

  /**
   * 현재 상태 요약 조회
   */
  async getStatusSummary(): Promise<MonitorResultSummary> {
    try {
      const urls = await urlService.findAll();
      const enabledUrls = urls.filter((u) => u.enabled);

      // 최근 24시간 결과 조회
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const results = await jsonRepository.findMonitorResults(yesterday, new Date());

      const total = results.length;
      const success = results.filter((r) => r.status === 'success').length;
      const error = results.filter((r) => r.status === 'error').length;

      const avgResponseTime =
        total > 0 ? results.reduce((sum, r) => sum + r.responseTime, 0) / total : 0;

      const lastChecked = results.length > 0 ? results[0].timestamp : undefined;

      return {
        total: enabledUrls.length,
        success,
        error,
        avgResponseTime: Math.round(avgResponseTime),
        lastChecked,
      };
    } catch (error) {
      logger.error('상태 요약 조회 실패', { error });
      throw error;
    }
  }

  /**
   * 모든 URL의 현재 상태 조회
   */
  async getAllUrlStatus(): Promise<UrlStatus[]> {
    try {
      const urls = await urlService.findAll();
      const statuses: UrlStatus[] = [];

      for (const url of urls) {
        const history = await jsonRepository.findLatestResults(url.id, 1);

        if (history.length > 0) {
          const latest = history[0];

          // 최근 10건 평균 응답 시간
          const recentResults = await jsonRepository.findLatestResults(url.id, 10);
          const avgResponseTime =
            recentResults.length > 0
              ? recentResults.reduce((sum, r) => sum + r.responseTime, 0) / recentResults.length
              : 0;

          statuses.push({
            urlId: url.id,
            name: url.name,
            url: url.url,
            status: latest.status,
            lastChecked: latest.timestamp,
            lastStatusCode: latest.statusCode,
            avgResponseTime: Math.round(avgResponseTime),
          });
        } else {
          statuses.push({
            urlId: url.id,
            name: url.name,
            url: url.url,
            status: 'pending',
          });
        }
      }

      return statuses;
    } catch (error) {
      logger.error('URL 상태 조회 실패', { error });
      throw error;
    }
  }

  /**
   * 수동 모니터링 실행 트리거
   */
  async triggerManualRun(): Promise<{ message: string }> {
    try {
      const { scheduler } = await import('../core/scheduler');
      await scheduler.runOnce();
      return { message: '모니터링 실행이 시작되었습니다' };
    } catch (error) {
      logger.error('수동 모니터링 실행 실패', { error });
      throw error;
    }
  }
}

export const monitoringService = new MonitoringService();
