import { Router } from 'express';
import { monitoringService } from '../services/monitoring-service';
import { notifier } from '../core/notifier';
import { MonitorResult } from '../models/monitor-result';
import logger from '../utils/logger';
import { requireApiKey } from '../middleware/auth';
import { scheduler } from '../core/scheduler';

const router = Router();

/**
 * GET /api/monitoring/results - 모니터링 기록 조회
 * Query: startDate, endDate, urlId
 */
router.get('/results', async (req, res) => {
  try {
    const { startDate, endDate, urlId } = req.query;

    const results = await monitoringService.findResults(
      startDate as string,
      endDate as string,
      urlId as string
    );

    return res.json({ success: true, data: results });
  } catch (error) {
    logger.error('GET /api/monitoring/results 오류', { error });
    return res.status(500).json({ success: false, error: '모니터링 기록 조회 실패' });
  }
});

/**
 * GET /api/monitoring/status - 현재 상태 요약
 */
router.get('/status', async (_req, res) => {
  try {
    const summary = await monitoringService.getStatusSummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('GET /api/monitoring/status 오류', { error });
    return res.status(500).json({ success: false, error: '상태 요약 조회 실패' });
  }
});

/**
 * GET /api/monitoring/urls - 모든 URL의 현재 상태
 */
router.get('/urls', async (_req, res) => {
  try {
    const statuses = await monitoringService.getAllUrlStatus();
    return res.json({ success: true, data: statuses });
  } catch (error) {
    logger.error('GET /api/monitoring/urls 오류', { error });
    return res.status(500).json({ success: false, error: 'URL 상태 조회 실패' });
  }
});

/**
 * GET /api/monitoring/url/:id/history - 특정 URL의 기록
 */
router.get('/url/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const history = await monitoringService.findUrlHistory(id, limit);
    return res.json({ success: true, data: history });
  } catch (error) {
    logger.error('GET /api/monitoring/url/:id/history 오류', { error });
    return res.status(500).json({ success: false, error: 'URL 기록 조회 실패' });
  }
});

/**
 * POST /api/monitoring/run - 수동 모니터링 실행
 */
router.post('/run', requireApiKey, async (_req, res) => {
  try {
    const result = await monitoringService.triggerManualRun();
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('POST /api/monitoring/run 오류', { error });
    return res.status(500).json({ success: false, error: '모니터링 실행 실패' });
  }
});

/**
 * POST /api/monitoring/test-notification - 테스트 알림 발송
 */
router.post('/test-notification', requireApiKey, async (_req, res) => {
  try {
    // 테스트용 에러 결과 생성
    const testResult: MonitorResult = {
      id: 'test-123',
      urlId: 'test',
      urlName: '테스트 URL',
      status: 'error',
      statusCode: 500,
      responseTime: 1234,
      timestamp: new Date().toISOString(),
      errorMessage: '테스트 에러 메시지: Failed 값이 찍혔습니다.',
    };

    const success = await notifier.sendErrorAlert(testResult);

    if (success) {
      logger.info('테스트 알림 발송 완료');
      return res.json({
        success: true,
        message: '테스트 알림이 발송되었습니다. Slack 채널을 확인해주세요.'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: '알림 발송 실패. Slack Webhook URL을 확인해주세요.'
      });
    }
  } catch (error) {
    logger.error('POST /api/monitoring/test-notification 오류', { error });
    return res.status(500).json({ success: false, error: '테스트 알림 발송 실패' });
  }
});

/**
 * GET /api/monitoring/scheduler/status - 스케줄러 활성화 상태 조회
 */
router.get('/scheduler/status', async (_req, res) => {
  try {
    return res.json({ success: true, data: { active: scheduler.isActive() } });
  } catch (error) {
    logger.error('GET /api/monitoring/scheduler/status 오류', { error });
    return res.status(500).json({ success: false, error: '스케줄러 상태 조회 실패' });
  }
});

/**
 * POST /api/monitoring/scheduler/toggle - 스케줄러 ON/OFF 토글
 */
router.post('/scheduler/toggle', requireApiKey, async (req, res) => {
  try {
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'active 값(boolean)이 필요합니다' });
    }

    if (active) {
      await scheduler.startAndWait();
    } else {
      scheduler.stop();
    }

    logger.info(`스케줄러 ${active ? '시작' : '중지'} (대시보드에서 토글)`);
    return res.json({ success: true, data: { active: scheduler.isActive() } });
  } catch (error) {
    logger.error('POST /api/monitoring/scheduler/toggle 오류', { error });
    return res.status(500).json({ success: false, error: '스케줄러 상태 변경 실패' });
  }
});

/**
 * POST /api/monitoring/test-check - 실제 URL 체크 후 에러 알림 발송
 * Query: urlId (선택 - 없으면 전체 체크)
 */
router.post('/test-check', requireApiKey, async (req, res) => {
  try {
    const { urlId } = req.query;
    const { monitor } = await import('../core/monitor');
    const { jsonRepository } = await import('../repositories/json-repository');

    const urls = await jsonRepository.findAllUrls();
    const targetUrls = urlId ? urls.filter((u: any) => u.id === urlId) : urls;

    if (targetUrls.length === 0) {
      return res.status(404).json({
        success: false,
        error: urlId ? '해당 URL을 찾을 수 없습니다' : '모니터링 대상 URL이 없습니다'
      });
    }

    // 모니터링 실행
    const results = await monitor.checkUrls(targetUrls);

    // 결과 저장
    for (const result of results) {
      await jsonRepository.saveMonitorResult(result);
    }

    // 에러 결과만 알림
    const errorResults = results.filter((r: any) => r.status === 'error');
    let alertSent = 0;

    for (const error of errorResults) {
      const success = await notifier.sendErrorAlert(error);
      if (success) alertSent++;
    }

    return res.json({
      success: true,
      message: `체크 완료: ${results.length}개, 에러: ${errorResults.length}개, 알림 발송: ${alertSent}개`,
      data: {
        total: results.length,
        success: results.length - errorResults.length,
        error: errorResults.length,
        alertsSent: alertSent,
        results: results.map((r: any) => ({
          name: r.urlName,
          status: r.status,
          errorMessage: r.errorMessage
        }))
      }
    });
  } catch (error) {
    logger.error('POST /api/monitoring/test-check 오류', { error });
    return res.status(500).json({ success: false, error: '테스트 체크 실패' });
  }
});

export default router;
