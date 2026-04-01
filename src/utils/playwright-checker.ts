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
 * 공유 브라우저 인스턴스 (재사용하여 launch/close 반복 방지)
 */
let sharedBrowser: Browser | null = null;

/**
 * 공유 브라우저 반환 (없으면 생성)
 */
async function getSharedBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    logger.info('Playwright 공유 브라우저 초기화 완료');
  }
  return sharedBrowser;
}

/**
 * 공유 브라우저 종료
 */
export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch { /* 이미 종료된 경우 무시 */ }
    sharedBrowser = null;
    logger.info('Playwright 공유 브라우저 종료 완료');
  }
}

/**
 * 단일 URL 체크 (공유 브라우저 사용)
 */
export async function checkWithPlaywright(config: UrlConfig): Promise<PlaywrightCheckResult> {
  const browser = await getSharedBrowser();
  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    const startTime = Date.now();

    // 페이지 이동
    await page.goto(config.url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const isPinpoint = config.url.includes('pinpoint.aidt.ai');

    if (!isPinpoint) {
      // 페이지 로드 대기 (동적 콘텐츠 로딩)
      await page.waitForTimeout(3000);

      // 데이터 영역 클릭 및 에러 값 체크 (에듀템 대시보드)
      const clickResult = await tryClickDataAreaAndCheck(page, config);

      if (!clickResult.success) {
        return clickResult;
      }

      // 선택자 체크
      const selectorResult = await checkSelector(page, config);

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
      await page.waitForTimeout(2000);
    }

    // 선택자 체크
    const result = await checkSelector(page, config);
    const elapsed = Date.now() - startTime;

    logger.info(`Playwright 체크 완료: ${config.name}`, { result, elapsed: `${elapsed}ms` });

    return result;
  } catch (error: any) {
    logger.error(`Playwright 체크 실패: ${config.name}`, { error: error?.message || error });
    // 브라우저가 크래시된 경우 공유 인스턴스 초기화
    if (!browser.isConnected()) {
      sharedBrowser = null;
      logger.warn('Playwright 브라우저 크래시 감지, 다음 체크 시 재연결');
    }
    return {
      success: false,
      error: error?.message || '알 수 없음'
    };
  } finally {
    if (context) {
      try { await context.close(); } catch { /* 무시 */ }
    }
  }
}

/**
 * 데이터 영역 클릭 및 에러 값 체크 (에듀템 대시보드)
 */
async function tryClickDataAreaAndCheck(page: Page, config: UrlConfig): Promise<PlaywrightCheckResult> {
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

    // 각 데이터 블록 클릭 후 툴팁 값 수집
    const collectedTooltips: string[] = [];
    let errorFound = false;
    let errorText = '';

    for (let i = 0; i < count; i++) {
      await dataBlocks.nth(i).click();
      await page.waitForTimeout(200);

      // 툴팁 값 확인
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
async function checkSelector(page: Page, config: UrlConfig): Promise<PlaywrightCheckResult> {
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
