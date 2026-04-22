# SUBAK Server Monitoring

## 프로젝트 개요 문서

4개 모니터링 사이트 자동화 모니터링 시스템

Grafana + Pinpoint + Edutem Dashboard + Mathtype Server

TypeScript / Node.js / Express / Playwright

2026.04 (최종 업데이트: 2026-04-22)

---

## 1. 문제사항 (AS-IS)

### 1-1. 배경

팀에서는 프로덕션 서비스의 상태를 확인하기 위해 4개의 모니터링 대시보드를 운영하고 있었습니다:

| 번호 | 모니터링 대상 | URL | 확인 방식 |
|------|-------------|-----|----------|
| 1 | 에듀템 대시보드 (Grafana) | monitoring.aidt.ai:3000 | 수동 수치 확인 |
| 2 | 매쓰타입 서버 (Grafana) | monitoring.aidt.ai:3000 | 수동 수치 확인 |
| 3 | LMS API 데이터 (Pinpoint APM) | pinpoint.aidt.ai/serverMap/lms-api | 수동 Failed 건수 확인 |
| 4 | Viewer API 데이터 (Pinpoint APM) | pinpoint.aidt.ai/serverMap/viewer-api | 수동 Failed 건수 확인 |

### 1-2. 문제점

**문제 1: 반복적인 수동 작업**
- 매시간 4개의 브라우저 탭을 수동으로 열어야 함
- Grafana 대시보드의 메트릭 값을 임계치와 일일이 비교
- Pinpoint APM을 열고 Failed 건수가 0인지 육안으로 확인
- 하루 24회(매시간) 반복되는 동일한 작업

**문제 2: 장애 대응 지연**
- 담당자가 확인 시간을 놓치면 에러 탐지가 지연됨
- 비업무 시간(야간, 주말)은 모니터링 공백 발생
- 임계치 초과가 수시간 동안 미인지 될 수 있음

**문제 3: 불일치한 에러 탐지**
- 사람의 육안 검사는 누락 가능성 존재
- 표준화된 기준이 없어 담당자마다 판단이 달라질 수 있음
- 확인 이력이나 감사 추적(audit trail) 부재

**문제 4: 서비스별 운영 시간 차이**
- 매쓰타입 6개 서버가 각각 다른 운영 시간대를 가짐
- 동일 임계값을 모든 시간대에 적용 시 오탐(false positive) 발생

---

## 2. 목적 (TO-BE)

4개 사이트의 수동 모니터링을 자동화하여 다음과 같은 목표를 달성하고자 합니다:

**목표 1: 전체 자동화**
- Cron 기반 스케줄러가 매시간 4개 사이트를 자동 체크
- 사람의 개입 없이 24시간 무인 모니터링

**목표 2: 실시간 알림**
- 에러 탐지 시 Slack 웹훅 알림 즉시 발송
- 알림에 어느 서비스에서, 어떤 수치가, 언제 발생했는지 상세 정보 포함

**목표 3: 통합 대시보드**
- 단일 웹 UI에서 모든 모니터링 결과 확인
- 필터링 및 페이지네이션이 적용된 과거 이력 조회

**목표 4: 정확한 에러 탐지**
- 기계 기반 임계치 비교 (사람의 판단 편차 제거)
- 임계값 연산자 지원 (이상/일치)
- 서비스별 시간대 조건으로 오탐 방지
- API 수준 메트릭 조회 지원 (Grafana 공용 API)

---

## 3. 해결방안 (아키텍처)

### 3-1. 다중 모드 모니터링 전략

4개의 모니터링 대상은 근본적으로 다른 접근 방식이 필요합니다:

| 대상 | 콘텐츠 유형 | 체크 방식 | 핵심 기술 |
|------|-----------|----------|----------|
| 에듀템 대시보드 (Grafana) | 시계열 메트릭 | 직접 API 조회 + 임계치 비교 | Grafana Public API (Axios) |
| 매쓰타입 서버 (Grafana) | 시계열 메트릭 | 직접 API 조회 + 임계치 비교 + 시간대 필터링 | Grafana Public API (Axios) |
| LMS API 데이터 (Pinpoint) | 동적 DOM | 헤드리스 브라우저 + CSS 선택자 | Playwright (Chromium) |
| Viewer API 데이터 (Pinpoint) | 동적 DOM | 헤드리스 브라우저 + CSS 선택자 | Playwright (Chromium) |

### 3-2. 시스템 아키텍처 개요

```
+-------------------+     +------------------+     +------------------+
|   Scheduler       |     |   Monitor Core   |     |   Notifier       |
|   (node-cron)     | --> |   (3-way check)  | --> |   (Slack Webhook)|
|   Every hour      |     |                  |     |                  |
+-------------------+     +------------------+     +------------------+
                                  |
                    +-------------+-------------+
                    |                           |
              +-----+-----+             +------+------+
              | Grafana    |             | Playwright  |
              | Checker    |             | Checker     |
              | (API)      |             | (Chrome)    |
              +------------+             +-------------+
                    |                           |
                    v                           v
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
              +--------------------------------------------+
```

### 3-3. 핵심 동작 흐름

```
1. 스케줄러가 모니터링 트리거 (cron 주기)
   |
2. 저장소에서 활성화된 모든 URL 설정 로드
   |
3. 각 URL에 대해 체크 전략 선택:
   |
   +-- grafanaApiCheck 설정 존재? --> Grafana API 체커
   |     - Grafana 공용 API에 POST 요청
   |     - 응답 프레임에서 데이터 포인트 추출
   |     - 서비스명 추출 (schema.name / executedQueryString)
   |     - 클라이언트 사이드 시간 필터링
   |     - 임계값 연산자 적용 (gte / eq)
   |     - 서비스별 시간대 조건 확인
   |
   +-- cssSelectorChecks 설정 존재? --> Playwright 체커
   |     - 공유 헤드리스 Chrome 실행
   |     - URL 이동, 동적 콘텐츠 대기
   |     - CSS 선택자로 텍스트 추출
   |     - Pinpoint: 시간 범위 동적 생성
   |
   +-- 둘 다 없으면 --> HTTP 체커
         - 단순 GET/POST 요청
         - 상태 코드, 응답 시간, 키워드 검증
   |
4. 결과를 JSON 파일에 저장 (일별)
   |
5. 에러 결과 필터링 --> Slack 알림 발송
   |
6. 7일 이전 데이터 자동 정리
```

---

## 4. 제작 방법 (상세 구현)

### 4-1. 기술 스택

| 구분 | 기술 | 용도 |
|------|------|------|
| 언어 | TypeScript 5.3 | 전체 스택 타입 안전성 |
| 런타임 | Node.js | 서버 사이드 JavaScript 실행 환경 |
| 프레임워크 | Express.js 4.18 | REST API 서버 |
| 브라우저 자동화 | Playwright 1.58 | 동적 콘텐츠 체크 |
| HTTP 클라이언트 | Axios 1.6 | HTTP 요청 + Grafana API 호출 |
| HTML 파싱 | Cheerio 1.0 | 서버 사이드 DOM 파싱 |
| 스케줄러 | node-cron 3.0 | Cron 기반 주기적 실행 |
| 로깅 | Winston 3.11 | 구조화된 로깅 + 일별 로테이션 |
| 프론트엔드 | Vanilla JS + HTML5/CSS3 | 경량 대시보드 |
| 프로세스 관리 | PM2 | 프로덕션 프로세스 관리 |
| 배포 | Render.com | 클라우드 호스팅 (무료 티어) |

### 4-2. 프로젝트 구조

```
subak-server-monitoring/
 +-- src/
 |   +-- server.ts              # 진입점: 서버 구동 + 스케줄러 시작
 |   +-- app.ts                 # Express 앱 팩토리
 |   +-- config/
 |   |   +-- index.ts           # 환경 설정 관리자
 |   +-- core/
 |   |   +-- monitor.ts         # 모니터링 코어: 전략 분기
 |   |   +-- scheduler.ts       # Cron 스케줄러 + 절전 복귀 감지
 |   |   +-- notifier.ts        # Slack 웹훅 알림
 |   +-- models/
 |   |   +-- url-config.ts      # UrlConfig, ErrorConditions, GrafanaApiCheck, ServiceTimeRange
 |   |   +-- monitor-result.ts  # MonitorResult, GrafanaCheckDetail 등
 |   +-- repositories/
 |   |   +-- json-repository.ts # JSON 파일 기반 데이터 영속성
 |   +-- routes/
 |   |   +-- urls.ts            # URL CRUD 엔드포인트
 |   |   +-- monitoring.ts      # 모니터링 제어 엔드포인트
 |   |   +-- config.ts          # 웹훅 설정 엔드포인트
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
 +-- scripts/                   # 유틸리티 스크립트
 +-- render.yaml                # Render.com 배포 설정
 +-- start-server.bat           # Windows 시작 스크립트
 +-- restart-server.bat         # Windows 재시작 스크립트 (관리자 권한)
 +-- package.json
 +-- tsconfig.json
```

### 4-3. 핵심 구현: 모니터링 전략

#### (A) Grafana API 체커 (에듀템 + 매쓰타입)

Grafana 공용 대시보드 API를 직접 호출하여 수치 메트릭을 추출합니다. 브라우저 없이 순수 API 호출로 동작합니다.

```
동작 흐름:
1. isStartup 여부에 따라 시간 범위 결정
   - 시작 시: timeRangeHours (기본 6시간)
   - 정시 실행: scheduledTimeRangeHours (기본 1시간)
2. 각 panelId별로 Grafana API에 POST 요청
3. 응답 frames에서 서비스명 추출
   - schema.name > executedQueryString > panel-{id} 순서
4. timeArray[i] < from 인 데이터 제외 (클라이언트 필터링)
5. targetServices에 해당하는 서비스만 수집
6. 임계값 판정: thresholdOperator 적용
   - gte(이상, 기본값): val >= threshold
   - eq(일치): val === threshold
7. isWithinTimeRange()로 서비스별 시간대 조건 확인
8. 에러 데이터포인트를 서비스별로 집계
```

**임계값 연산자 (thresholdOperator)**

| 연산자 | 의미 | 사용 사례 |
|--------|------|----------|
| gte (기본값) | 임계값 이상 | 에듀템: 에러 수치 >= 6 |
| eq | 임계값과 일치 | 매쓰타입: 서버 수 === 2 (정상) |

**서비스별 시간대 조건 (serviceTimeRanges)**

| 서비스 그룹 | 시작 시간 | 종료 시간 | 비고 |
|------------|----------|----------|------|
| mathtype003, mathtype004 | 08:40 | 17:00 | startBufferMinutes=40 |
| mathtype005, mathtype006 | 08:40 | 15:00 | startBufferMinutes=40 |
| mathtype01, mathtype02 | 제한 없음 | 제한 없음 | 24시간 감시 |

#### (B) Playwright 체커 (Pinpoint APM)

헤드리스 Chrome을 실행하여 JavaScript 기반의 Pinpoint APM 대시보드를 렌더링합니다. 시간 범위 URL을 동적으로 생성하고 CSS 선택자로 DOM 값을 추출합니다.

```
동작 흐름:
1. 공유 브라우저 인스턴스 획득 (없으면 Chromium launch, 최대 3회 재시도)
2. Pinpoint URL인 경우 from/to 타임스탬프를 현재 시간 기준으로 동적 교체
3. 새 브라우저 컨텍스트 생성 (1920x1080 뷰포트)
4. 페이지 이동 후 networkidle 대기
5. CSS 선택자로 요소 찾아 텍스트 콘텐츠 추출
6. checkType(notEquals, equals 등)에 따라 에러 판정
7. 실패 시 5초 대기 후 최대 2회 재시도
8. 브라우저 크래시 감지 시 공유 인스턴스 초기화 후 재연결
```

**공유 브라우저 관리**
- 전역 sharedBrowser 변수로 브라우저 재사용
- 10분 간격 keep-alive로 idle disconnect 방지
- 연결 끊김 시 즉시 재시작

### 4-4. 알림 시스템

모니터링 체크에서 에러가 탐지되면 Slack 웹훅 알림이 즉시 발송됩니다. 서비스명, 상태, 에러 메시지, 발생 시간 등의 상세 정보가 포함됩니다.

### 4-5. 데이터 저장

단순성과 외부 의존성 제로를 위해 JSON 파일 기반 저장소를 사용합니다:

```
data/
  +-- config.json                  # 모니터링 URL 설정
  +-- webhook.json                 # Slack 웹훅 URL
  +-- monitoring-2026-04-01.json   # 일별 모니터링 결과
  +-- monitoring-2026-04-02.json   # 7일 경과 시 자동 삭제
```

### 4-6. API 엔드포인트

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | /api/urls | 전체 모니터링 설정 조회 |
| POST | /api/urls | 신규 모니터링 대상 생성 (API Key 필요) |
| PUT | /api/urls/:id | 모니터링 대상 수정 |
| DELETE | /api/urls/:id | 모니터링 대상 삭제 |
| GET | /api/monitoring/results | 모니터링 이력 조회 |
| GET | /api/monitoring/status | 시스템 상태 요약 |
| POST | /api/monitoring/run | 수동 모니터링 실행 |
| GET | /api/monitoring/scheduler/status | 스케줄러 상태 확인 |
| POST | /api/monitoring/scheduler/toggle | 스케줄러 ON/OFF 전환 |
| POST | /api/monitoring/test-notification | 테스트 Slack 알림 발송 |
| POST | /api/monitoring/test-check | 개별 URL 테스트 체크 |

### 4-7. 배포

**클라우드 배포 (Render.com)**

render.yaml로 원클릭 배포가 설정되어 있습니다. 무료 티어에서 1GB 영구 디스크로 데이터를 저장합니다.

**로컬 배포 (Windows)**

start-server.bat이 전체 시작 시퀀스를 처리합니다:
1. TypeScript 컴파일 (npx tsc)
2. PM2 프로세스 시작 (dist/server.js)
3. Chrome 대시보드 자동 열기 (localhost:11111)
4. Slack 앱 자동 실행

restart-server.bat은 관리자 권한 자동 승격 후 재시작합니다:
1. 관리자 권한 확인 및 자동 승격
2. TypeScript 빌드 (npx tsc)
3. 기존 node 프로세스 강제 종료 (taskkill /F /IM node.exe)
4. PM2 PID 파일 정리
5. PM2 시작
6. HTTP 헬스체크로 정상 구동 확인

---

## 5. 결과

### 5-1. 도입 전후 비교

| 항목 | 도입 전 (수동) | 도입 후 (자동화) |
|------|--------------|----------------|
| 체크 빈도 | 매시간 (담당자가 기억할 때만) | 매시간 보장 (cron) |
| 비업무 시간 커버 | 없음 (야간/주말) | 24시간 무인 감시 |
| 에러 탐지 시간 | 수분 ~ 수시간 | 즉시 (체크 주기 내) |
| 알림 수단 | 육안 검사만 | Slack 알림 (상세 정보 포함) |
| 하루 인력 투입 | 약 24회 수동 체크 | 0 (전체 자동화) |
| 과거 이력 | 없음 | 7일 롤링 저장 |
| 일관성 | 가변적 (사람 판단) | 결정론적 (기계 임계치) |
| 서비스별 시간 조건 | 수동 판단 | 자동 필터링 (serviceTimeRanges) |

### 5-2. 운영 효과

**업무 효율성**
- 4개 모니터링 사이트의 하루 약 24회 수동 체크 업무 완전 제거
- 담당자가 루틴 모니터링 대신 실제 장애 대응에 집중 가능

**안정성**
- 무결점 모니터링: 비업무 시간 누락 없음
- 일관된 임계치 적용: 사람의 판단 편차 제거
- 서비스별 시간대 조건으로 오탐(false positive) 방지
- 일시적 장애에 대한 자동 재시도 메커니즘 (Playwright: 2회 재시도)

**가시성**
- 통합 웹 대시보드로 실시간 상태 한눈에 파악
- 7일간의 과거 데이터로 트렌드 분석 가능
- Slack 연동으로 팀 전체에 즉시 알림 전파

### 5-3. 기술적 성과

- 다중 모드 모니터링: Grafana API + Playwright를 단일 시스템에 통합
- 임계값 연산자: gte(이상)/eq(일치)로 다양한 판단 기준 지원
- 서비스별 시간대 필터링: serviceTimeRanges로 운영 시간 내에만 에러 판정
- 공유 브라우저 인스턴스 + keep-alive (Chromium 반복 실행 방지)
- Pinpoint 시간 범위 쿼리를 위한 동적 URL 생성
- Grafana API 시간 범위 무시 이슈를 클라이언트 필터링으로 해결
- 데이터베이스 없는 아키텍처 (JSON 파일 기반, 7일 자동 정리)
- 프레임워크 없는 프론트엔드 (Vanilla JS, 번들 사이즈 제로)
- Graceful shutdown 처리 (SIGINT/SIGTERM)
- 쓰기 작업에 대한 API Key 인증
- 무료 티어 클라우드 배포 가능 (Render.com)
- Windows 관리자 권한 자동 승격 재시작 스크립트

---

## 6. 기술적 의사결정

### 6-1. TypeScript를 선택한 이유

전체 코드베이스에 TypeScript를 도입하여 컴파일 타임 타입 체크를 보장합니다. UrlConfig, MonitorResult, GrafanaApiCheck, ServiceTimeRange 같은 인터페이스가 모듈 간 계약 역할을 하여 런타임 타입 에러를 방지합니다. 특히 Grafana API 응답의 복잡한 중첩 데이터 구조를 다룰 때 엄격한 타이핑이 큰 이점을 발휘합니다.

### 6-2. Selenium 대신 Playwright를 선택한 이유

Playwright를 선택한 이유는 세 가지입니다: (1) TypeScript 코드베이스와 자연스럽게 맞는 네이티브 async/await 지원, (2) networkidle 자동 대기로 불안정한 명시적 대기 제거, (3) 연결 상태 모니터링과 keep-alive 타이머가 포함된 공유 브라우저 인스턴스 관리.

### 6-3. 데이터베이스 대신 JSON 파일 저장소를 선택한 이유

시간당 4개 사이트를 체크하는 모니터링 시스템에 데이터베이스는 오버엔지니어링입니다. JSON 파일은 다음과 같은 장점이 있습니다: (1) 외부 의존성 제로 (DB 서버 불필요), (2) 디버깅하기 쉬운 사람이 읽을 수 있는 데이터, (3) 파일 복사만으로 백업, (4) 자동 일별 파티셔닝, (5) 무료 티어 호스팅에서 간편한 배포. 7일 보관 정책으로 파일 크기를 관리합니다.

### 6-4. 프론트엔드 프레임워크를 사용하지 않은 이유

대시보드는 설정, 이력, 알림 3개 뷰가 있는 단일 페이지입니다. React나 Vue를 추가하면 빌드 도구, 번들 오버헤드, 프레임워크 업데이트 유지보수가 발생하지만 실질적 이점은 미미합니다. Vanilla JS와 fetch API, DOM 조합으로 프론트엔드를 단순하고 빠르고 의존성 없이 유지합니다.

### 6-5. thresholdOperator를 도입한 이유

에듀템 대시보드는 "에러 수치가 6 이상이면 장애"이지만, 매쓰타입 서버는 "정상 서버가 정확히 2대면 정상"이라는 판단 기준이 다릅니다. 단일 >= 연산자로는 두 케이스를 모두 커버할 수 없어 gte/eq 연산자를 분리했습니다.
