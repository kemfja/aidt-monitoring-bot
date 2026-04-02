import { UrlConfig } from '../models/url-config';
import { MonitorResult, GrafanaCheckDetail } from '../models/monitor-result';
import { httpClient } from '../utils/http-client';
import { checkWithPlaywright } from '../utils/playwright-checker';
import type { PlaywrightCheckResult } from '../utils/playwright-checker';
import { checkGrafanaApi } from '../utils/grafana-checker';
import logger from '../utils/logger';

/**
 * 모니터링 코어 로직
 */
export class Monitor {
  /**
   * 단일 URL 체크 실행
   */
  async checkUrl(config: UrlConfig): Promise<MonitorResult> {
    const timestamp = new Date().toISOString();

    logger.info(`URL 체크 시작: ${config.name} (${config.url})`);

    // Grafana API 체크가 있으면 직접 API 호출
    const hasGrafanaApiCheck = !!config.errorConditions?.grafanaApiCheck;
    // CSS 선택자 체크가 있으면 Playwright 사용 (동적 콘텐츠)
    const hasCssSelectorCheck = config.errorConditions?.cssSelectorChecks &&
      config.errorConditions.cssSelectorChecks.length > 0;

    let validation;
    let playwrightResult: PlaywrightCheckResult | undefined;
    let grafanaCheckDetail: GrafanaCheckDetail | undefined;

    if (hasGrafanaApiCheck) {
      // Grafana API 직접 체크
      const grafanaResult = await checkGrafanaApi(config);
      validation = {
        isValid: grafanaResult.isValid,
        errorMessage: grafanaResult.errorMessage,
        statusCode: 200,
        responseTime: grafanaResult.responseTime,
      };
      grafanaCheckDetail = grafanaResult.grafanaCheckDetail;
    } else if (hasCssSelectorCheck) {
      // Playwright 동적 체크
      playwrightResult = await checkWithPlaywright(config);

      if (!playwrightResult.success) {
        // Playwright 실행 실패
        const result: MonitorResult = {
          id: this.generateId(),
          urlId: config.id,
          urlName: config.name,
          timestamp,
          status: 'error',
          statusCode: 0,
          responseTime: 0,
          errorMessage: 'Playwright 체크 실패',
        };
        return result;
      }

      // Playwright 결과를 검증
      validation = this.validatePlaywrightResult(playwrightResult, config);
    } else {
      // 일반 HTTP 체크
      const response = await httpClient.checkUrl(config);
      validation = httpClient.validateErrorConditions(response, config);
    }

    const result: MonitorResult = {
      id: this.generateId(),
      urlId: config.id,
      urlName: config.name,
      timestamp,
      status: validation.isValid ? 'success' : 'error',
      statusCode: validation.statusCode ?? 200,
      responseTime: validation.responseTime ?? 0,
      errorMessage: validation.errorMessage,
      selectorValues: playwrightResult?.collectedValues,
      checkedUrl: playwrightResult?.checkedUrl,
      grafanaCheckDetail,
    };

    if (result.status === 'error') {
      logger.error(`URL 체크 실패: ${config.name}`, {
        url: config.url,
        statusCode: result.statusCode,
        errorMessage: result.errorMessage,
        responseTime: result.responseTime,
      });
    } else {
      logger.info(`URL 체크 성공: ${config.name}`, {
        statusCode: result.statusCode,
        responseTime: result.responseTime,
      });
    }

    return result;
  }

  /**
   * Playwright 결과 검증
   */
  private validatePlaywrightResult(playwrightResult: any, config: UrlConfig) {
    const conditions = config.errorConditions?.cssSelectorChecks || [];

    for (const condition of conditions) {
      const { checkType, expectedValues, errorMessage } = condition;

      if (!playwrightResult.found) {
        return {
          isValid: false,
          statusCode: 200,
          responseTime: playwrightResult.responseTime || 0,
          errorMessage: `선택자를 찾을 수 없음: ${condition.selector}`
        };
      }

      const text = playwrightResult.text || '';

      switch (checkType) {
        case 'anyOf':
          if (expectedValues && expectedValues.includes(text)) {
            return {
              isValid: false,
              statusCode: 200,
              responseTime: playwrightResult.responseTime || 0,
              errorMessage: errorMessage || `에러 값 발견: ${text}`
            };
          }
          break;
        case 'noneOf':
          if (expectedValues && expectedValues.includes(text)) {
            return {
              isValid: false,
              statusCode: 200,
              responseTime: playwrightResult.responseTime || 0,
              errorMessage: errorMessage || `에러 값 발견: ${text}`
            };
          }
          break;
        case 'equals':
          if (expectedValues && text === expectedValues[0]) {
            return {
              isValid: false,
              statusCode: 200,
              responseTime: playwrightResult.responseTime || 0,
              errorMessage: errorMessage || `에러 값 발견: ${text}`
            };
          }
          break;
        case 'notEquals':
          if (expectedValues && text !== expectedValues[0]) {
            return {
              isValid: false,
              statusCode: 200,
              responseTime: playwrightResult.responseTime || 0,
              errorMessage: errorMessage || `에러 값 발견: ${text}`
            };
          }
          break;
      }
    }

    // 에러 키워드 체크도 병행 (있는 경우)
    const errorKeywords = config.errorConditions?.errorKeywords || [];
    if (errorKeywords.length > 0 && playwrightResult.text) {
      for (const keyword of errorKeywords) {
        if (playwrightResult.text.includes(keyword)) {
          return {
            isValid: false,
            statusCode: 200,
            responseTime: playwrightResult.responseTime || 0,
            errorMessage: `에러 키워드 발견: ${keyword}`
          };
        }
      }
    }

    return {
      isValid: true,
      statusCode: 200,
      responseTime: playwrightResult.responseTime || 0
    };
  }

  /**
   * 여러 URL 일괄 체크
   */
  async checkUrls(configs: UrlConfig[]): Promise<MonitorResult[]> {
    const results: MonitorResult[] = [];

    // 활성화된 URL만 체크
    const enabledConfigs = configs.filter((c) => c.enabled);

    for (const config of enabledConfigs) {
      try {
        const result = await this.checkUrl(config);
        results.push(result);
      } catch (error) {
        logger.error(`URL 체크 중 예외 발생: ${config.name}`, { error });
        results.push({
          id: this.generateId(),
          urlId: config.id,
          urlName: config.name,
          timestamp: new Date().toISOString(),
          status: 'error',
          responseTime: 0,
          errorMessage: `체크 중 예외 발생: ${error}`,
        });
      }
    }

    return results;
  }

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const monitor = new Monitor();
