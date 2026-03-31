import axios, { AxiosError } from 'axios';
import { UrlConfig } from '../models/url-config';
import { configManager } from '../config';
import { htmlParser } from './html-parser';

/**
 * HTTP 응답 결과
 */
export interface HttpResponse {
  statusCode: number;
  responseTime: number;
  data?: string;
  error?: string;
}

/**
 * HTTP 클라이언트 유틸
 */
export class HttpClient {
  private timeout: number;

  constructor() {
    this.timeout = configManager.getMonitoringConfig().timeout;
  }

  /**
   * URL 체크 실행
   */
  async checkUrl(config: UrlConfig): Promise<HttpResponse> {
    const startTime = Date.now();

    try {
      const response = await axios({
        method: config.method,
        url: config.url,
        timeout: this.timeout,
        validateStatus: () => true, // 모든 상태 코드 수신
        responseType: 'text',
      });

      const responseTime = Date.now() - startTime;

      return {
        statusCode: response.status,
        responseTime,
        data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response) {
          return {
            statusCode: axiosError.response.status,
            responseTime,
            data: axiosError.response.data as string,
          };
        }

        if (axiosError.code === 'ECONNABORTED') {
          return {
            statusCode: 0,
            responseTime,
            error: '요청 시간 초과',
          };
        }

        return {
          statusCode: 0,
          responseTime,
          error: axiosError.message,
        };
      }

      return {
        statusCode: 0,
        responseTime,
        error: '알 수 없는 오류',
      };
    }
  }

  /**
   * 에러 조건 검증
   */
  validateErrorConditions(
    response: HttpResponse,
    config: UrlConfig
  ): { isValid: boolean; errorMessage?: string; statusCode: number; responseTime: number } {
    const { expectedStatusCodes, maxResponseTime, errorKeywords, cssSelectorChecks } = config.errorConditions;

    // 상태 코드 검증
    if (expectedStatusCodes && expectedStatusCodes.length > 0) {
      if (!expectedStatusCodes.includes(response.statusCode)) {
        return {
          isValid: false,
          statusCode: response.statusCode,
          responseTime: response.responseTime,
          errorMessage: `예상하지 않은 상태 코드: ${response.statusCode} (예상: ${expectedStatusCodes.join(', ')})`,
        };
      }
    }

    // 응답 시간 검증
    if (maxResponseTime && response.responseTime > maxResponseTime) {
      return {
        isValid: false,
        statusCode: response.statusCode,
        responseTime: response.responseTime,
        errorMessage: `응답 시간 초과: ${response.responseTime}ms (최대: ${maxResponseTime}ms)`,
      };
    }

    // 에러 키워드 검증
    if (errorKeywords && errorKeywords.length > 0 && response.data) {
      for (const keyword of errorKeywords) {
        if (response.data.includes(keyword)) {
          return {
            isValid: false,
            statusCode: response.statusCode,
            responseTime: response.responseTime,
            errorMessage: `에러 키워드 발견: "${keyword}"`,
          };
        }
      }
    }

    // CSS 선택자 체크
    if (cssSelectorChecks && cssSelectorChecks.length > 0 && response.data) {
      const checkResults = htmlParser.checkSelectors(response.data, cssSelectorChecks);

      for (const result of checkResults) {
        if (!result.isValid) {
          return {
            isValid: false,
            statusCode: response.statusCode,
            responseTime: response.responseTime,
            errorMessage: `CSS 선택자 체크 실패: ${result.errorMessage} (${result.selector})`,
          };
        }
      }
    }

    return { isValid: true, statusCode: response.statusCode, responseTime: response.responseTime };
  }
}

export const httpClient = new HttpClient();
