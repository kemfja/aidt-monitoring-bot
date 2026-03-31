/**
 * URL 설정 인터페이스
 */
export interface UrlConfig {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST';
  errorConditions: ErrorConditions;
  enabled: boolean;
}

/**
 * 에러 조건 인터페이스
 */
export interface ErrorConditions {
  /** 예상되는 HTTP 상태 코드 (목록에 없으면 에러) */
  expectedStatusCodes?: number[];
  /** 최대 응답 시간 (ms 초과 시 에러) */
  maxResponseTime?: number;
  /** HTML 본문에 포함되면 에러로 갴주할 키워드 목록 */
  errorKeywords?: string[];
  /** CSS 선택자 기반 체크 */
  cssSelectorChecks?: CssSelectorCheck[];
  /** Playwright 브라우저 체크 (클릭 후 툴팁 텍스트 확인 등) */
  playwrightChecks?: PlaywrightCheck[];
  /** Grafana API 직접 체크 */
  grafanaApiCheck?: GrafanaApiCheck;
}

/**
 * Grafana 공용 대시보드 API 체크 설정
 */
export interface GrafanaApiCheck {
  /** Grafana 공용 대시보드 UID */
  dashboardUid: string;
  /** Grafana 호스트 URL */
  hostUrl: string;
  /** 조회할 패널 ID 목록 */
  panelIds: number[];
  /** 에러 임계값 */
  threshold: number;
  /** 조회 시간 범위 (시간 단위) */
  timeRangeHours: number;
  /** 조회 간격 (ms) */
  intervalMs: number;
  /** 최대 데이터 포인트 */
  maxDataPoints: number;
  /** 임계값 검사 대상 서비스명 목록 (정확히 일치) */
  targetServices: string[];
}

/**
 * CSS 선택자 체크 인터페이스
 */
export interface CssSelectorCheck {
  /** CSS 선택자 (예: ".__scatter_chart__legend_count") */
  selector: string;
  /** 체크 타입 */
  checkType: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'anyOf' | 'noneOf';
  /** 예상 문자열 값 (문자열 비교 시 사용) */
  expectedValue?: string;
  /** 예상 문자열 값 목록 (anyOf, noneOf 시 사용) */
  expectedValues?: string[];
  /** 예상 숫자값 (숫자 비교 시 사용) */
  expectedNumber?: number;
  /** 에러 시 표시할 메시지 */
  errorMessage?: string;
}

/**
 * Playwright 브라우저 체크 인터페이스
 */
export interface PlaywrightCheck {
  /** 클릭할 요소의 CSS 선택자 */
  clickSelector?: string;
  /** 기다릴 툴팁/요소의 CSS 선택자 */
  waitForSelector?: string;
  /** 텍스트를 추출할 선택자 */
  textSelector: string;
  /** 체크 타입 */
  checkType: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'anyOf' | 'noneOf';
  /** 예상 문자열 값 */
  expectedValue?: string | string[];
  /** 예상 숫자값 */
  expectedNumber?: number;
  /** 에러 메시지 */
  errorMessage?: string;
  /** 대기 시간 (ms) */
  timeout?: number;
}

/**
 * URL 생성 DTO
 */
export interface CreateUrlDto {
  name: string;
  url: string;
  method?: 'GET' | 'POST';
  errorConditions?: ErrorConditions;
  enabled?: boolean;
}

/**
 * URL 수정 DTO
 */
export interface UpdateUrlDto {
  name?: string;
  url?: string;
  method?: 'GET' | 'POST';
  errorConditions?: ErrorConditions;
  enabled?: boolean;
}
