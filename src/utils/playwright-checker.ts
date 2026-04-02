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
  /** 체크에 사용된 실제 URL */
  checkedUrl?: string;
}

/**
 * 공유 브라우저 인스턴스 (재사용하여 launch/close 반복 방지)
 */
let sharedBrowser: Browser | null = null;

/**
 * Chromium 실행 인자 (Windows 안정성)
 */
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
];

/** 시스템 Chrome 사용 (Chromium보다 Windows에서 안정적) */
const BROWSER_CHANNEL = 'chrome';

/** 페이지 이동/요소 대기 기본 타임아웃 (60초) */
const PAGE_TIMEOUT = 60000;

/** 체크 실패 시 재시도 대기 시간 (5초) */
const RETRY_DELAY = 5000;

/** 최대 재시도 횟수 */
const MAX_CHECK_RETRIES = 2;

/** 브라우저 keep-alive 간격 (2분) */
const KEEP_ALIVE_INTERVAL = 2 * 60 * 1000;

/** keep-alive 타이머 */
let keepAliveTimer: NodeJS.Timeout | null = null;

/**
 * 공유 브라우저 반환 (없으면 생성, 실패 시 최대 3회 재시도)
 */
async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      sharedBrowser = await chromium.launch({
        headless: true,
        channel: BROWSER_CHANNEL,
        args: BROWSER_ARGS,
      });
      startKeepAlive();
      logger.info(`Playwright 공유 브라우저 초기화 완료 (${attempt}회차)`);
      return sharedBrowser;
    } catch (error: any) {
      sharedBrowser = null;
      logger.warn(`Playwright 브라우저 실행 실패 (${attempt}/${MAX_RETRIES}): ${error?.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw new Error(`Playwright 브라우저 실행 ${MAX_RETRIES}회 재시도 모두 실패`);
}

/**
 * 공유 브라우저 종료
 */
export async function closeSharedBrowser(): Promise<void> {
  stopKeepAlive();
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch { /* 이미 종료된 경우 무시 */ }
    sharedBrowser = null;
    logger.info('Playwright 공유 브라우저 종료 완료');
  }
}

/**
 * 브라우저 keep-alive 시작 (idle disconnect 방지)
 */
function startKeepAlive(): void {
  stopKeepAlive();
  keepAliveTimer = setInterval(async () => {
    try {
      if (!sharedBrowser || !sharedBrowser.isConnected()) {
        logger.info('Playwright keep-alive: 브라우저 연결 끊김, 즉시 재시작');
        sharedBrowser = null;
        stopKeepAlive();
        // 연결 끊김 시 즉시 재시작 (cron 실행 시 재시작 방지)
        await getSharedBrowser();
        return;
      }
      const context = await sharedBrowser.newContext();
      const page = await context.newPage();
      await page.goto('about:blank');
      await context.close();
      logger.info('Playwright keep-alive 완료');
    } catch (error: any) {
      logger.warn('Playwright keep-alive 실패', { error: error?.message });
      sharedBrowser = null;
      stopKeepAlive();
    }
  }, KEEP_ALIVE_INTERVAL);
}

/**
 * 브라우저 keep-alive 중지
 */
function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/**
 * Pinpoint URL의 from/to를 현재 시간 기준으로 동적 생성
 * from: 현재 시간 - 1시간, to: 현재 시간
 */
function resolveDynamicUrl(url: string): string {
  if (!url.includes('pinpoint.aidt.ai')) {
    return url;
  }

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const format = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

  return url
    .replace(/from=[^&]+/, `from=${format(from)}`)
    .replace(/to=[^&]+/, `to=${format(now)}`);
}

/**
 * 단일 URL 체크 (공유 브라우저 사용, 실패 시 재시도)
 */
export async function checkWithPlaywright(config: UrlConfig): Promise<PlaywrightCheckResult> {
  const browser = await getSharedBrowser();
  let lastError: any = null;

  // Pinpoint URL 동적 시간 생성
  const resolvedUrl = resolveDynamicUrl(config.url);
  if (resolvedUrl !== config.url) {
    logger.info(`Pinpoint URL 동적 생성: ${config.name}`, { url: resolvedUrl });
  }

  for (let attempt = 1; attempt <= MAX_CHECK_RETRIES; attempt++) {
    let context: BrowserContext | null = null;

    try {
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      const page = await context.newPage();
      const startTime = Date.now();

      // 페이지 이동
      await page.goto(resolvedUrl, {
        waitUntil: 'networkidle',
        timeout: PAGE_TIMEOUT,
      });

      const isPinpoint = resolvedUrl.includes('pinpoint.aidt.ai');

      if (!isPinpoint) {
        // 페이지 로드 대기 (동적 콘텐츠 로딩)
        await page.waitForTimeout(3000);

        // 데이터 영역 클릭 및 에러 값 체크 (에듀템 대시보드)
        const clickResult = await tryClickDataAreaAndCheck(page, config);

        if (!clickResult.success) {
          return { ...clickResult, checkedUrl: resolvedUrl };
        }

        // 선택자 체크
        const selectorResult = await checkSelector(page, config);

        const collectedValues: SelectorValue[] = [
          ...(clickResult.collectedValues || [])
        ];

        const elapsed = Date.now() - startTime;

        logger.info(`Playwright 체크 완료: ${config.name}`, { result: selectorResult, elapsed: `${elapsed}ms`, attempt });

        return {
          ...selectorResult,
          collectedValues: collectedValues.length > 0 ? collectedValues : undefined,
          checkedUrl: resolvedUrl
        };
      } else {
        // Pinpoint는 DOM 로딩 대기
        await page.waitForTimeout(2000);
      }

      // 선택자 체크
      const result = await checkSelector(page, config);
      const elapsed = Date.now() - startTime;

      logger.info(`Playwright 체크 완료: ${config.name}`, { result, elapsed: `${elapsed}ms`, attempt });

      return { ...result, checkedUrl: resolvedUrl };
    } catch (error: any) {
      lastError = error;
      logger.warn(`Playwright 체크 실패 (${attempt}/${MAX_CHECK_RETRIES}): ${config.name}`, { error: error?.message });

      // 브라우저 크래시 시 공유 인스턴스 초기화 후 재연결
      if (!browser.isConnected()) {
        sharedBrowser = null;
        logger.warn('Playwright 브라우저 크래시 감지, 재연결 시도');
      }

      if (attempt < MAX_CHECK_RETRIES) {
        logger.info(`${RETRY_DELAY / 1000}초 후 재시도...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    } finally {
      if (context) {
        try { await context.close(); } catch { /* 무시 */ }
      }
    }
  }

  // 모든 재시도 실패
  logger.error(`Playwright 체크 최종 실패: ${config.name}`, { error: lastError?.message });
  return {
    success: false,
    error: lastError?.message || '알 수 없음',
    checkedUrl: resolvedUrl
  };
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
