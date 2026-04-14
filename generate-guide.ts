import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
  AlignmentType, ShadingType
} from 'docx';
import * as fs from 'fs';

const BLUE = '1a56db';
const GRAY_BG = 'f3f4f6';
const DARK = '1f2937';
const GREEN = '28a745';
const ORANGE = 'e67e22';

function t(text: string, opts?: { bold?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({ text, font: 'Malgun Gothic', size: opts?.size ?? 22, bold: opts?.bold, color: opts?.color });
}

function p(runs: TextRun[], opts?: { spacing?: { after?: number; before?: number }; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: { left?: number } }): Paragraph {
  return new Paragraph({ spacing: opts?.spacing ?? { after: 120 }, alignment: opts?.alignment, indent: opts?.indent, children: runs });
}

function h1(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 }, children: [new TextRun({ text, bold: true, size: 32, font: 'Malgun Gothic', color: BLUE })] });
}

function h2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 150 }, children: [new TextRun({ text, bold: true, size: 26, font: 'Malgun Gothic', color: '374151' })] });
}

function h3(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, bold: true, size: 23, font: 'Malgun Gothic', color: '4b5563' })] });
}

function code(codeStr: string): Paragraph[] {
  return codeStr.split('\n').map(line =>
    new Paragraph({ spacing: { after: 0, line: 260 }, shading: { type: ShadingType.CLEAR, fill: GRAY_BG }, indent: { left: 200 }, children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 18, color: DARK })] })
  );
}

function blank(): Paragraph { return p([], { spacing: { after: 80 } }); }

function body(text: string, opts?: { bold?: boolean; color?: string }): Paragraph {
  return p([t(text, { bold: opts?.bold, color: opts?.color })], { spacing: { after: 100 } });
}

function bullet(text: string, indent: number = 0): Paragraph {
  return p([t(text)], { spacing: { after: 60 }, indent: { left: 400 + indent * 300 } });
}

function headerCell(text: string): TableCell {
  return new TableCell({ shading: { type: ShadingType.CLEAR, fill: BLUE }, children: [p([t(text, { bold: true, color: 'FFFFFF' })])] });
}

function cell(text: string, shading?: string): TableCell {
  return new TableCell({ shading: shading ? { type: ShadingType.CLEAR, fill: shading } : undefined, children: [p([t(text)])] });
}

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map(h => headerCell(h)) }),
      ...rows.map((row, i) => new TableRow({ children: row.map(c => cell(c, i % 2 === 1 ? GRAY_BG : undefined)) })),
    ],
  });
}

function tip(text: string): Paragraph {
  return p([t('  ' + text)], { spacing: { after: 100 }, indent: { left: 200 } });
}

function warn(text: string): Paragraph[] {
  return [
    p([t('[주의] ' + text, { bold: true, color: ORANGE })], { spacing: { after: 60 } }),
  ];
}

async function main() {
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Malgun Gothic', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        // 표지
        blank(), blank(), blank(), blank(),
        p([t('SUBAK Server Monitoring', { bold: true, size: 48, color: BLUE })], { alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        p([t('모니터링 대상 추가 가이드', { size: 28, color: '6b7280' })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
        blank(),
        p([t('새로운 모니터링 대상 등록 방법 안내', { size: 24 })], { alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        blank(), blank(),
        p([t('2026.04', { size: 22, color: '6b7280' })], { alignment: AlignmentType.CENTER }),

        // ========== 1. 개요 ==========
        h1('1. 이 가이드의 목적'),
        body('이 문서는 SUBAK Server Monitoring 시스템에 새로운 모니터링 대상(URL)을 추가하는 방법을 단계별로 안내합니다. 모니터링 대상은 JSON 설정 파일 또는 REST API를 통해 등록할 수 있으며, 대상의 종류에 따라 3가지 체크 방식(HTTP, Playwright, Grafana API) 중 선택할 수 있습니다.'),

        blank(),

        // ========== 2. 기본 설정 구조 ==========
        h1('2. 기본 설정 구조'),
        body('모니터링 대상은 다음 JSON 형식으로 정의됩니다:', { bold: true }),

        ...code(`{
  "id": "unique-id",
  "name": "표시 이름",
  "url": "https://monitoring-target-url",
  "method": "GET",
  "errorConditions": {
    // 체크 방식에 따른 상세 설정 (섹션 3 참조)
  },
  "enabled": true
}`),

        blank(),

        h2('2-1. 기본 필드 설명'),

        makeTable([
          '필드', '타입', '필수', '설명',
        ], [
          ['id', 'string', 'O', '고유 식별자. 영문/숫자/하이픈 사용'],
          ['name', 'string', 'O', '대시보드와 Slack 알림에 표시될 이름'],
          ['url', 'string', 'O', '모니터링할 URL'],
          ['method', '"GET" | "POST"', 'O', 'HTTP 요청 방식'],
          ['errorConditions', 'object', 'O', '에러 판단 조건 (섹션 3 참조)'],
          ['enabled', 'boolean', 'O', 'true: 모니터링 활성, false: 비활성'],
        ]),

        blank(),

        // ========== 3. 체크 방식 선택 ==========
        h1('3. 체크 방식 선택 가이드'),
        body('모니터링 대상의 특성에 따라 적절한 체크 방식을 선택해야 합니다:'),

        blank(),

        makeTable([
          '체크 방식', '적합한 대상', 'errorConditions 설정 키', '필요 기술',
        ], [
          ['HTTP 체크', '정적 페이지, API 엔드포인트', 'expectedStatusCodes\nmaxResponseTime\nerrorKeywords\ncssSelectorChecks', '없음 (기본)'],
          ['Playwright 체크', 'JavaScript 렌더링 페이지,\n동적 DOM 콘텐츠', 'cssSelectorChecks\nplaywrightChecks', 'CSS 선택자 지식'],
          ['Grafana API 체크', 'Grafana 대시보드 수치', 'grafanaApiCheck', 'Grafana Public Dashboard\nUID, Panel ID'],
        ]),

        blank(),

        body('의사결정 흐름:', { bold: true }),

        ...code(`모니터링 대상이 Grafana 대시보드인가?
  |-- YES --> Grafana API 체크 (섹션 3-3)
  |-- NO
       |
       v
페이지가 JavaScript로 동적 렌더링되는가?
  |-- YES --> Playwright 체크 (섹션 3-2)
  |-- NO  --> HTTP 체크 (섹션 3-1)`),

        blank(),

        // ========== 3-1. HTTP 체크 ==========
        h2('3-1. HTTP 체크'),
        body('가장 기본적인 체크 방식입니다. 서버에 HTTP 요청을 보내고 응답을 검증합니다. 정적 페이지, REST API, 일반 웹 서비스에 적합합니다.'),

        blank(),

        h3('설정 예시'),

        ...code(`{
  "id": "api-health-check",
  "name": "API 헬스 체크",
  "url": "https://api.example.com/health",
  "method": "GET",
  "errorConditions": {
    "expectedStatusCodes": [200],
    "maxResponseTime": 3000,
    "errorKeywords": ["error", "fail", "timeout"]
  },
  "enabled": true
}`),

        blank(),

        h3('에러 조건 상세'),

        makeTable([
          '필드', '타입', '설명', '예시',
        ], [
          ['expectedStatusCodes', 'number[]', '허용할 HTTP 상태 코드 목록.\n목록에 없으면 에러', '[200, 201]'],
          ['maxResponseTime', 'number', '최대 응답 시간(ms).\n초과 시 에러', '3000'],
          ['errorKeywords', 'string[]', '응답 본문에 포함되면\n에러로 판단할 키워드', '["error", "fail"]'],
        ]),

        blank(),

        ...warn('errorKeywords는 응답 HTML 전체를 검사합니다. "error" 같은 일반적인 단어는 CSS 클래스명 등에서 오탐지될 수 있으니 구체적인 키워드를 사용하세요.'),

        blank(),

        // ========== 3-2. Playwright 체크 ==========
        h2('3-2. Playwright 체크'),
        body('헤드리스 Chrome 브라우저를 실행하여 JavaScript 렌더링이 필요한 페이지를 체크합니다. 동적 DOM 콘텐츠, AJAX 기반 페이지, SPA에 적합합니다.'),

        blank(),

        h3('시나리오 A: CSS 선택자 텍스트 검증'),
        body('페이지 로드 후 특정 DOM 요소의 텍스트 값을 검증합니다. Pinpoint APM의 Failed 건수 확인이 대표적인 사례입니다.'),

        ...code(`{
  "id": "pinpoint-lms-check",
  "name": "LMS API 데이터",
  "url": "https://pinpoint.aidt.ai/serverMap/lms-api@SPRING_BOOT?from=...",
  "method": "GET",
  "errorConditions": {
    "cssSelectorChecks": [
      {
        "selector": "label[for*=\\"failed\\"] .__scatter_chart__legend_count",
        "checkType": "notEquals",
        "expectedValues": ["0"],
        "errorMessage": "Failed 카운트가 0이 아닙니다"
      }
    ]
  },
  "enabled": true
}`),

        blank(),

        h3('checkType 전체 목록'),

        makeTable([
          'checkType', '의미', '에러 판정 조건', '사용 필드',
        ], [
          ['equals', '일치', '텍스트가 expectedValue와 같으면 에러', 'expectedValue'],
          ['notEquals', '불일치', '텍스트가 expectedValue와 다르면 에러', 'expectedValue'],
          ['contains', '포함', '텍스트에 expectedValue가 없으면 에러', 'expectedValue'],
          ['notContains', '미포함', '텍스트에 expectedValue가 있으면 에러', 'expectedValue'],
          ['greaterThan', '초과', '숫자값이 expectedNumber 이하면 에러', 'expectedNumber'],
          ['lessThan', '미만', '숫자값이 expectedNumber 이상이면 에러', 'expectedNumber'],
          ['anyOf', '목록 포함', '텍스트가 목록 중 하나와도 일치하지 않으면 에러', 'expectedValues'],
          ['noneOf', '목록 제외', '텍스트가 목록 중 하나와 일치하면 에러', 'expectedValues'],
        ]),

        blank(),

        h3('시나리오 B: 에듀템 대시보드 데이터 블록 클릭'),
        body('Grafana 임베디드 차트에서 데이터 블록을 클릭하고 툴팁 값을 수집하는 특수 시나리오입니다. 차트의 .u-over 요소를 자동으로 클릭합니다.'),

        ...code(`{
  "id": "edutem-dashboard",
  "name": "에듀템 대시보드",
  "url": "https://monitoring.aidt.ai:3000/public-dashboards/...",
  "method": "GET",
  "errorConditions": {
    "cssSelectorChecks": [
      {
        "selector": ".css-xfc7jo",
        "checkType": "noneOf",
        "expectedValues": ["error", "fail"],
        "errorMessage": "에러 값이 포함된 데이터 블록 발견"
      }
    ]
  },
  "enabled": true
}`),

        blank(),

        ...warn('Playwright 체크는 브라우저를 실행하므로 HTTP 체크보다 리소스 사용량이 높습니다. 가능하면 HTTP 체크를 우선 고려하세요.'),
        ...warn('Pinpoint URL의 from/to 파라미터는 시스템이 자동으로 현재 시간 기준으로 생성합니다. URL에 임의의 값을 넣어도 체크 시점에 교체됩니다.'),

        blank(),

        // ========== 3-3. Grafana API 체크 ==========
        h2('3-3. Grafana API 체크'),
        body('Grafana 공용 대시보드(Public Dashboard) API를 직접 호출하여 시계열 수치 데이터를 조회하고 임계치와 비교합니다. 브라우저 없이 API만으로 동작합니다.'),

        blank(),

        h3('사전 준비'),
        body('Grafana API 체크를 설정하려면 다음 정보가 필요합니다:', { bold: true }),

        bullet('dashboardUid: Grafana 공용 대시보드의 UID (URL 경로에서 확인 가능)'),
        bullet('hostUrl: Grafana 서버 주소'),
        bullet('panelIds: 모니터링할 패널의 ID 목록'),

        blank(),

        body('dashboardUid 확인 방법:', { bold: true }),
        body('Grafana 공용 대시보드 URL 형식: {hostUrl}/public-dashboards/{dashboardUid}'),
        body('예: https://monitoring.aidt.ai:3000/public-dashboards/370cefbc06dd4260b45102ad0684e56e'),
        body('위 URL에서 "370cefbc06dd4260b45102ad0684e56e"가 dashboardUid입니다.'),

        blank(),

        body('panelId 확인 방법:', { bold: true }),
        bullet('Grafana 대시보드에서 패널의 "Inspect" 메뉴를 열면 확인 가능'),
        bullet('브라우저 개발자 도구의 Network 탭에서 API 요청을 캡처하여 panelId 확인'),

        blank(),

        h3('설정 예시'),

        ...code(`{
  "id": "grafana-metrics-check",
  "name": "Grafana 서비스 메트릭 모니터링",
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
      "targetServices": ["service-a", "service-b"]
    }
  },
  "enabled": true
}`),

        blank(),

        h3('grafanaApiCheck 필드 상세'),

        makeTable([
          '필드', '타입', '필수', '설명',
        ], [
          ['dashboardUid', 'string', 'O', 'Grafana 공용 대시보드 UID'],
          ['hostUrl', 'string', 'O', 'Grafana 서버 기본 URL'],
          ['panelIds', 'number[]', 'O', '조회할 패널 ID 목록 (여러 패널 동시 가능)'],
          ['threshold', 'number', 'O', '에러 임계값 (이 값 이상이면 에러)'],
          ['timeRangeHours', 'number', 'O', '조회 시간 범위 (현재부터 N시간 전까지)'],
          ['intervalMs', 'number', 'O', '데이터 포인트 간 간격 (ms)'],
          ['maxDataPoints', 'number', 'O', '최대 데이터 포인트 수'],
          ['targetServices', 'string[]', '선택', '모니터링할 서비스명 목록 (빈 배열이면 전체)'],
        ]),

        blank(),

        ...warn('targetServices는 Grafana 응답의 frame.schema.name과 정확히 일치해야 합니다. 대소문자, 슬래시 등을 포함한 전체 서비스명을 입력하세요.'),
        ...warn('threshold는 ">=" 연산으로 비교합니다. threshold가 80이면 80도 에러로 판정됩니다.'),

        blank(),

        // ========== 4. 등록 방법 ==========
        h1('4. 모니터링 대상 등록 방법'),

        h2('4-1. JSON 설정 파일 직접 수정'),
        body('data/config.json 파일에 설정을 추가합니다. 서버 재시작 후 반영됩니다.'),

        ...code(`// data/config.json
[
  {
    // ... 기존 설정들 ...
  },
  {
    // 새 모니터링 대상 추가
    "id": "new-target-id",
    "name": "새 모니터링 대상",
    "url": "https://new-target.example.com",
    "method": "GET",
    "errorConditions": { ... },
    "enabled": true
  }
]`),

        blank(),

        h2('4-2. REST API로 등록'),
        body('API Key 인증이 필요합니다. 서버 재시작 없이 즉시 반영됩니다.'),

        ...code(`// 신규 모니터링 대상 등록
POST /api/urls
Headers:
  x-api-key: YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "name": "새 모니터링 대상",
  "url": "https://new-target.example.com",
  "method": "GET",
  "errorConditions": {
    "expectedStatusCodes": [200]
  },
  "enabled": true
}

// 응답: 201 Created
{
  "success": true,
  "data": {
    "id": "auto-generated-id",
    "name": "새 모니터링 대상",
    ...
  }
}`),

        blank(),

        h3('관련 API 엔드포인트'),

        makeTable([
          '메서드', '엔드포인트', '설명',
        ], [
          ['POST', '/api/urls', '신규 대상 등록'],
          ['GET', '/api/urls', '전체 대상 목록 조회'],
          ['GET', '/api/urls/:id', '특정 대상 상세 조회'],
          ['PUT', '/api/urls/:id', '대상 설정 수정'],
          ['DELETE', '/api/urls/:id', '대상 삭제'],
          ['POST', '/api/monitoring/test-check', '특정 URL 수동 테스트'],
        ]),

        blank(),

        // ========== 5. 체크리스트 ==========
        h1('5. 등록 전 체크리스트'),
        body('새 모니터링 대상을 등록하기 전에 다음 항목을 확인하세요:'),

        blank(),

        p([t('공통', { bold: true, color: BLUE })]),
        bullet('[ ] URL이 정상적으로 접근 가능한가?'),
        bullet('[ ] id가 기존 설정과 중복되지 않는가?'),
        bullet('[ ] name이 직관적이고 알아보기 쉬운가?'),
        bullet('[ ] enabled를 true로 설정했는가?'),

        blank(),

        p([t('HTTP 체크', { bold: true, color: BLUE })]),
        bullet('[ ] 예상되는 HTTP 상태 코드를 확인했는가?'),
        bullet('[ ] 응답 시간 기준을 적절히 설정했는가?'),
        bullet('[ ] errorKeywords가 오탐지를 유발하지 않는가?'),

        blank(),

        p([t('Playwright 체크', { bold: true, color: BLUE })]),
        bullet('[ ] CSS 선택자가 정확한가? (브라우저 개발자 도구로 확인)'),
        bullet('[ ] checkType이 의도와 일치하는가?'),
        bullet('[ ] 페이지가 JavaScript 렌더링 후에만 콘텐츠가 나타나는가?'),

        blank(),

        p([t('Grafana API 체크', { bold: true, color: BLUE })]),
        bullet('[ ] 대시보드가 공용(Public)으로 설정되어 있는가?'),
        bullet('[ ] dashboardUid를 올바르게 입력했는가?'),
        bullet('[ ] panelIds가 실제 패널 ID와 일치하는가?'),
        bullet('[ ] targetServices의 서비스명이 정확히 일치하는가?'),
        bullet('[ ] threshold 값이 적절한가?'),

        blank(),

        // ========== 6. 검증 ==========
        h1('6. 등록 후 검증'),
        body('모니터링 대상을 등록한 후 반드시 수동 테스트를 실행하여 정상 동작을 확인하세요.'),

        blank(),

        h3('방법 1: 웹 대시보드에서 테스트'),
        bullet('http://localhost:11111 접속'),
        bullet('해당 URL의 "테스트" 버튼 클릭'),
        bullet('결과 상세 모달에서 상태 확인'),

        blank(),

        h3('방법 2: API로 테스트'),

        ...code(`// 수동 모니터링 실행
POST /api/monitoring/run

// 특정 URL 테스트
POST /api/monitoring/test-check
Body: { "urlId": "your-url-id" }`),

        blank(),

        h3('확인해야 할 항목'),

        bullet('[ ] 상태가 "정상" 또는 "에러"로 올바르게 판정되는가?'),
        bullet('[ ] 에러 시 Slack 알림이 정상적으로 발송되는가?'),
        bullet('[ ] 응답 시간이 합리적인 범위인가? (10초 이내 권장)'),
        bullet('[ ] 에러 메시지가 원인 파악에 충분한가?'),

        blank(),

        // ========== 7. 문제 해결 ==========
        h1('7. 자주 발생하는 문제와 해결'),

        makeTable([
          '현상', '원인', '해결 방법',
        ], [
          ['상태 코드가 항상 에러', 'expectedStatusCodes에 실제 상태 코드가 누락', '브라우저에서 URL 접속 후 개발자 도구로 실제 상태 코드 확인'],
          ['CSS 선택자를 찾을 수 없음', 'JavaScript 렌더링 전에 체크 시도', 'HTTP 체크 대신 Playwright 체크 사용'],
          ['Grafana API 조회 실패', '대시보드가 비공개 상태', 'Grafana에서 대시보드를 Public으로 설정'],
          ['targetServices 필터링 안됨', '서비스명 불일치', 'Grafana 응답 JSON의 frame.schema.name과 정확히 비교'],
          ['Slack 알림이 오지 않음', 'Webhook URL 미설정', '/api/config/webhook' 엔드포인트로 Webhook URL 등록'],
          ['Playwright 체크 타임아웃', '페이지 로딩이 60초 초과', 'URL 변경 또는 네트워크 상태 확인'],
        ]),

        blank(),

        // Footer
        blank(), blank(),
        p([t('---', { color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
        p([t('SUBAK Server Monitoring - 모니터링 대상 추가 가이드', { size: 20, color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('docs/SUBAK-Monitoring-Target-Guide.docx', buffer);
  console.log('Word document generated: docs/SUBAK-Monitoring-Target-Guide.docx');
}

main().catch(console.error);
