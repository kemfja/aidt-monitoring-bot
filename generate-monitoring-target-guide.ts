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
        p([t('모니터링 대상 추가 실무 가이드', { size: 28, color: '6b7280' })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
        blank(),
        p([t('팀원이 직접 새 사이트를 등록하는 단계별 워크플로우', { size: 24 })], { alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        blank(), blank(),
        p([t('2026.04', { size: 22, color: '6b7280' })], { alignment: AlignmentType.CENTER }),

        // ========== 1. 시작하기 전에 ==========
        h1('1. 시작하기 전에'),

        h2('1-1. 필요한 정보 목록'),
        body('모니터링 대상을 등록하기 전에 다음 정보를 미리 준비하세요:'),
        blank(),

        makeTable([
          '항목', '설명', '확인 방법',
        ], [
          ['모니터링할 URL', '체크할 웹 페이지 주소', '브라우저 주소창에서 복사'],
          ['HTTP Method', 'GET 또는 POST', '일반적으로 GET'],
          ['체크 방식', 'HTTP / Playwright / Grafana API', '섹션 2의 의사결정 트리 참조'],
          ['에러 판단 기준', '상태 코드, 응답 시간, 키워드, CSS 선택자 등', '서비스 담당자에게 확인'],
          ['CSS 선택자', 'Playwright 체크 시 필요', '브라우저 개발자 도구 (F12)'],
          ['Grafana 대시보드 UID', 'Grafana API 체크 시 필요', 'Grafana URL에서 추출'],
          ['Grafana Panel ID', 'Grafana API 체크 시 필요', 'Grafana Inspect 메뉴'],
        ]),

        blank(),

        h2('1-2. 시스템 접속 정보'),
        makeTable([
          '항목', '값',
        ], [
          ['대시보드 URL', 'http://localhost:11111'],
          ['API Key', '환경 변수 API_KEY 또는 기본값'],
          ['설정 파일 경로', 'data/config.json'],
          ['API 기본 경로', 'http://localhost:11111/api'],
        ]),

        blank(),

        // ========== 2. 모니터링 유형 선택 ==========
        h1('2. 모니터링 유형 선택'),

        h2('2-1. 의사결정 트리'),
        body('다음 흐름에 따라 적절한 체크 방식을 선택하세요:'),
        blank(),

        ...code(`[질문 1] 모니터링 대상이 Grafana 대시보드의 수치인가?
  |
  +-- YES --> Grafana API 체크 (섹션 5)
  |
  +-- NO --> [질문 2] 페이지가 JavaScript로 동적 렌더링되는가?
                |
                +-- YES --> Playwright 체크 (섹션 4)
                |
                +-- NO --> HTTP 체크 (섹션 3)`),

        blank(),

        h2('2-2. 체크 방식 비교'),
        makeTable([
          '체크 방식', '사용 케이스', '리소스', '응답 속도', '설정 난이도',
        ], [
          ['HTTP 체크', '정적 페이지, REST API', '낮음', '1-3초', '쉬움'],
          ['Playwright 체크', 'JS 렌더링 페이지, 동적 DOM', '높음', '5-15초', '보통'],
          ['Grafana API 체크', 'Grafana 대시보드 수치', '낮음', '2-5초', '보통'],
        ]),

        blank(),

        // ========== 3. HTTP 체크 설정 ==========
        h1('3. HTTP 체크 설정'),
        body('가장 기본적인 체크 방식입니다. 정적 페이지와 REST API 엔드포인트에 적합합니다.'),
        blank(),

        h2('3-1. 설정 JSON 작성'),
        body('다음 형식으로 설정을 작성합니다:'),
        blank(),

        ...code(`{
  "name": "새 모니터링 대상 이름",
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

        h2('3-2. 에러 조건 설정 가이드'),
        makeTable([
          'errorConditions 키', '타입', '설명', '예시',
        ], [
          ['expectedStatusCodes', 'number[]', '허용할 HTTP 상태 코드.\n이 목록에 없으면 에러', '[200, 201]'],
          ['maxResponseTime', 'number', '최대 응답 시간(ms).\n초과하면 에러', '3000 (3초)'],
          ['errorKeywords', 'string[]', '응답 본문에 포함되면\n에러로 판단할 키워드', '["error", "fail"]'],
        ]),

        blank(),

        ...warn('errorKeywords는 응답 HTML 전체를 검사합니다. "error" 같은 일반 단어는 CSS 클래스명 등에서 오탐지될 수 있으니, "Internal Server Error"처럼 구체적인 키워드를 사용하세요.'),

        blank(),

        h2('3-3. 등록 방법'),

        h3('방법 A: 웹 대시보드'),
        bullet('http://localhost:11111 접속'),
        bullet('"URL 추가" 버튼 클릭'),
        bullet('이름, URL, 체크 방식 입력 후 저장'),

        blank(),

        h3('방법 B: REST API'),

        ...code(`curl -X POST http://localhost:11111/api/urls \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "API 헬스 체크",
    "url": "https://api.example.com/health",
    "method": "GET",
    "errorConditions": {
      "expectedStatusCodes": [200],
      "maxResponseTime": 3000
    },
    "enabled": true
  }'`),

        blank(),

        h3('방법 C: config.json 직접 수정'),
        body('data/config.json 파일에 설정을 추가합니다. 서버 재시작 후 반영됩니다.'),
        blank(),

        ...code(`// data/config.json
[
  { ... 기존 설정들 ... },
  {
    "id": "new-target-id",
    "name": "새 모니터링 대상",
    "url": "https://api.example.com/health",
    "method": "GET",
    "errorConditions": {
      "expectedStatusCodes": [200]
    },
    "enabled": true
  }
]`),

        blank(),

        // ========== 4. Playwright 체크 설정 ==========
        h1('4. Playwright 체크 설정'),
        body('JavaScript로 동적 렌더링되는 페이지를 체크할 때 사용합니다. Pinpoint APM 대시보드, Grafana 임베디드 차트 등이 해당됩니다.'),
        blank(),

        h2('4-1. CSS 선택자 확인 방법'),
        body('브라우저 개발자 도구를 사용하여 정확한 CSS 선택자를 찾습니다:'),
        blank(),

        body('1) Chrome/FEdge에서 대상 페이지 열기', { bold: true }),
        bullet('F12 키를 눌러 개발자 도구 열기'),
        blank(),

        body('2) 요소 선택 (Inspect)', { bold: true }),
        bullet('개발자 도구 좌측 상단의 화살표 아이콘 클릭'),
        bullet('페이지에서 확인할 요소 위로 마우스 이동'),
        bullet('요소가 파란색으로 강조되면 클릭'),
        blank(),

        body('3) 선택자 복사', { bold: true }),
        bullet('Elements 패널에서 해당 요소 우클릭'),
        bullet('Copy > Copy selector 클릭'),
        bullet('또는 직접 HTML 구조를 보고 선택자 작성'),

        blank(),

        body('실제 운영에서 사용 중인 선택자 예시:', { bold: true }),
        ...code(`// Pinpoint APM - Failed 건수
label[for*="failed"] .__scatter_chart__legend_count

// Grafana 임베디드 차트 - 툴팁
.css-xfc7jo

// Grafana 차트 - 데이터 블록
.u-over`),

        blank(),

        h2('4-2. checkType 선택 가이드'),
        body('추출한 텍스트 값을 어떻게 판단할지 선택합니다:'),
        blank(),

        makeTable([
          'checkType', '의미', '에러 판정', '사용 필드',
        ], [
          ['equals', '일치', '텍스트가 expectedValue와 같으면 에러', 'expectedValue'],
          ['notEquals', '불일치', '텍스트가 expectedValue와 다르면 에러', 'expectedValue'],
          ['contains', '포함', '텍스트에 expectedValue가 없으면 에러', 'expectedValue'],
          ['notContains', '미포함', '텍스트에 expectedValue가 있으면 에러', 'expectedValue'],
          ['greaterThan', '초과', '숫자값이 expectedNumber 이하면 에러', 'expectedNumber'],
          ['lessThan', '미만', '숫자값이 expectedNumber 이상이면 에러', 'expectedNumber'],
          ['anyOf', '목록 포함', '텍스트가 목록 중 하나와 일치하면 에러', 'expectedValues'],
          ['noneOf', '목록 제외', '텍스트가 목록 중 하나와 일치하면 에러', 'expectedValues'],
        ]),

        blank(),

        h2('4-3. 실제 예시: Pinpoint Failed 건수'),
        body('현재 운영 중인 LMS API 데이터 모니터링 설정입니다. Pinpoint APM 대시보드에서 Failed 건수가 0이 아니면 에러로 판단합니다.'),
        blank(),

        ...code(`{
  "id": "lms-api-check",
  "name": "LMS api 데이터",
  "url": "https://pinpoint.aidt.ai/serverMap/lms-api@SPRING_BOOT?from=...&to=...",
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

        body('이 설정이 하는 일:', { bold: true }),
        bullet('Pinpoint 대시보드를 헤드리스 Chrome으로 렌더링'),
        bullet('"failed" 레이블 옆의 카운트 값을 읽음'),
        bullet('값이 "0"이 아니면 에러로 판단하여 Slack 알림 발송'),

        blank(),

        ...warn('Pinpoint URL의 from/to 파라미터는 시스템이 자동으로 현재 시간 기준으로 생성합니다. URL에 임의의 값을 넣어도 체크 시점에 교체됩니다.'),

        blank(),

        h2('4-4. 실제 예시: 에듀텀 대시보드'),
        body('Grafana 임베디드 차트에서 데이터 블록을 자동으로 클릭하고 툴팁 값을 수집하는 시나리오입니다.'),
        blank(),

        body('동작 방식:', { bold: true }),
        bullet('1. 페이지 로드 후 .u-over 요소(데이터 블록)를 찾음'),
        bullet('2. 각 데이터 블록을 순차적으로 클릭'),
        bullet('3. 클릭 후 나타나는 .css-xfc7jo 툴팁에서 텍스트 추출'),
        bullet('4. 추출한 값이 "error", "fail" 등이면 에러로 판단'),

        blank(),

        ...code(`{
  "id": "edutem-check",
  "name": "에듀텀 대시보드",
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

        h2('4-5. 주의사항'),
        ...warn('Playwright 체크는 브라우저를 실행하므로 HTTP 체크보다 리소스 사용량이 높습니다 (메모리 약 200-500MB). 가능하면 HTTP 체크를 우선 고려하세요.'),
        ...warn('CSS 선택자는 대시보드 업데이트 시 변경될 수 있습니다. 정기적으로 동작을 확인하세요.'),
        ...warn('페이지 로딩이 60초를 초과하면 타임아웃으로 실패합니다.'),

        blank(),

        // ========== 5. Grafana API 체크 설정 ==========
        h1('5. Grafana API 체크 설정'),
        body('Grafana 공용 대시보드(Public Dashboard) API를 직접 호출하여 시계열 수치를 조회합니다. 브라우저 없이 API만으로 동작합니다.'),
        blank(),

        h2('5-1. 사전 준비: 정보 수집'),
        body('다음 3가지 정보를 먼저 수집해야 합니다:'),
        blank(),

        p([t('dashboardUid 찾기', { bold: true, color: BLUE })]),
        body('Grafana 공용 대시보드 URL에서 추출합니다:'),
        ...code(`URL 형식: {hostUrl}/public-dashboards/{dashboardUid}

예: https://monitoring.aidt.ai:3000/public-dashboards/370cefbc06dd4260b45102ad0684e56e
    --> dashboardUid = 370cefbc06dd4260b45102ad0684e56e`),

        blank(),

        p([t('panelId 찾기', { bold: true, color: BLUE })]),
        body('두 가지 방법으로 확인할 수 있습니다:'),
        bullet('방법 1: Grafana 대시보드에서 패널의 "Inspect" 메뉴 열기'),
        bullet('방법 2: 브라우저 개발자 도구 Network 탭에서 API 요청 캡처'),

        blank(),

        p([t('targetServices 확인', { bold: true, color: BLUE })]),
        body('모니터링할 서비스명을 정확히 확인해야 합니다:'),
        bullet('Grafana 응답 JSON에서 frame.schema.name 값 확인'),
        bullet('대소문자, 슬래시를 포함한 전체 서비스명 입력'),
        ...code(`예: "aidt-prd-edu-n-api01/pron_v2/"`),

        blank(),

        h2('5-2. 설정 JSON 작성'),
        body('현재 운영 중인 에듀텀 대시보드 Grafana API 설정을 기반으로 작성합니다:'),
        blank(),

        ...code(`{
  "id": "grafana-edutem",
  "name": "에듀텀 대시보드",
  "url": "https://monitoring.aidt.ai:3000/public-dashboards/370cefbc...",
  "method": "GET",
  "errorConditions": {
    "grafanaApiCheck": {
      "dashboardUid": "370cefbc06dd4260b45102ad0684e56e",
      "hostUrl": "https://monitoring.aidt.ai:3000",
      "panelIds": [32, 28, 17, 26, 21, 18],
      "threshold": 6,
      "timeRangeHours": 6,
      "intervalMs": 60000,
      "maxDataPoints": 273,
      "targetServices": [
        "aidt-prd-edu-n-api01/pron_v2/",
        "aidt-prd-edu-n-api02/pron_v2/",
        "api_lb/pron_v2/",
        "api_lb/v1/gec"
      ]
    }
  },
  "enabled": true
}`),

        blank(),

        h2('5-3. 필드 상세 설명'),
        makeTable([
          '필드', '타입', '필수', '설명',
        ], [
          ['dashboardUid', 'string', 'O', 'Grafana 공용 대시보드 UID'],
          ['hostUrl', 'string', 'O', 'Grafana 서버 기본 URL'],
          ['panelIds', 'number[]', 'O', '조회할 패널 ID 목록'],
          ['threshold', 'number', 'O', '에러 임계값 (이 값 이상이면 에러)'],
          ['timeRangeHours', 'number', 'O', '조회 시간 범위 (현재부터 N시간 전까지)'],
          ['intervalMs', 'number', 'O', '데이터 포인트 간 간격 (ms)'],
          ['maxDataPoints', 'number', 'O', '최대 데이터 포인트 수'],
          ['targetServices', 'string[]', '선택', '모니터링할 서비스명 (빈 배열이면 전체)'],
        ]),

        blank(),

        h2('5-4. targetServices 작성 팁'),
        body('targetServices에 지정한 서비스만 모니터링 결과에 표시됩니다. 지정하지 않으면 모든 서비스가 대상이 됩니다.'),
        blank(),

        body('서비스명 확인 방법:', { bold: true }),
        bullet('1. Grafana 대시보드에서 패널의 Inspect > Query inspector 열기'),
        bullet('2. API 응답 JSON에서 results.A.frames[].schema.name 값 확인'),
        bullet('3. 해당 값을 targetServices 배열에 정확히 입력'),

        blank(),

        ...warn('targetServices는 ">=" 연산으로 비교합니다. threshold가 6이면 6도 에러로 판정됩니다.'),
        ...warn('targetServices는 Grafana 응답의 frame.schema.name과 정확히 일치해야 합니다. 대소문자, 슬래시 등을 포함한 전체 서비스명을 입력하세요.'),

        blank(),

        // ========== 6. 등록 및 테스트 ==========
        h1('6. 등록 및 테스트'),

        h2('6-1. 등록'),
        body('API를 통해 등록하는 것을 권장합니다. 서버 재시작 없이 즉시 반영됩니다.'),
        blank(),

        ...code(`// POST /api/urls 로 등록
curl -X POST http://localhost:11111/api/urls \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ ... 위에서 작성한 JSON ... }'

// 응답: 201 Created
// { "success": true, "data": { "id": "auto-generated-id", ... } }`),

        blank(),

        h2('6-2. 즉시 테스트'),
        body('등록 후 반드시 수동 테스트를 실행하세요:'),
        blank(),

        p([t('웹 대시보드에서 테스트', { bold: true, color: BLUE })]),
        bullet('http://localhost:11111 접속'),
        bullet('해당 URL의 "테스트" 버튼 클릭'),
        bullet('결과 상세 모달에서 수집된 값 확인'),

        blank(),

        p([t('API로 테스트', { bold: true, color: BLUE })]),
        ...code(`// 수동 모니터링 실행
POST /api/monitoring/run

// 특정 URL 테스트
POST /api/monitoring/test-check
Body: { "urlId": "등록된-id" }`),

        blank(),

        h2('6-3. 결과 확인 포인트'),
        body('테스트 후 다음 항목을 확인하세요:'),
        blank(),

        bullet('[ ] 상태가 "정상" 또는 "에러"로 올바르게 판정되는가?'),
        bullet('[ ] 에러 시 Slack 알림이 정상적으로 발송되는가?'),
        bullet('[ ] 응답 시간이 합리적인 범위인가? (HTTP: 3초, Playwright: 15초 이내)'),
        bullet('[ ] 에러 메시지가 원인 파악에 충분한가?'),
        bullet('[ ] CSS 선택자에서 올바른 값이 추출되는가?'),

        blank(),

        // ========== 7. 문제 해결 ==========
        h1('7. 자주 발생하는 문제와 해결'),
        blank(),

        makeTable([
          '현상', '가능한 원인', '해결 방법',
        ], [
          ['상태 코드가 항상 에러', 'expectedStatusCodes에\n실제 상태 코드가 누락', '개발자 도구 Network 탭에서\n실제 상태 코드 확인 후 추가'],
          ['CSS 선택자를 찾을 수 없음', 'JavaScript 렌더링 전에\n체크를 시도함', 'HTTP 체크 대신 Playwright 체크 사용'],
          ['Pinpoint URL에서 데이터가 안 나옴', 'from/to 시간 범위 문제', '시스템이 자동 생성하므로\n원래 URL 그대로 입력'],
          ['Grafana API 404 에러', '대시보드가 비공개 상태', 'Grafana에서 대시보드를\nPublic으로 설정'],
          ['targetServices 필터링 안됨', '서비스명 불일치', 'Grafana 응답 JSON의\nframe.schema.name과 정확히 비교'],
          ['Playwright 체크 타임아웃', '페이지 로딩이 60초 초과', '네트워크 상태 확인 또는\nURL 변경 검토'],
          ['Slack 알림이 오지 않음', 'Webhook URL 미설정', 'POST /api/config/webhook 으로\nWebhook URL 등록'],
          ['CSS 선택자 값이 빈 문자열', '선택자가 동적 렌더링 후 생성됨', 'Playwright 체크 사용 또는\n다른 선택자 시도'],
        ]),

        blank(),

        // ========== 8. 빠른 참조 카드 ==========
        h1('8. 빠른 참조 카드'),

        h2('8-1. HTTP 체크 JSON 템플릿'),
        ...code(`{
  "name": "이름",
  "url": "https://...",
  "method": "GET",
  "errorConditions": {
    "expectedStatusCodes": [200],
    "maxResponseTime": 3000,
    "errorKeywords": []
  },
  "enabled": true
}`),

        blank(),

        h2('8-2. Playwright 체크 JSON 템플릿'),
        ...code(`{
  "name": "이름",
  "url": "https://...",
  "method": "GET",
  "errorConditions": {
    "cssSelectorChecks": [{
      "selector": "CSS 선택자",
      "checkType": "notEquals",
      "expectedValues": ["0"],
      "errorMessage": "에러 메시지"
    }]
  },
  "enabled": true
}`),

        blank(),

        h2('8-3. Grafana API 체크 JSON 템플릿'),
        ...code(`{
  "name": "이름",
  "url": "https://grafana-host/public-dashboards/UID",
  "method": "GET",
  "errorConditions": {
    "grafanaApiCheck": {
      "dashboardUid": "UID",
      "hostUrl": "https://grafana-host",
      "panelIds": [1],
      "threshold": 80,
      "timeRangeHours": 1,
      "intervalMs": 1000,
      "maxDataPoints": 100,
      "targetServices": []
    }
  },
  "enabled": true
}`),

        blank(),

        h2('8-4. API 엔드포인트 요약'),
        makeTable([
          '메서드', '엔드포인트', '용도',
        ], [
          ['POST', '/api/urls', '신규 대상 등록'],
          ['GET', '/api/urls', '전체 대상 목록 조회'],
          ['GET', '/api/urls/:id', '특정 대상 상세 조회'],
          ['PUT', '/api/urls/:id', '대상 설정 수정'],
          ['DELETE', '/api/urls/:id', '대상 삭제'],
          ['POST', '/api/monitoring/run', '전체 모니터링 실행'],
          ['POST', '/api/monitoring/test-check', '특정 URL 수동 테스트'],
        ]),

        blank(),

        // Footer
        blank(), blank(),
        p([t('---', { color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
        p([t('SUBAK Server Monitoring - 모니터링 대상 추가 실무 가이드', { size: 20, color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('docs/SUBAK-Monitoring-Target-Addition-Guide.docx', buffer);
  console.log('Word document generated: docs/SUBAK-Monitoring-Target-Addition-Guide.docx');
}

main().catch(console.error);
