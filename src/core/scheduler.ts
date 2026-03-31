import cron from 'node-cron';
import { monitor } from './monitor';
import { notifier } from './notifier';
import { jsonRepository } from '../repositories/json-repository';
import { configManager } from '../config';
import logger from '../utils/logger';

/**
 * 스케줄러 관리
 */
export class Scheduler {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * 스케줄러 시작 (초기 실행 비동기, 서버 시작 시 사용)
   */
  start(): void {
    if (this.task) {
      logger.warn('이미 실행 중인 스케줄러가 있습니다');
      return;
    }

    this.setupCron();

    // 시작 시 즉시 실행 (비동기)
    this.runMonitoring().catch((error) => {
      logger.error('초기 모니터링 실행 실패', { error });
    });
  }

  /**
   * 스케줄러 시작 및 즉시 실행 (완료 대기, 토글 ON 시 사용)
   */
  async startAndWait(): Promise<void> {
    if (this.task) {
      logger.warn('이미 실행 중인 스케줄러가 있습니다');
      return;
    }

    this.setupCron();

    // 시작 시 즉시 실행 (완료까지 대기)
    await this.runMonitoring();
  }

  /**
   * cron 태스크 설정
   */
  private setupCron(): void {
    const interval = configManager.getMonitoringConfig().interval;

    this.task = cron.schedule(interval, async () => {
      await this.runMonitoring();
    });

    logger.info(`스케줄러 시작: ${interval}`);
  }

  /**
   * 스케줄러 중지
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('스케줄러 중지');
    }
  }

  /**
   * 모니터링 실행
   */
  async runMonitoring(): Promise<void> {
    if (this.isRunning) {
      logger.warn('이미 모니터링이 실행 중입니다');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('모니터링 실행 시작');

      // URL 설정 조회
      const urls = await jsonRepository.findAllUrls();

      if (urls.length === 0) {
        logger.info('모니터링 대상 URL이 없습니다');
        return;
      }

      // 모든 URL 체크
      const results = await monitor.checkUrls(urls);

      // 결과 저장
      for (const result of results) {
        await jsonRepository.saveMonitorResult(result);
      }

      // 에러 결과만 필터링
      const errorResults = results.filter((r) => r.status === 'error');

      if (errorResults.length > 0) {
        logger.info(`에러 ${errorResults.length}건 발생, 알림 전송`);

        // 개별 알림 전송
        for (const error of errorResults) {
          await notifier.sendErrorAlert(error);
        }
      }

      logger.info(`모니터링 완료: 전체 ${results.length}건, 성공 ${results.length - errorResults.length}건, 에러 ${errorResults.length}건`);

      // 오래된 데이터 정리 (매일 자정에 근접한 시간에 실행)
      await this.cleanupIfNeeded();
    } catch (error) {
      logger.error('모니터링 실행 중 오류 발생', { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 수동 모니터링 실행 (외부 호출용)
   */
  async runOnce(): Promise<void> {
    await this.runMonitoring();
  }

  /**
   * 데이터 정리 (매일 한 번만 실행)
   */
  private lastCleanupDate: string | null = null;

  private async cleanupIfNeeded(): Promise<void> {
    const today = new Date().toDateString();

    if (this.lastCleanupDate !== today) {
      try {
        await jsonRepository.cleanupOldData();
        this.lastCleanupDate = today;
        logger.info('오래된 데이터 정리 완료');
      } catch (error) {
        logger.error('데이터 정리 실패', { error });
      }
    }
  }

  /**
   * 실행 상태 확인
   */
  isActive(): boolean {
    return this.task !== null;
  }

  /**
   * 현재 실행 중 여부 확인
   */
  isMonitorRunning(): boolean {
    return this.isRunning;
  }
}

export const scheduler = new Scheduler();
