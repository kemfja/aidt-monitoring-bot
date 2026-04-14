import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
  AlignmentType, ShadingType
} from 'docx';
import * as fs from 'fs';

// 색상
const BLUE = '1a56db';
const GRAY_BG = 'f3f4f6';
const DARK = '1f2937';
const RED = 'dc3545';
const GREEN = '28a745';

function t(text: string, opts?: { bold?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({ text, font: 'Malgun Gothic', size: opts?.size ?? 22, bold: opts?.bold, color: opts?.color });
}

function p(runs: TextRun[], opts?: { spacing?: { after?: number; before?: number }; alignment?: typeof AlignmentType[keyof typeof AlignmentType]; indent?: { left?: number } }): Paragraph {
  return new Paragraph({
    spacing: opts?.spacing ?? { after: 120 },
    alignment: opts?.alignment,
    indent: opts?.indent,
    children: runs,
  });
}

function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Malgun Gothic', color: BLUE })],
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Malgun Gothic', color: '374151' })],
  });
}

function code(codeStr: string): Paragraph[] {
  return codeStr.split('\n').map(line =>
    new Paragraph({
      spacing: { after: 0, line: 260 },
      shading: { type: ShadingType.CLEAR, fill: GRAY_BG },
      indent: { left: 200 },
      children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 18, color: DARK })],
    })
  );
}

function blank(): Paragraph { return p([], { spacing: { after: 80 } }); }

function body(text: string, opts?: { bold?: boolean; color?: string; indent?: number }): Paragraph {
  return p([t(text, { bold: opts?.bold, color: opts?.color })], {
    spacing: { after: 100 },
    indent: opts?.indent ? { left: opts.indent } : undefined,
  });
}

function bullet(text: string, level: number = 0): Paragraph {
  return p([t(text)], { spacing: { after: 60 }, indent: { left: 400 + level * 300 } });
}

function cell(text: string, opts?: { bold?: boolean; shading?: string; color?: string }): TableCell {
  return new TableCell({
    shading: opts?.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    children: [p([t(text, { bold: opts?.bold, color: opts?.color })])],
  });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: BLUE },
    children: [p([t(text, { bold: true, color: 'FFFFFF' })])],
  });
}

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map(h => headerCell(h)) }),
      ...rows.map((row, i) =>
        new TableRow({ children: row.map(c => cell(c, { shading: i % 2 === 1 ? GRAY_BG : undefined })) })
      ),
    ],
  });
}

async function main() {
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Malgun Gothic', size: 22 } } } },
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      children: [
        // ========== 표지 ==========
        blank(), blank(), blank(), blank(),
        p([t('SUBAK Server Monitoring', { bold: true, size: 48, color: BLUE })], { alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        p([t('프로젝트 개요 문서', { size: 28, color: '6b7280' })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
        blank(),
        p([t('3개 모니터링 사이트 자동화 모니터링 시스템', { size: 24 })], { alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        blank(), blank(),
        p([t('Grafana + Pinpoint + Edutem Dashboard', { size: 22, color: '6b7280' })], { alignment: AlignmentType.CENTER }),
        p([t('TypeScript / Node.js / Express / Playwright', { size: 22, color: '6b7280' })], { alignment: AlignmentType.CENTER }),
        p([t('2026.04', { size: 22, color: '6b7280' })], { alignment: AlignmentType.CENTER }),

        // ========== 1. 문제사항 ==========
        heading1('1. 문제사항 (AS-IS)'),

        heading2('1-1. 배경'),
        body('팀에서는 프로덕션 서비스의 상태를 확인하기 위해 3개의 모니터링 대시보드를 운영하고 있었습니다:'),

        makeTable([
          '번호', '모니터링 대상', 'URL', '확인 방식',
        ], [
          ['1', '에듀템 대시보드 (Grafana)', 'monitoring.aidt.ai:3000', '수동 수치 확인'],
          ['2', 'LMS API 데이터 (Pinpoint APM)', 'pinpoint.aidt.ai/serverMap/lms-api', '수동 Failed 건수 확인'],
          ['3', 'Viewer API 데이터 (Pinpoint APM)', 'pinpoint.aidt.ai/serverMap/viewer-api', '수동 Failed 건수 확인'],
        ]),

        blank(),

        heading2('1-2. 문제점'),
        p([t('문제 1: 반복적인 수동 작업', { bold: true, size: 22 })]),
        bullet('매시간 3개의 브라우저 탭을 수동으로 열어야 함'),
        bullet('Grafana 대시보드의 메트릭 값을 임계치와 일일이 비교'),
        bullet('Pinpoint APM을 열고 Failed 건수가 0인지 육안으로 확인'),
        bullet('하루 24회(매시간) 반복되는 동일한 작업'),

        blank(),

        p([t('문제 2: 장애 대응 지연', { bold: true, size: 22 })]),
        bullet('담당자가 확인 시간을 놓치면 에러 탐지가 지연됨'),
        bullet('비업무 시간(야간, 주말)은 모니터링 공백 발생'),
        bullet('임계치 초과가 수시간 동안 미인지 될 수 있음'),

        blank(),

        p([t('문제 3: 불일치한 에러 탐지', { bold: true, size: 22 })]),
        bullet('사람의 육안 검사는 누락 가능성 존재'),
        bullet('표준화된 기준이 없어 담당자마다 판단이 달라질 수 있음'),
        bullet('확인 이력이나 감사 추적(audit trail) 부재'),

        blank(),

        // ========== 2. 목적 ==========
        heading1('2. 목적 (TO-BE)'),
        body('3개 사이트의 수동 모니터링을 자동화하여 다음과 같은 목표를 달성하고자 합니다:'),

        blank(),

        p([t('목표 1: 전체 자동화', { bold: true, color: BLUE })]),
        bullet('Cron 기반 스케줄러가 매시간 3개 사이트를 자동 체크'),
        bullet('사람의 개입 없이 24시간 무인 모니터링'),

        blank(),

        p([t('목표 2: 실시간 알림', { bold: true, color: BLUE })]),
        bullet('에러 탐지 시 Slack 웹훅 알림 즉시 발송'),
        bullet('알림에 어느 서비스에서, 어떤 수치가, 언제 발생했는지 상세 정보 포함'),

        blank(),

        p([t('목표 3: 통합 대시보드', { bold: true, color: BLUE })]),
        bullet('단일 웹 UI에서 모든 모니터링 결과 확인'),
        bullet('필터링 및 페이지네이션이 적용된 과거 이력 조회'),

        blank(),

        p([t('목표 4: 정확한 에러 탐지', { bold: true, color: BLUE })]),
        bullet('기계 기반 임계치 비교 (사람의 판단 편차 제거)'),
        bullet('동적 콘텐츠 지원 (JavaScript 렌더링 페이지)'),
        bullet('API 수준 메트릭 조회 지원 (Grafana 공용 API)'),

        blank(),

        // ========== 3. 해결방안 ==========
        heading1('3. 해결방안 (아키텍처)'),

        heading2('3-1. 다중 모드 모니터링 전략'),
        body('3개의 모니터링 대상은 근본적으로 다른 접근 방식이 필요했습니다. 단일 방식으로는 모든 케이스를 커버할 수 없었습니다:'),

        blank(),

        makeTable([
          '대상', '콘텐츠 유형', '체크 방식', '핵심 기술',
        ], [
          ['에듀템 대시보드\n(Grafana)', '시계열 메트릭\n(수치 데이터)', '직접 API 조회\n+ 임계치 비교', 'Grafana Public API\n(Axios)'],
          ['LMS API 데이터\n(Pinpoint)', '동적 DOM\n(JavaScript 렌더링)', '헤드리스 브라우저\n+ CSS 선택자 추출', 'Playwright\n(Chromium)'],
          ['Viewer API 데이터\n(Pinpoint)', '동적 DOM\n(JavaScript 렌더링)', '헤드리스 브라우저\n+ CSS 선택자 추출', 'Playwright\n(Chromium)'],
        ]),

        blank(),

        heading2('3-2. 시스템 아키텍처 개요'),

        ...code(`+-------------------+     +------------------+     +------------------+
|   Scheduler       |     |   Monitor Core   |     |   Notifier       |
|   (node-cron)     | --> |   (3-way check)  | --> |   (Slack Webhook)|
|   Every hour      |     |                  |     |                  |
+-------------------+     +------------------+     +------------------+
                                  |
                    +-------------+-------------+
                    |             |             |
              +-----+-----+ +----+-----+ +----+-----+
              | HTTP       | |Playwright| | Grafana  |
              | Checker    | | Checker  | | Checker  |
              | (Axios)    | | (Chrome) | | (API)    |
              +------------+ +----------+ +----------+
                    |             |             |
                    v             v             v
              +--------------------------------------------+
              |         JSON Repository (File-based)       |
              |   data/monitoring-YYYY-MM-DD.json           |
              |   data/config.json                          |
              +--------------------------------------------+
                                  |
                                  v
              +--------------------------------------------+
              |         Web Dashboard (Express + Vanilla JS)|
              |         http://localhost:11111               |
              +--------------------------------------------+`),

        blank(),

        heading2('3-3. 핵심 동작 흐름'),
        body('시스템은 다음과 같은 주기적 흐름으로 동작합니다:', { bold: true }),

        ...code(`1. 스케줄러가 모니터링 트리거 (cron 주기)
   |
2. 저장소에서 활성화된 모든 URL 설정 로드
   |
3. 각 URL에 대해 체크 전략 선택:
   |
   +-- grafanaApiCheck 설정 존재? --> Grafana API 체커
   |     - Grafana 공용 API에 POST 요청
   |     - 응답 프레임에서 데이터 포인트 추출
   |     - 각 값을 임계치와 비교
   |
   +-- cssSelectorChecks 설정 존재? --> Playwright 체커
   |     - 공유 헤드리스 Chrome 실행
   |     - URL 이동, 동적 콘텐츠 대기
   |     - CSS 선택자로 텍스트 추출
   |     - Pinpoint: 시간 범위 동적 생성
   |     - 에듀템: 데이터 블록 클릭, 툴팁 수집
   |
   +-- 둘 다 없으면 --> HTTP 체커
         - 단순 GET/POST 요청
         - 상태 코드, 응답 시간, 키워드 검증
   |
4. 결과를 JSON 파일에 저장 (일별)
   |
5. 에러 결과 필터링 --> Slack 알림 발송
   |
6. 7일 이전 데이터 자동 정리`),

        blank(),

        // ========== 4. 제작방법 ==========
        heading1('4. 제작 방법 (상세 구현)'),

        heading2('4-1. 기술 스택'),

        makeTable([
          '구분', '기술', '용도',
        ], [
          ['언어', 'TypeScript 5.3', '전체 스택 타입 안전성'],
          ['런타임', 'Node.js', '서버 사이드 JavaScript 실행 환경'],
          ['프레임워크', 'Express.js 4.18', 'REST API 서버'],
          ['브라우저 자동화', 'Playwright 1.58', '동적 콘텐츠 체크'],
          ['HTTP 클라이언트', 'Axios 1.6', 'HTTP 요청 + Grafana API 호출'],
          ['HTML 파싱', 'Cheerio 1.0', '서버 사이드 DOM 파싱'],
          ['스케줄러', 'node-cron 3.0', 'Cron 기반 주기적 실행'],
          ['로깅', 'Winston 3.11', '구조화된 로깅 + 일별 로테이션'],
          ['프론트엔드', 'Vanilla JS + HTML5/CSS3', '경량 대시보드 (프레임워크 없음)'],
          ['프로세스 관리', 'PM2', '프로덕션 프로세스 관리'],
          ['배포', 'Render.com', '클라우드 호스팅 (무료 티어)'],
        ]),

        blank(),

        heading2('4-2. 프로젝트 구조'),

        ...code(`subak-server-monitoring/
 +-- src/
 |   +-- server.ts              # 진입점: 서버 구동 + 스케줄러 시작
 |   +-- app.ts                 # Express 앱 팩토리
 |   +-- config/
 |   |   +-- index.ts           # 환경 설정 관리자
 |   +-- core/
 |   |   +-- monitor.ts         # 모니터링 코어: 3-way 전략 분기
 |   |   +-- scheduler.ts       # Cron 스케줄러 + 모니터링 오케스트레이션
 |   |   +-- notifier.ts        # Slack 웹훅 알림
 |   +-- models/
 |   |   +-- url-config.ts      # UrlConfig, ErrorConditions, GrafanaApiCheck
 |   |   +-- monitor-result.ts  # MonitorResult, GrafanaCheckDetail 등
 |   +-- repositories/
 |   |   +-- json-repository.ts # JSON 파일 기반 데이터 영속성
 |   +-- routes/
 |   |   +-- url-routes.ts      # URL CRUD 엔드포인트
 |   |   +-- monitoring-routes.ts # 모니터링 제어 엔드포인트
 |   |   +-- config-routes.ts   # 웹훅 설정 엔드포인트
 |   +-- services/
 |   |   +-- monitoring-service.ts # 비즈니스 로직 계층
 |   |   +-- url-service.ts     # URL 관리 로직
 |   +-- utils/
 |       +-- http-client.ts     # HTTP 상태 체커
 |       +-- playwright-checker.ts # 브라우저 자동화 체커
 |       +-- grafana-checker.ts # Grafana API 임계치 체커
 |       +-- html-parser.ts     # Cheerio 기반 HTML 파싱
 |       +-- logger.ts          # Winston 로거 설정
 +-- public/                    # 정적 프론트엔드 파일
 |   +-- index.html
 |   +-- js/dashboard.js
 |   +-- css/style.css
 +-- data/                      # 런타임 데이터 디렉토리
 +-- tests/                     # 테스트 파일
 +-- render.yaml                # Render.com 배포 설정
 +-- start-server.bat           # Windows 시작 스크립트
 +-- package.json
 +-- tsconfig.json`),

        blank(),

        heading2('4-3. 핵심 구현: 3가지 모니터링 전략'),

        p([t('(A) Grafana API 체커', { bold: true, color: BLUE })]),
        body('Grafana 공용 대시보드 API를 직접 호출하여 수치 메트릭을 추출하고 임계치와 비교합니다. 브라우저 없이 순수 API 호출로 동작합니다.'),

        ...code(`// 핵심 로직: 각 패널 조회, 데이터 포인트 추출, 임계치 비교
for (const panelId of panelIds) {
  const apiUrl =
    \`\${hostUrl}/api/public/dashboards/\${dashboardUid}/panels/\${panelId}/query\`;

  const response = await axios.post(apiUrl, requestBody);
  const results = response.data?.results || {};

  for (const frame of results[refId].frames) {
    const serviceName = frame.schema?.name;
    const timeArray = frame.data.values[0];
    const valueArray = frame.data.values[1];

    for (const val of valueArray) {
      if (val >= threshold) {
        allErrorDataPoints.push({ service: serviceName, time, value: val });
      }
    }
  }
}

// 에러 데이터가 0건이면 정상
const isValid = allErrorDataPoints.length === 0;`),

        blank(),

        p([t('(B) Playwright 체커 (Pinpoint APM)', { bold: true, color: BLUE })]),
        body('헤드리스 Chrome을 실행하여 JavaScript 기반의 Pinpoint APM 대시보드를 렌더링합니다. 시간 범위 URL을 동적으로 생성하고 CSS 선택자로 DOM 값을 추출합니다.'),

        ...code(`// 공유 브라우저 인스턴스 (반복 실행/종료 방지)
const browser = await getSharedBrowser();
const page = await browser.newPage();

// Pinpoint용 동적 시간 범위 URL 생성
const resolvedUrl = resolveDynamicUrl(config.url);
// from=...&to=... 을 현재 시간 기준으로 교체

await page.goto(resolvedUrl, { waitUntil: 'networkidle' });

// CSS 선택자로 Failed 건수 추출
const element = await page.locator(
  'label[for*="failed"] .__scatter_chart__legend_count'
);
const failedCount = await element.textContent();

// 검증: Failed 건수가 "0"이어야 정상
if (failedCount !== '0') {
  // 에러 탐지!
}`),

        blank(),

        p([t('(C) Playwright 체커 (에듀템 대시보드)', { bold: true, color: BLUE })]),
        body('Grafana 임베디드 차트에 특화된 인터랙션입니다. 각 데이터 블록을 클릭하여 툴팁을 표시하고, 모든 툴팁 값을 수집하여 에러 조건을 검사합니다.'),

        ...code(`// 각 데이터 블록을 클릭하여 툴팁 표시
const dataBlocks = page.locator('.u-over');
const count = await dataBlocks.count();

for (let i = 0; i < count; i++) {
  await dataBlocks.nth(i).click();
  await page.waitForTimeout(200);

  // 툴팁 텍스트 추출
  const tooltip = await page.locator('.css-xfc7jo').first();
  const text = await tooltip.textContent();
  collectedTooltips.push(text);

  if (expectedValues.includes(text)) {
    errorFound = true;
  }
}`),

        blank(),

        heading2('4-4. 알림 시스템'),

        body('모니터링 체크에서 에러가 탐지되면 Slack 웹훅 알림이 즉시 발송됩니다. 서비스명, 상태, 에러 메시지, 발생 시간 등의 상세 정보가 포함됩니다:'),

        ...code(`// Slack 메시지 포맷
{
  text: ":x: [에듀템 대시보드] 에러",
  attachments: [{
    color: "danger",
    fields: [
      { title: "URL 이름", value: "에듀템 대시보드", short: true },
      { title: "상태", value: "에러", short: true },
      { title: "대시보드", value: "<https://...|에듀템 대시보드 바로가기>" },
      { title: "상태 코드", value: "200", short: true },
      { title: "응답 시간", value: "1234ms", short: true },
      { title: "에러 메시지", value: "수치 임계값(6) 초과 3건: ..." },
      { title: "발생 시간", value: "2026. 4. 2. 14:30:00" }
    ]
  }]
}`),

        blank(),

        heading2('4-5. 데이터 저장'),
        body('단순성과 외부 의존성 제로를 위해 JSON 파일 기반 저장소를 사용합니다:'),

        ...code(`data/
  +-- config.json                  # 모니터링 URL 설정
  +-- webhook.json                 # Slack 웹훅 URL
  +-- monitoring-2026-04-01.json   # 일별 모니터링 결과
  +-- monitoring-2026-04-02.json   # 7일 경과 시 자동 삭제`),

        blank(),

        heading2('4-6. API 엔드포인트'),

        makeTable([
          '메서드', '엔드포인트', '설명',
        ], [
          ['GET', '/api/urls', '전체 모니터링 설정 조회'],
          ['POST', '/api/urls', '신규 모니터링 대상 생성 (API Key 필요)'],
          ['PUT', '/api/urls/:id', '모니터링 대상 수정'],
          ['DELETE', '/api/urls/:id', '모니터링 대상 삭제'],
          ['GET', '/api/monitoring/results', '모니터링 이력 조회'],
          ['GET', '/api/monitoring/status', '시스템 상태 요약'],
          ['POST', '/api/monitoring/run', '수동 모니터링 실행'],
          ['GET', '/api/monitoring/scheduler/status', '스케줄러 상태 확인'],
          ['POST', '/api/monitoring/scheduler/toggle', '스케줄러 ON/OFF 전환'],
          ['POST', '/api/monitoring/test-notification', '테스트 Slack 알림 발송'],
        ]),

        blank(),

        heading2('4-7. 배포'),

        p([t('클라우드 배포 (Render.com)', { bold: true })]),
        body('render.yaml로 원클릭 배포가 설정되어 있습니다. 무료 티어에서 1GB 영구 디스크로 데이터를 저장합니다.'),

        ...code(`services:
  - type: web
    name: aidt-monitoring-bot
    plan: free
    envVars:
      - MONITORING_INTERVAL: "0 * * * *"   # 매시간 실행
      - DATA_DIR: /opt/render/project/data
    disk:
      sizeGB: 1`),

        blank(),

        p([t('로컬 배포 (Windows)', { bold: true })]),
        body('start-server.bat이 전체 시작 시퀀스를 처리합니다:'),

        ...code(`1. TypeScript 컴파일 (npx tsc)
2. PM2 프로세스 시작 (dist/server.js)
3. Chrome 대시보드 자동 열기 (localhost:11111)
4. Slack 앱 자동 실행`),

        blank(),

        // ========== 5. 결과 ==========
        heading1('5. 결과'),

        heading2('5-1. 도입 전후 비교'),

        makeTable([
          '항목', '도입 전 (수동)', '도입 후 (자동화)',
        ], [
          ['체크 빈도', '매시간 (담당자가 기억할 때만)', '매시간 보장 (cron)'],
          ['비업무 시간 커버', '없음 (야간/주말)', '24시간 무인 감시'],
          ['에러 탐지 시간', '수분 ~ 수시간', '즉시 (체크 주기 내)'],
          ['알림 수단', '육안 검사만', 'Slack 알림 (상세 정보 포함)'],
          ['하루 인력 투입', '약 24회 수동 체크', '0 (전체 자동화)'],
          ['과거 이력', '없음', '7일 롤링 저장'],
          ['일관성', '가변적 (사람 판단)', '결정론적 (기계 임계치)'],
        ]),

        blank(),

        heading2('5-2. 운영 효과'),

        p([t('업무 효율성', { bold: true, color: GREEN })]),
        bullet('3개 모니터링 사이트의 하루 약 24회 수동 체크 업무 완전 제거'),
        bullet('담당자가 루틴 모니터링 대신 실제 장애 대응에 집중 가능'),

        blank(),

        p([t('안정성', { bold: true, color: GREEN })]),
        bullet('무결점 모니터링: 비업무 시간 누락 없음'),
        bullet('일관된 임계치 적용: 사람의 판단 편차 제거'),
        bullet('일시적 장애에 대한 자동 재시도 메커니즘 (Playwright: 2회 재시도)'),

        blank(),

        p([t('가시성', { bold: true, color: GREEN })]),
        bullet('통합 웹 대시보드로 실시간 상태 한눈에 파악'),
        bullet('7일간의 과거 데이터로 트렌드 분석 가능'),
        bullet('Slack 연동으로 팀 전체에 즉시 알림 전파'),

        blank(),

        heading2('5-3. 기술적 성과'),

        bullet('다중 모드 모니터링: HTTP + Playwright + Grafana API를 단일 시스템에 통합'),
        bullet('공유 브라우저 인스턴스 + keep-alive (Chromium 반복 실행 방지)'),
        bullet('Pinpoint 시간 범위 쿼리를 위한 동적 URL 생성'),
        bullet('Grafana 임베디드 차트 툴팁 추출을 위한 데이터 블록 인터랙션'),
        bullet('데이터베이스 없는 아키텍처 (JSON 파일 기반, 7일 자동 정리)'),
        bullet('프레임워크 없는 프론트엔드 (Vanilla JS, 번들 사이즈 제로)'),
        bullet('Graceful shutdown 처리 (SIGINT/SIGTERM)'),
        bullet('쓰기 작업에 대한 API Key 인증'),
        bullet('무료 티어 클라우드 배포 가능 (Render.com)'),

        blank(),

        // ========== 6. 기술적 의사결정 ==========
        heading1('6. 기술적 의사결정'),

        heading2('6-1. TypeScript를 선택한 이유'),
        body('전체 코드베이스에 TypeScript를 도입하여 컴파일 타임 타입 체크를 보장합니다. UrlConfig, MonitorResult, GrafanaApiCheck 같은 인터페이스가 모듈 간 계약 역할을 하여 런타임 타입 에러를 방지합니다. 특히 Grafana API 응답의 복잡한 중첩 데이터 구조를 다룰 때 엄격한 타이핑이 큰 이점을 발휘합니다.'),

        blank(),

        heading2('6-2. Selenium 대신 Playwright를 선택한 이유'),
        body('Playwright를 선택한 이유는 세 가지입니다: (1) TypeScript 코드베이스와 자연스럽게 맞는 네이티브 async/await 지원, (2) networkidle 자동 대기로 불안정한 명시적 대기 제거, (3) 연결 상태 모니터링과 keep-alive 타이머가 포함된 공유 브라우저 인스턴스 관리.'),

        blank(),

        heading2('6-3. 데이터베이스 대신 JSON 파일 저장소를 선택한 이유'),
        body('시간당 3개 사이트를 체크하는 모니터링 시스템에 데이터베이스는 오버엔지니어링입니다. JSON 파일은 다음과 같은 장점이 있습니다: (1) 외부 의존성 제로 (DB 서버 불필요), (2) 디버깅하기 쉬운 사람이 읽을 수 있는 데이터, (3) 파일 복사만으로 백업, (4) 자동 일별 파티셔닝, (5) 무료 티어 호스팅에서 간편한 배포. 7일 보관 정책으로 파일 크기를 관리합니다.'),

        blank(),

        heading2('6-4. 프론트엔드 프레임워크를 사용하지 않은 이유'),
        body('대시보드는 설정, 이력, 알림 3개 뷰가 있는 단일 페이지입니다. React나 Vue를 추가하면 빌드 도구, 번들 오버헤드, 프레임워크 업데이트 유지보수가 발생하지만 실질적 이점은 미미합니다. Vanilla JS와 fetch API, DOM 조합으로 프론트엔드를 단순하고 빠르고 의존성 없이 유지합니다.'),

        blank(),

        // ========== Footer ==========
        blank(), blank(),
        p([t('---', { color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
        p([t('SUBAK Server Monitoring Project', { size: 20, color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
        p([t('TypeScript / Node.js / Express / Playwright / Grafana API', { size: 18, color: '9ca3af' })], { alignment: AlignmentType.CENTER }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('docs/SUBAK-Project-Overview.docx', buffer);
  console.log('Word document generated: docs/SUBAK-Project-Overview.docx');
}

main().catch(console.error);
