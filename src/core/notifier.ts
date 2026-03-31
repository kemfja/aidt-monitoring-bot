import { MonitorResult } from '../models/monitor-result';
import { configManager } from '../config';
import { jsonRepository } from '../repositories/json-repository';
import logger from '../utils/logger';

/**
 * Slack 알림 서비스
 */
export class Notifier {
  private slackConfig = configManager.getSlackConfig();

  constructor() {
    // 별도 초기화 불필요
  }

  /**
   * 에러 발생 알림 전송
   */
  async sendErrorAlert(result: MonitorResult): Promise<boolean> {
    // 저장소에서 Webhook URL 가져오기
    const webhookUrl = await jsonRepository.getWebhookUrl();
    const targetUrl = webhookUrl || this.slackConfig.webhookUrl;

    if (!targetUrl) {
      logger.warn('Slack Webhook URL이 설정되지 않음');
      return false;
    }

    const message = await this.generateErrorAlertMessage(result);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        logger.info(`Slack 알림 발송 완료: ${result.urlName}`);
        return true;
      } else {
        logger.error(`Slack 알림 발송 실패: ${result.urlName}`, {
          status: response.status,
        });
        return false;
      }
    } catch (error) {
      logger.error(`Slack 알림 발송 실패: ${result.urlName}`, { error });
      return false;
    }
  }

  /**
   * 여러 에러 결과 일괄 알림
   */
  async sendBatchErrorAlert(results: MonitorResult[]): Promise<boolean> {
    if (results.length === 0) {
      return false;
    }

    // 저장소에서 Webhook URL 가져오기
    const webhookUrl = await jsonRepository.getWebhookUrl();
    const targetUrl = webhookUrl || this.slackConfig.webhookUrl;

    if (!targetUrl) {
      logger.warn('Slack Webhook URL이 설정되지 않음');
      return false;
    }

    const message = await this.generateBatchAlertMessage(results);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        logger.info(`일괄 Slack 알림 발송 완료: ${results.length}개`);
        return true;
      } else {
        logger.error('일괄 Slack 알림 발송 실패', {
          status: response.status,
        });
        return false;
      }
    } catch (error) {
      logger.error('일괄 Slack 알림 발송 실패', { error });
      return false;
    }
  }

  /**
   * 단일 에러 알림 메시지 생성
   */
  private async generateErrorAlertMessage(result: MonitorResult): Promise<any> {
    const statusEmoji = result.status === 'error' ? ':x:' : ':white_check_mark:';
    const statusText = result.status === 'error' ? '에러' : '정상';
    const color = result.status === 'error' ? 'danger' : 'good';

    // URL 조회
    const urlConfig = await jsonRepository.findUrlById(result.urlId);
    const targetUrl = urlConfig?.url || 'N/A';

    return {
      text: `${statusEmoji} [${result.urlName}] ${statusText}`,
      attachments: [
        {
          color: color,
          fields: [
            {
              title: 'URL 이름',
              value: result.urlName,
              short: true,
            },
            {
              title: '상태',
              value: statusText,
              short: true,
            },
            {
              title: '대시보드',
              value: `<${targetUrl}|${result.urlName} 바로가기>`,
              short: false,
            },
            {
              title: '상태 코드',
              value: `${result.statusCode ?? 'N/A'}`,
              short: true,
            },
            {
              title: '응답 시간',
              value: `${result.responseTime}ms`,
              short: true,
            },
            ...(result.errorMessage
              ? [
                  {
                    title: '에러 메시지',
                    value: result.errorMessage,
                    short: false,
                  },
                ]
              : []),
            {
              title: '발생 시간',
              value: new Date(result.timestamp).toLocaleString('ko-KR'),
              short: false,
            },
          ],
        },
      ],
    };
  }

  /**
   * 일괄 에러 알림 메시지 생성
   */
  private async generateBatchAlertMessage(results: MonitorResult[]): Promise<any> {
    const errorCount = results.filter((r) => r.status === 'error').length;

    // 모든 URL 조회
    const urlConfigs = await jsonRepository.findAllUrls();

    return {
      text: `:warning: ${results.length}개 URL 중 ${errorCount}개에서 에러 발생`,
      attachments: [
        {
          color: 'danger',
          fields: results.flatMap((result) => {
            const urlConfig = urlConfigs.find((u) => u.id === result.urlId);
            const targetUrl = urlConfig?.url || 'N/A';

            return [
              {
                title: result.urlName,
                value: `상태: ${result.status === 'error' ? '에러' : '정상'}\n` +
                  `대시보드: <${targetUrl}|바로가기>\n` +
                  `코드: ${result.statusCode ?? 'N/A'}\n` +
                  `시간: ${result.responseTime}ms` +
                  (result.errorMessage ? `\n메시지: ${result.errorMessage}` : ''),
                short: false,
              },
            ];
          }),
        },
        {
          text: `알림 시간: ${new Date().toLocaleString('ko-KR')}`,
        },
      ],
    };
  }
}

export const notifier = new Notifier();
