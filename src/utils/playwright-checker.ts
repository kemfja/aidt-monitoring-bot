import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { UrlConfig } from '../models/url-config';
import { SelectorValue } from '../models/monitor-result';
import logger from './logger';

/**
 * Playwright 동적 콘텐츠 체크 결과
 */
export interface PlaywrightCheckResult {
  success: boolean;
  found?: boolean;
  text?: string;
  error?: string;
  collectedValues?: SelectorValue[];
}

/**
 * Playwright 체커 (헤드리스 모드)
 */
export class PlaywrightChecker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * 브라우저 초기화
   */
  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      logger.info('Playwright 브라우저 초기화 완료 (헤드리스 모드)');
    } catch (error) {
      logger.error('Playwright 초기화 실패', { error });
      throw error;
    }
  }

  /**
   * URL 체크 수행
   */
  async checkUrl(config: UrlConfig): Promise<PlaywrightCheckResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      this.context = await this.browser!.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      this.page = await this.context.newPage();

      // 페이지 이동
      await this.page.goto(config.url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Pinpoint 페이지는 클릭 없이 바로 체크
      const isPinpoint = config.url.includes('pinpoint.aidt.ai');

      if (!isPinpoint) {
        // 페이지 로드 대기 (동적 콘텐츠 로딩)
        await this.page.waitForTimeout(3000);

        // 데이터 영역 클릭 및 에러 값 체크 (에듀템 대시보드)
        const clickResult = await this.tryClickDataAreaAndCheck(this.page, config);

        if (!clickResult.success) {
          // 에러 값 발견, 즉시 반환
          return clickResult;
        }

        // 선택자 체크 (에듀템은 tryClickDataAreaAndCheck에서 이미 수집했으므로 병합에서 제외)
        const selectorResult = await this.checkSelector(this.page, config);

        // 에듀템 경로: clickResult의 collectedValues만 사용
        const collectedValues: SelectorValue[] = [
          ...(clickResult.collectedValues || [])
        ];

        const elapsed = Date.now() - startTime;

        logger.info(`Playwright 체크 완료: ${config.name}`, { result: selectorResult, elapsed: `${elapsed}ms` });

        return {
          ...selectorResult,
          collectedValues: collectedValues.length > 0 ? collectedValues : undefined
        };
      } else {
        // Pinpoint는 DOM 로딩 대기
        await this.page.waitForTimeout(2000);
      }

      // 선택자 체크
      const result = await this.checkSelector(this.page, config);
      const elapsed = Date.now() - startTime;

      logger.info(`Playwright 체크 완료: ${config.name}`, { result, elapsed: `${elapsed}ms` });

      return result;

    } catch (error: any) {
      logger.error(`Playwright 체크 실패: ${config.name}`, { error: error?.message || error });
      return {
        success: false,
        error: error?.message || '알 수 없음'
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 데이터 영역 클릭 및 에러 값 체크 (에듀템 대시보드)
   */
  private async tryClickDataAreaAndCheck(page: Page, config: UrlConfig): Promise<PlaywrightCheckResult> {
    try {
      const dataBlocks = page.locator('.u-over');
      const count = await dataBlocks.count();

      if (count === 0) {
        return {
          success: true,
          found: false,
          text: '',
          collectedValues: [{
            type: 'edutem',
            selector: '.css-xfc7jo',
            values: [],
            totalBlocks: 0
          }]
        };
      }

      // 에러 조건 확인
      const conditions = config.errorConditions?.cssSelectorChecks || [];
      const targetCondition = conditions.find(c => c.selector === '.css-xfc7jo');

      if (!targetCondition) {
        // 에러 조건이 없으면 그냥 클릭만 하고 종료
        for (let i = 0; i < count; i++) {
          await dataBlocks.nth(i).click();
          await page.waitForTimeout(50);
        }
        logger.info(`Playwright 데이터 블록 클릭 완료: ${count}개 (에러 조건 없음)`);
        return {
          success: true,
          found: true,
          text: ''
        };
      }

      const expectedValues = targetCondition.expectedValues || [];

      // 각 데이터 블록 클릭 후 툴팅 값 수집
      const collectedTooltips: string[] = [];
      let errorFound = false;
      let errorText = '';

      for (let i = 0; i < count; i++) {
        await dataBlocks.nth(i).click();
        await page.waitForTimeout(200); // 툴팅 로딩 대기

        // 툴팅 값 확인
        const tooltip = await page.locator('.css-xfc7jo').first();
        const tooltipCount = await tooltip.count();

        if (tooltipCount > 0) {
          const text = await tooltip.textContent() || '';
          collectedTooltips.push(text);
          if (expectedValues.includes(text)) {
            logger.info(`Playwright 에러 값 발견: ${text} (블록 ${i + 1})`);
            if (!errorFound) {
              errorFound = true;
              errorText = text;
            }
          }
        } else {
          collectedTooltips.push('');
        }
      }

      logger.info(`Playwright 데이터 블록 클릭 완료: ${count}개 (수집: ${collectedTooltips.length}개)`);

      return {
        success: true,
        found: true,
        text: errorFound ? errorText : '',
        collectedValues: [{
          type: 'edutem',
          selector: '.css-xfc7jo',
          values: collectedTooltips,
          totalBlocks: count
        }]
      };
    } catch (error: any) {
      logger.warn('Playwright 데이터 영역 클릭/체크 오류:', { error });
      return {
        success: false,
        error: error?.message || '클릭/체크 실패'
      };
    }
  }

  /**
   * 선택자 체크
   */
  private async checkSelector(page: Page, config: UrlConfig): Promise<PlaywrightCheckResult> {
    try {
      const conditions = config.errorConditions?.cssSelectorChecks || [];
      const collectedValues: SelectorValue[] = [];

      for (const condition of conditions) {
        const element = await page.locator(condition.selector).first();
        const count = await element.count();

        if (count === 0) {
          collectedValues.push({
            type: 'pinpoint',
            selector: condition.selector,
            value: ''
          });
          return {
            success: true,
            found: false,
            text: '',
            collectedValues
          };
        }

        // 텍스트 가져오기
        const text = await element.first().textContent() || '';

        collectedValues.push({
          type: 'pinpoint',
          selector: condition.selector,
          value: text || ''
        });

        return {
          success: true,
          found: true,
          text: text || '',
          collectedValues
        };
      }

      return {
        success: true,
        found: true,
        text: '',
        collectedValues: collectedValues.length > 0 ? collectedValues : undefined
      };
    } catch (error: any) {
      logger.error('Playwright 선택자 체크 실패', { error: error?.message });
      return {
        success: false,
        error: error?.message || '선택자 체크 실패'
      };
    }
  }

  /**
   * 리소스 정리
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
    } catch (error) {
      logger.warn('Playwright 정리 중 오류:', { error });
    }
  }

  /**
   * 브라우저 종료
   */
  async close(): Promise<void> {
    try {
      await this.cleanup();
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      logger.info('Playwright 브라우저 종료 완료');
    } catch (error) {
      logger.error('Playwright 종료 실패', { error });
    }
  }
}

/**
 * 싱글톤 체커 (헤드리스)
 */
export async function checkWithPlaywright(config: UrlConfig): Promise<PlaywrightCheckResult> {
  const checker = new PlaywrightChecker();

  try {
    await checker.initialize();
    const result = await checker.checkUrl(config);
    return result;
  } finally {
    await checker.close();
  }
}
