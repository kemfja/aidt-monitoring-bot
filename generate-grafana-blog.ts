import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, TabStopPosition, TabStopType
} from 'docx';
import * as fs from 'fs';

// 색상 상수
const BRAND_BLUE = '1a56db';
const LIGHT_GRAY = 'f3f4f6';
const RED = 'dc3545';
const GREEN = '28a745';

// 헬퍼: 일반 텍스트 단락
function textParagraph(text: string, options?: { bold?: boolean; size?: number; color?: string; spacing?: { after?: number } }): Paragraph {
  return new Paragraph({
    spacing: options?.spacing ?? { after: 120 },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        size: options?.size ?? 22,
        font: 'Malgun Gothic',
        color: options?.color,
      }),
    ],
  });
}

// 헬퍼: 코드 블록 (배경색 적용)
function codeBlock(code: string): Paragraph[] {
  const lines = code.split('\n');
  return lines.map(line =>
    new Paragraph({
      spacing: { after: 0, line: 260 },
      shading: { type: ShadingType.CLEAR, fill: LIGHT_GRAY },
      indent: { left: 200 },
      children: [
        new TextRun({
          text: line || ' ',
          font: 'Consolas',
          size: 18,
          color: '1f2937',
        }),
      ],
    })
  );
}

// 헬퍼: 빈 줄
function emptyLine(): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [] });
}

// 헬퍼: 테이블 셀
function cell(text: string, opts?: { bold?: boolean; shading?: string; width?: number }): TableCell {
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts?.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts?.bold,
            font: 'Malgun Gothic',
            size: 20,
          }),
        ],
      }),
    ],
  });
}

async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Malgun Gothic', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children: [
          // ===== 제목 =====
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: 'SUBAK Server Monitoring',
                bold: true,
                size: 40,
                font: 'Malgun Gothic',
                color: BRAND_BLUE,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: 'Grafana API 수치 임계치 모니터링 심층 분석',
                size: 28,
                font: 'Malgun Gothic',
                color: '4b5563',
              }),
            ],
          }),

          // ===== 1. 개요 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '1. Grafana 수치 감지 기능이란?', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          textParagraph('일반적인 웹 모니터링 도구들은 HTTP 상태 코드나 응답 시간 위주의 체크에 머뭅니다. 하지만 실제 장애의 징후는 Grafana 대시보드의 수치(metric)에서 먼저 나타나는 경우가 많습니다. 예를 들어 CPU 사용률이 90%를 넘어가거나, 에러율이 특정 임계치를 초과하는 경우가 여기에 해당합니다.'),

          textParagraph('SUBAK Server Monitoring의 Grafana 수치 감지 기능은 Grafana 공용 대시보드(Public Dashboard) API를 직접 호출하여, 지정한 시간 범위 내의 데이터 포인트를 수집하고 설정한 임계값(threshold)을 초과하는 데이터가 있는지 자동으로 검사합니다. 임계치 초과가 감지되면 Slack 알림을 즉시 발송합니다.'),

          emptyLine(),

          // ===== 2. 아키텍처 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '2. 동작 아키텍처', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          textParagraph('Grafana 수치 감지는 다음 4단계로 동작합니다:', { bold: true }),

          textParagraph('1) 설정(Configuration) - 사용자가 대시보드 UID, 패널 ID, 임계값, 시간 범위, 대상 서비스명 등을 JSON 설정으로 등록합니다.', { spacing: { after: 80 } }),
          textParagraph('2) 데이터 수집(Data Collection) - 등록된 설정에 따라 Grafana 공용 API에 POST 요청을 보내 시계열 데이터를 조회합니다.', { spacing: { after: 80 } }),
          textParagraph('3) 임계치 검증(Threshold Validation) - 수집된 각 데이터 포인트가 설정된 임계값 이상인지 비교하고 에러 데이터를 분리합니다.', { spacing: { after: 80 } }),
          textParagraph('4) 결과 통보(Notification) - 임계치 초과 건수가 1건 이상이면 장애로 판단하고 Slack 웹훅으로 상세 정보를 발송합니다.', { spacing: { after: 80 } }),

          emptyLine(),

          // ===== 3. Grafana API 통신 방식 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '3. Grafana API 통신 방식', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          textParagraph('Grafana의 공용 대시보드(Public Dashboard) 기능을 활용합니다. 이 기능은 인증 없이도 대시보드 데이터를 조회할 수 있는 공개 API 엔드포인트를 제공합니다. API 엔드포인트 형식은 다음과 같습니다:'),

          ...codeBlock(`POST {hostUrl}/api/public/dashboards/{dashboardUid}/panels/{panelId}/query`),

          emptyLine(),

          textParagraph('요청 바디(Request Body) 예시:', { bold: true }),

          ...codeBlock(`{
  "intervalMs": 1000,
  "maxDataPoints": 100,
  "timeRange": {
    "from": "1712000000000",
    "to": "1712003600000",
    "timezone": "browser"
  }
}`),

          emptyLine(),

          textParagraph('Grafana API 응답 구조:', { bold: true }),

          ...codeBlock(`{
  "results": {
    "A": {
      "frames": [
        {
          "schema": { "name": "service-a" },
          "data": {
            "values": [
              [1712000000000, 1712000060000],  // 타임스탬프 배열
              [45.2, 82.7]                      // 측정값 배열
            ]
          }
        }
      ]
    }
  }
}`),

          emptyLine(),

          textParagraph('응답의 frames 배열에서 schema.name이 서비스명이 되고, data.values[0]은 시간 축, data.values[1]은 측정값 축입니다. 이 구조를 파싱하여 각 서비스별 데이터 포인트를 추출합니다.'),

          emptyLine(),

          // ===== 4. 핵심 코드 구현 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '4. 핵심 코드 구현', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          // 4-1. 타입 정의
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
            children: [
              new TextRun({ text: '4-1. 타입 정의 (Type Definitions)', bold: true, size: 26, font: 'Malgun Gothic', color: '374151' }),
            ],
          }),

          textParagraph('Grafana 체크에 필요한 설정과 결과 타입은 다음과 같이 정의됩니다. src/models/url-config.ts와 src/models/monitor-result.ts에 각각 위치합니다.'),

          textParagraph('설정 인터페이스 (src/models/url-config.ts):', { bold: true, color: BRAND_BLUE }),

          ...codeBlock(`export interface GrafanaApiCheck {
  /** Grafana 공용 대시보드 UID */
  dashboardUid: string;
  /** Grafana 호스트 URL */
  hostUrl: string;
  /** 조회할 패널 ID 목록 */
  panelIds: number[];
  /** 에러 임계값 (이 값 이상이면 에러) */
  threshold: number;
  /** 조회 시간 범위 (시간 단위) */
  timeRangeHours: number;
  /** 조회 간격 (ms) */
  intervalMs: number;
  /** 최대 데이터 포인트 수 */
  maxDataPoints: number;
  /** 임계값 검사 대상 서비스명 목록 */
  targetServices: string[];
}`),

          emptyLine(),

          textParagraph('결과 데이터 타입 (src/models/monitor-result.ts):', { bold: true, color: BRAND_BLUE }),

          ...codeBlock(`export interface GrafanaDataPoint {
  service: string;   // 서비스명
  time: string;      // ISO 8601 타임스탬프
  value: number;     // 측정값
}

export interface GrafanaCheckDetail {
  type: 'grafana';
  apiUrl: string;                  // 조회한 API URL
  threshold: number;               // 적용된 임계값
  targetServices?: string[];       // 필터링 대상 서비스
  dataPoints: GrafanaDataPoint[];  // 전체 데이터 포인트
  errorDataPoints: GrafanaDataPoint[];  // 임계치 초과 데이터
}`),

          emptyLine(),

          // 4-2. Grafana API 체커
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
            children: [
              new TextRun({ text: '4-2. Grafana API 체커 (src/utils/grafana-checker.ts)', bold: true, size: 26, font: 'Malgun Gothic', color: '374151' }),
            ],
          }),

          textParagraph('핵심 로직입니다. 설정된 패널 ID 목록을 순회하며 Grafana API를 호출하고, 응답 데이터에서 서비스별 데이터 포인트를 추출하여 임계치를 검증합니다.'),

          ...codeBlock(`import axios from 'axios';
import { UrlConfig } from '../models/url-config';
import { GrafanaCheckDetail, GrafanaDataPoint } from '../models/monitor-result';
import logger from './logger';

export async function checkGrafanaApi(config: UrlConfig): Promise<{
  isValid: boolean;
  errorMessage?: string;
  responseTime: number;
  grafanaCheckDetail: GrafanaCheckDetail;
}> {
  const startTime = Date.now();
  const grafanaConfig = config.errorConditions?.grafanaApiCheck!;
  const {
    dashboardUid, hostUrl, panelIds,
    threshold, timeRangeHours,
    intervalMs, maxDataPoints, targetServices
  } = grafanaConfig;

  const to = Date.now();
  const from = to - timeRangeHours * 3600000;

  const allDataPoints: GrafanaDataPoint[] = [];
  const allErrorDataPoints: GrafanaDataPoint[] = [];

  // 각 패널 순차 조회
  for (const panelId of panelIds) {
    const apiUrl =
      \`\${hostUrl}/api/public/dashboards/\${dashboardUid\}/panels/\${panelId}/query\`;

    const requestBody = {
      intervalMs,
      maxDataPoints,
      timeRange: {
        from: String(from),
        to: String(to),
        timezone: 'browser'
      }
    };

    try {
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      // 응답 파싱 및 데이터 포인트 추출
      const results = response.data?.results || {};

      for (const refId of Object.keys(results)) {
        const refResult = results[refId];
        if (!refResult?.frames) continue;

        for (const frame of refResult.frames) {
          const serviceName = frame.schema?.name || \`panel-\${panelId}\`;
          const values = frame.data?.values;
          if (!values || values.length < 2) continue;

          const timeArray = values[0] as number[];
          const valueArray = values[1] as (number | null)[];

          for (let i = 0; i < valueArray.length; i++) {
            const val = valueArray[i];
            if (val === null || val === undefined) continue;

            // targetServices 필터링 (미지정 시 전체 대상)
            const isTarget = !targetServices ||
              targetServices.length === 0 ||
              targetServices.some(t => serviceName === t);
            if (!isTarget) continue;

            const timeStr = new Date(timeArray[i]).toISOString();
            const point: GrafanaDataPoint = {
              service: serviceName,
              time: timeStr,
              value: val
            };

            allDataPoints.push(point);
            if (val >= threshold) {
              allErrorDataPoints.push(point);
            }
          }
        }
      }
    } catch (error: any) {
      logger.warn(\`Grafana 패널 \${panelId} 조회 실패: \${error?.message}\`);
    }
  }

  const responseTime = Date.now() - startTime;
  const isValid = allErrorDataPoints.length === 0;

  let errorMessage: string | undefined;
  if (!isValid) {
    const summary = allErrorDataPoints.slice(0, 5)
      .map(p =>
        \`\${p.service} @ \${new Date(p.time).toLocaleString('ko-KR')} = \${p.value}\`
      ).join(', ');
    errorMessage =
      \`수치 임계값(\${threshold}) 초과 \${allErrorDataPoints.length}건: \${summary}\`;
  }

  return {
    isValid,
    errorMessage,
    responseTime,
    grafanaCheckDetail: {
      type: 'grafana',
      apiUrl: \`\${hostUrl}/api/public/dashboards/\${dashboardUid}\`,
      threshold,
      targetServices: targetServices || [],
      dataPoints: allDataPoints,
      errorDataPoints: allErrorDataPoints
    }
  };
}`),

          emptyLine(),

          // 4-3. 모니터 파이프라인 통합
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
            children: [
              new TextRun({ text: '4-3. 모니터 파이프라인 통합 (src/core/monitor.ts)', bold: true, size: 26, font: 'Malgun Gothic', color: '374151' }),
            ],
          }),

          textParagraph('Monitor 클래스의 checkUrl 메서드에서 Grafana 체크를 다른 모니터링 방식과 분기 처리합니다. errorConditions에 grafanaApiCheck 설정이 있으면 Playwright나 일반 HTTP 체크 대신 Grafana API 체커를 우선 호출합니다.'),

          ...codeBlock(`// Monitor.checkUrl() 내 분기 로직
const hasGrafanaApiCheck = !!config.errorConditions?.grafanaApiCheck;
const hasCssSelectorCheck = config.errorConditions?.cssSelectorChecks &&
  config.errorConditions.cssSelectorChecks.length > 0;

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
  // Playwright 동적 콘텐츠 체크
  playwrightResult = await checkWithPlaywright(config);
  // ...
} else {
  // 일반 HTTP 상태 체크
  // ...
}

// 결과 객체에 Grafana 상세 정보 포함
const result: MonitorResult = {
  id: this.generateId(),
  urlId: config.id,
  urlName: config.name,
  timestamp,
  status: validation.isValid ? 'success' : 'error',
  statusCode: validation.statusCode ?? 200,
  responseTime: validation.responseTime ?? 0,
  errorMessage: validation.errorMessage,
  grafanaCheckDetail,  // Grafana 체크 상세 결과
};`),

          emptyLine(),

          // 4-4. 프론트엔드 렌더링
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
            children: [
              new TextRun({ text: '4-4. 프론트엔드 결과 표시 (public/js/dashboard.js)', bold: true, size: 26, font: 'Malgun Gothic', color: '374151' }),
            ],
          }),

          textParagraph('웹 대시보드에서는 모니터링 결과 상세 모달에 Grafana 체크 상세 섹션을 렌더링합니다. 임계치 초과 데이터는 빨간색으로 강조 표시되며, 전체 데이터와 에러 데이터를 분리된 테이블로 보여줍니다.'),

          ...codeBlock(`function renderGrafanaCheckDetail(detail) {
  const { apiUrl, threshold, targetServices,
          dataPoints, errorDataPoints } = detail;

  // targetServices 필터링
  const targetSet = targetServices?.length > 0
    ? new Set(targetServices) : null;
  const filteredData = targetSet
    ? dataPoints.filter(p => targetSet.has(p.service))
    : dataPoints;
  const filteredErrors = targetSet
    ? errorDataPoints.filter(p => targetSet.has(p.service))
    : errorDataPoints;

  let html = \`
    <div class="detail-section">
      <h3>Grafana API 체크 상세</h3>
      <div class="condition-item">
        <div class="condition-detail-row">
          <span class="condition-label">API URL:</span>
          <span class="condition-value">
            <code>\${escapeHtml(apiUrl)}</code>
          </span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">임계값:</span>
          <span class="condition-value">
            <strong>\${threshold} 이상</strong>
          </span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">전체 데이터:</span>
          <span class="condition-value">
            \${filteredData.length}건
          </span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">에러 데이터:</span>
          <span class="condition-value"
            style="color: \${filteredErrors.length > 0
              ? '#dc3545' : '#28a745'};">
            <strong>\${filteredErrors.length}건</strong>
          </span>
        </div>
      </div>
  \`;

  // 임계값 초과 데이터 테이블 (빨간색 배경 강조)
  if (filteredErrors.length > 0) {
    html += \`
      <h4 style="color: #dc3545;">임계값 초과 데이터</h4>
      <table class="condition-table">
        <thead>
          <tr><th>서비스</th><th>시간</th><th>값</th></tr>
        </thead>
        <tbody>
          \${filteredErrors.map(p => \`
            <tr style="background: #fff5f5;">
              <td>\${escapeHtml(p.service)}</td>
              <td>\${formatDateTime(p.time)}</td>
              <td>
                <strong style="color: #dc3545;">
                  \${p.value}
                </strong>
              </td>
            </tr>
          \`).join('')}
        </tbody>
      </table>
    \`;
  }

  // 전체 데이터 테이블 (스크롤 가능)
  html += \`
    <h4>전체 데이터 (\${filteredData.length}건)</h4>
    <div class="data-values-container">
      <table class="condition-table">
        <thead>
          <tr><th>번호</th><th>서비스</th>
              <th>시간</th><th>값</th></tr>
        </thead>
        <tbody>
          \${filteredData.map((p, idx) => {
            const isError = p.value >= threshold;
            return \`
              <tr style="\${isError ? 'background: #fff5f5;' : ''}">
                <td>\${idx + 1}</td>
                <td>\${escapeHtml(p.service)}</td>
                <td>\${formatDateTime(p.time)}</td>
                <td style="\${isError
                  ? 'color: #dc3545; font-weight: bold;'
                  : ''}">\${p.value}</td>
              </tr>
            \`;
          }).join('')}
        </tbody>
      </table>
    </div>
  \`;

  return html;
}`),

          emptyLine(),

          // ===== 5. 설정 예시 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '5. 실제 설정 예시', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          textParagraph('다음은 Grafana 모니터링을 설정하는 실제 JSON 설정 예시입니다. 이 설정을 URL 등록 API에 전달하면 즉시 모니터링이 시작됩니다.'),

          ...codeBlock(`{
  "id": "grafana-aidt-monitor",
  "name": "AIDT 서비스 메트릭 모니터링",
  "url": "https://monitoring.aidt.ai:3000/d/abc123",
  "method": "GET",
  "errorConditions": {
    "grafanaApiCheck": {
      "dashboardUid": "370cefbc06dd4260b45102ad0684e56e",
      "hostUrl": "https://monitoring.aidt.ai:3000",
      "panelIds": [1, 2, 3],
      "threshold": 80,
      "timeRangeHours": 1,
      "intervalMs": 1000,
      "maxDataPoints": 100,
      "targetServices": [
        "user-service",
        "order-service",
        "payment-service"
      ]
    }
  },
  "enabled": true
}`),

          emptyLine(),

          // 설정 필드 설명 테이블
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
            children: [
              new TextRun({ text: '설정 필드 상세 설명', bold: true, size: 26, font: 'Malgun Gothic', color: '374151' }),
            ],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  cell('필드명', { bold: true, shading: BRAND_BLUE, width: 25 }),
                  cell('타입', { bold: true, shading: BRAND_BLUE, width: 15 }),
                  cell('설명', { bold: true, shading: BRAND_BLUE, width: 60 }),
                ].map(c => {
                  // 헤더 텍스트를 흰색으로 (docx 제한으로 여기서는 생략)
                  return c;
                }),
              }),
              new TableRow({ children: [
                cell('dashboardUid', { width: 25 }), cell('string', { width: 15 }),
                cell('Grafana 공용 대시보드의 고유 식별자', { width: 60 }),
              ]}),
              new TableRow({ children: [
                cell('hostUrl', { width: 25, shading: LIGHT_GRAY }),
                cell('string', { width: 15, shading: LIGHT_GRAY }),
                cell('Grafana 서버의 기본 URL', { width: 60, shading: LIGHT_GRAY }),
              ]}),
              new TableRow({ children: [
                cell('panelIds', { width: 25 }), cell('number[]', { width: 15 }),
                cell('조회할 대시보드 패널 ID 목록 (여러 패널 동시 조회 가능)', { width: 60 }),
              ]}),
              new TableRow({ children: [
                cell('threshold', { width: 25, shading: LIGHT_GRAY }),
                cell('number', { width: 15, shading: LIGHT_GRAY }),
                cell('에러로 판단할 임계값 (이 값 이상이면 에러)', { width: 60, shading: LIGHT_GRAY }),
              ]}),
              new TableRow({ children: [
                cell('timeRangeHours', { width: 25 }), cell('number', { width: 15 }),
                cell('조회할 시간 범위 (현재 시점부터 N시간 전까지)', { width: 60 }),
              ]}),
              new TableRow({ children: [
                cell('intervalMs', { width: 25, shading: LIGHT_GRAY }),
                cell('number', { width: 15, shading: LIGHT_GRAY }),
                cell('데이터 포인트 간 조회 간격 (밀리초)', { width: 60, shading: LIGHT_GRAY }),
              ]}),
              new TableRow({ children: [
                cell('maxDataPoints', { width: 25 }), cell('number', { width: 15 }),
                cell('최대 데이터 포인트 수', { width: 60 }),
              ]}),
              new TableRow({ children: [
                cell('targetServices', { width: 25, shading: LIGHT_GRAY }),
                cell('string[]', { width: 15, shading: LIGHT_GRAY }),
                cell('모니터링 대상 서비스명 목록 (빈 배열이면 전체 서비스)', { width: 60, shading: LIGHT_GRAY }),
              ]}),
            ],
          }),

          emptyLine(),

          // ===== 6. 장점 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '6. 이 기능의 기술적 장점', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          textParagraph('1) 별도 인증 없이 공용 API 활용', { bold: true }),
          textParagraph('Grafana의 Public Dashboard 기능을 사용하여 API 키나 토큰 관리 없이 데이터에 접근할 수 있습니다. 이는 보안 부담을 줄이면서도 실시간 메트릭 데이터를 수집할 수 있게 합니다.'),

          emptyLine(),

          textParagraph('2) 다중 패널 동시 모니터링', { bold: true }),
          textParagraph('panelIds 배열에 여러 패널 ID를 등록하면 한 번의 체크 주기에 여러 대시보드 패널을 동시에 조회합니다. CPU, 메모리, 에러율 등 서로 다른 메트릭을 한 설정으로 통합 관리할 수 있습니다.'),

          emptyLine(),

          textParagraph('3) 서비스별 정밀 필터링', { bold: true }),
          textParagraph('targetServices 설정으로 관심 있는 서비스만 선택적으로 모니터링할 수 있습니다. Grafana 패널에 수십 개의 서비스가 표시되더라도, 실제로 감시해야 할 핵심 서비스만 추려내어 불필요한 알림(noise)을 줄입니다.'),

          emptyLine(),

          textParagraph('4) 기존 모니터링 인프라와 무통합 연동', { bold: true }),
          textParagraph('이미 Grafana 대시보드가 구축되어 있다면 추가 에이전트 설치나 데이터 파이프라인 구성 없이 API URL과 설정만으로 즉시 연동이 가능합니다. 기존 관측 인프라(Observability Stack)에 대한 침입 없이 모니터링 레이어를 추가하는 구조입니다.'),

          emptyLine(),

          textParagraph('5) 점진적 장애 감지 (Trend-based Detection)', { bold: true }),
          textParagraph('timeRangeHours 설정으로 과거 N시간의 데이터를 한 번에 조회하므로, 단순한 순간값 스냅샷이 아닌 시계열 트렌드를 기반으로 장애를 감지합니다. 일시적인 스파이크와 지속적인 장애를 구분할 수 있는 확장의 여지가 있습니다.'),

          emptyLine(),

          textParagraph('6) 장애 발생 시 상세 컨텍스트 제공', { bold: true }),
          textParagraph('에러 발생 시 단순히 "장애 발생"만 알리는 것이 아니라, 어느 서비스에서 언제 어떤 수치가 임계치를 초과했는지를 상세히 Slack에 전달합니다. Oncall 엔지니어가 알림만 보고도 상황을 파악할 수 있습니다.'),

          emptyLine(),

          // ===== 7. 데이터 흐름도 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '7. 전체 데이터 흐름 요약', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          ...codeBlock(`[Scheduler (node-cron)]
       |
       v
[Monitor.checkUrl()]
       |
       |-- grafanaApiCheck 설정 존재? --> [checkGrafanaApi()]
       |                                          |
       |                                          v
       |                              [Grafana Public API]
       |                              POST /panels/{id}/query
       |                                          |
       |                                          v
       |                              [응답 파싱 & 임계치 검증]
       |                              - frames > values 추출
       |                              - targetServices 필터링
       |                              - threshold 비교
       |                                          |
       |                                          v
       |                              [MonitorResult 생성]
       |                              - isValid / errorMessage
       |                              - grafanaCheckDetail 포함
       |
       v
[결과 저장 (JsonRepository)]
       |
       v
[Slack 알림 (에러 시만)]
       |
       v
[웹 대시보드 표시]
- 상태 요약 카드
- 상세 모달 (임계치 초과 테이블)`),

          emptyLine(),

          // ===== 8. 마무리 =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({ text: '8. 결론', bold: true, size: 30, font: 'Malgun Gothic', color: BRAND_BLUE }),
            ],
          }),

          textParagraph('SUBAK Server Monitoring의 Grafana 수치 감지 기능은 기존 Grafana 관측 인프라 위에 "능동적 감시 레이어"를 추가하는 접근 방식입니다. 대시보드를 사람이 직접 확인하는 수동적 모니터링에서, 시스템이 자동으로 수치를 읽고 임계치를 판단하여 Slack으로 즉시 통보하는 능동적 모니터링으로 전환할 수 있습니다.'),

          textParagraph('특히 별도의 데이터 파이프라인 구축이나 에이전트 설치 없이, Grafana 공용 API만으로 구현되었기 때문에 도입 장벽이 매우 낮습니다. 이미 Grafana를 사용 중인 팀이라면 JSON 설정 하나만으로 수치 기반 장애 감지를 시작할 수 있습니다.'),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = 'docs/SUBAK-Grafana-Monitoring-DeepDive.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log(`Word 문서 생성 완료: ${outputPath}`);
}

main().catch(console.error);
