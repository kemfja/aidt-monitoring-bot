/**
 * Pinpoint 타입: 단일 CSS 선택자의 텍스트 값
 */
export interface PinpointSelectorValue {
  type: 'pinpoint';
  selector: string;
  value: string;
}

/**
 * 에듀템 타입: 여러 데이터 블록의 툴팁 값 목록
 */
export interface EdutemSelectorValue {
  type: 'edutem';
  selector: string;
  values: string[];
  totalBlocks: number;
}

export type SelectorValue = PinpointSelectorValue | EdutemSelectorValue;

/**
 * Grafana API 데이터 포인트
 */
export interface GrafanaDataPoint {
  service: string;
  time: string;
  value: number;
}

/**
 * Grafana API 체크 상세
 */
export interface GrafanaCheckDetail {
  type: 'grafana';
  apiUrl: string;
  threshold: number;
  /** 임계값 검사 대상 서비스명 목록 (이 목록에 해당하는 데이터만 노출) */
  targetServices?: string[];
  dataPoints: GrafanaDataPoint[];
  errorDataPoints: GrafanaDataPoint[];
}

/**
 * 모니터링 결과 인터페이스
 */
export interface MonitorResult {
  id: string;
  urlId: string;
  urlName: string;
  /** 체크 시 실제 사용된 URL (동적 생성된 경우 원본과 다를 수 있음) */
  checkedUrl?: string;
  timestamp: string;
  status: 'success' | 'error';
  statusCode?: number;
  responseTime: number;
  errorMessage?: string;
  selectorValues?: SelectorValue[];
  grafanaCheckDetail?: GrafanaCheckDetail;
}

/**
 * 모니터링 결과 요약 인터페이스
 */
export interface MonitorResultSummary {
  total: number;
  success: number;
  error: number;
  avgResponseTime: number;
  lastChecked?: string;
}

/**
 * URL 상태 인터페이스
 */
export interface UrlStatus {
  urlId: string;
  name: string;
  url: string;
  status: 'success' | 'error' | 'pending';
  lastChecked?: string;
  lastStatusCode?: number;
  avgResponseTime?: number;
}
