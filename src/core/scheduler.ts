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
  private lastRunTime: number = Date.now();
  private wakeUpTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number | null = null;

  /**
   * 스케줄러 시작 (초기 실행 비동기, 서버 시작 시 사용)
   */
  start(): void {
    if (this.task) {
      logger.warn('이미 실행 중인 스케줄러가 있습니다');
      return;
    }

    this.setupCron();
    this.startWakeUpDetector();

    // 서버 시작 시 놓친 실행 복구
    this.recoverMissedRun().then(() => {
      // 복구에서 실행되지 않았으면 초기 실행
      if (Date.now() - this.lastRunTime > 60 * 1000) {
        this.runMonitoring(true).catch((error) => {
          logger.error('초기 모니터링 실행 실패', { error });
        });
      }
    }).catch((error) => {
      logger.error('놓친 실행 복구 실패', { error });
      // 복구 실패 시 초기 실행
      this.runMonitoring(true).catch((err) => {
        logger.error('초기 모니터링 실행 실패', { error: err });
      });
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
    this.startWakeUpDetector();

    // 시작 시 즉시 실행 (완료까지 대기)
    await this.runMonitoring(true);
  }

  /**
   * cron 태스크 설정
   */
  private setupCron(): void {
    const interval = configManager.getMonitoringConfig().interval;

    this.task = cron.schedule(interval, async () => {
      await this.runMonitoring(false);
    });

    logger.info(`스케줄러 시작: ${interval}`);
  }

  /**
   * 절전 복귀 감지 (30초 간격 tick)
   * 갭이 2분 이상이면 절전 복귀로 판단하여 놓친 모니터링 실행
   */
  private startWakeUpDetector(): void {
    if (this.wakeUpTimer) {
      return;
    }

    this.lastTickTime = Date.now();

    this.wakeUpTimer = setInterval(() => {
      const now = Date.now();
      const gap = now - (this.lastTickTime ?? now);

      // 갭이 2분 이상이면 절전/잠금 복귀로 판단
      if (gap > 2 * 60 * 1000) {
        const gapMinutes = Math.round(gap / 60000);
        logger.info(`절전 복귀 감지 (약 ${gapMinutes}분 대기)`);

        // 마지막 모니터링이 cron 주기(60분) + 버퍼(5분) 전이면 즉시 실행
        const elapsedSinceLastRun = now - this.lastRunTime;
        if (elapsedSinceLastRun > 60 * 60 * 1000) {
          logger.info('절전 복귀로 인해 놓친 모니터링 실행');
          this.runMonitoring(false).catch((error) => {
            logger.error('절전 복귀 모니터링 실행 실패', { error });
          });
        } else {
          logger.info(`마지막 실행으로 ${Math.round(elapsedSinceLastRun / 60000)}분 경과, 아직 실행 주기 아님`);
        }
      }

      this.lastTickTime = now;
    }, 30 * 1000);
  }

  /**
   * 서버 시작 시 놓친 실행 복구
   * 파일에서 마지막 실행 시간을 읽어 cron 주기 초과 시 즉시 실행
   */
  private async recoverMissedRun(): Promise<void> {
    const lastRunStr = await jsonRepository.getLastMonitorRun();
    if (!lastRunStr) {
      logger.info('이전 실행 기록 없음, 초기 실행 진행');
      return;
    }

    const lastRun = new Date(lastRunStr).getTime();
    this.lastRunTime = lastRun;

    const elapsed = Date.now() - lastRun;
    const elapsedMinutes = Math.round(elapsed / 60000);

    logger.info(`이전 모니터링 실행: ${elapsedMinutes}분 전`);

    if (elapsed > 60 * 60 * 1000) {
      logger.info(`서버 재시작 후 놓친 실행 감지 (${elapsedMinutes}분 전 실행), 즉시 실행`);
      await this.runMonitoring(true);
    }
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

    if (this.wakeUpTimer) {
      clearInterval(this.wakeUpTimer);
      this.wakeUpTimer = null;
      this.lastTickTime = null;
    }
  }

  /**
   * 모니터링 실행
   * @param isStartup true: 서버 시작 시 (전체 시간 범위), false: 정시/복구 (축소 범위)
   */
  async runMonitoring(isStartup = false): Promise<void> {
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
      const results = await monitor.checkUrls(urls, isStartup);

      // 결과 저장
      for (const result of results) {
        await jsonRepository.saveMonitorResult(result);
      }

      // 에러/경고 결과 필터링
      const errorResults = results.filter((r) => r.status === 'error');
      const warningResults = results.filter((r) => r.status === 'warning');
      const alertResults = [...errorResults, ...warningResults];

      if (alertResults.length > 0) {
        logger.info(`에러 ${errorResults.length}건, 경고 ${warningResults.length}건 발생, 알림 전송`);

        // 개별 알림 전송
        for (const alert of alertResults) {
          await notifier.sendAlert(alert);
        }
      }

      logger.info(`모니터링 완료: 전체 ${results.length}건, 성공 ${results.length - errorResults.length - warningResults.length}건, 에러 ${errorResults.length}건, 경고 ${warningResults.length}건`);

      // 실행 시간 기록
      this.lastRunTime = Date.now();
      await jsonRepository.saveLastMonitorRun();

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
    await this.runMonitoring(false);
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
