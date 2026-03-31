import { Router } from 'express';
import { configManager } from '../config';
import { jsonRepository } from '../repositories/json-repository';
import logger from '../utils/logger';
import { requireApiKey } from '../middleware/auth';

const router = Router();

/**
 * GET /api/config/webhook - Slack Webhook URL 조회
 */
router.get('/webhook', async (_req, res) => {
  try {
    // 저장소에서 Webhook URL 조회
    const webhookUrl = await jsonRepository.getWebhookUrl();

    // 저장된 URL이 없으면 .env 기본값 사용
    if (!webhookUrl) {
      const slackConfig = configManager.getSlackConfig();
      return res.json({
        success: true,
        data: slackConfig.webhookUrl || ''
      });
    }

    return res.json({
      success: true,
      data: webhookUrl
    });
  } catch (error) {
    logger.error('Webhook URL 조회 실패', { error });
    return res.status(500).json({ success: false, error: '조회 실패' });
  }
});

/**
 * POST /api/config/webhook - Slack Webhook URL 저장
 */
router.post('/webhook', requireApiKey, async (req, res) => {
  try {
    const { webhookUrl } = req.body;

    if (typeof webhookUrl !== 'string') {
      return res.status(400).json({ success: false, error: '잘못된 형식' });
    }

    // Webhook URL 형식 검증 (Slack Webhook URL 패턴)
    if (webhookUrl && !webhookUrl.startsWith('https://hooks.slack.com/')) {
      return res.status(400).json({
        success: false,
        error: '잘못된 Webhook URL 형식. Slack Webhook URL은 https://hooks.slack.com/로 시작해야 합니다.'
      });
    }

    // 저장소에 Webhook URL 저장
    await jsonRepository.saveWebhookUrl(webhookUrl);

    logger.info('Webhook URL 업데이트 완료');

    return res.json({
      success: true,
      message: 'Webhook URL이 저장되었습니다',
      data: webhookUrl
    });
  } catch (error) {
    logger.error('Webhook URL 저장 실패', { error });
    return res.status(500).json({ success: false, error: '저장 실패' });
  }
});

export default router;
