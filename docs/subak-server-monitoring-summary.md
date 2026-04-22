# SUBAK 서버 모니터링 시스템 - 기술 요약 문서

> 작성일: 2026-04-21
> 프로젝트: subak-server-monitoring v1.0.0

---

## 1. 사용 기술 환경

### 1.1 언어 및 프레임워크

| 구분 | 기술 | 버전 |
|------|------|------|
| 프로그래밍 언어 | TypeScript | 5.3 |
| 런타임 | Node.js | ES2022 타겟 |
| 웹 프레임워크 | Express.js | 4.18 |
| 프론트엔드 | Vanilla JS + HTML5 + CSS3 | - |

### 1.2 주요 라이브러리

| 라이브러리 | 용도 | 비고 |
|-----------|------|------|
| axios | HTTP 클라이언트 | Grafana API 호출, 일반 URL 체크 |
| cheerio | HTML 파싱 | 정적 콘텐츠 분석 |
| Playwright | 브라우저 자동화 | 동적 콘텐츠 체크 (Pinpoint 등) |
| node-cron | 스케줄링 | 매 정시 모니터링 실행 |
| nodemailer | 이메일 발송 | 알림 (현재 Slack 위주 사용) |
| winston | 로깅 | 일별 로그 로테이션 (14일 보관) |
| winston-daily-rotate-file | 로그 파일 관리 | 날짜별 로그 파일 분리 |

### 1.3 프로세스 관리 및 실행 환경

| 항목 | 내용 |
|------|------|
| 프로세스 관리 | PM2 (`monitoring-bot` 프로세스명) |
| 로컬 실행 OS | Windows 11 Pro |
| 클라우드 배포 | Render.com (render.yaml) |
| 서버 포트 | 11111 |
| 데이터 저장 | JSON 파일 기반 (7일 자동 삭제) |
| 빌드 도구 | tsc (TypeScript Compiler) |

### 1.4 연동된 외부 API

| API | 용도 | 엔드포인트 |
|-----|------|-----------|
| Grafana Public Dashboard API | 대시보드 패널 데이터 조회 | `POST {host}/api/public/dashboards/{uid}/panels/{id}/query` |
| Slack Webhook | 에러 알림 전송 | 환경변수 `SLACK_WEBHOOK_URL` |
| Pinpoint (SkOpenApm) | APM 대시보드 체크 | `https://pinpoint.aidt.ai/serverMap/...` |

---

## 2. 전체 동작 프로세스

### 2.1 전체 아키텍처 순서도

```
[1. start-server.bat 실행]
         |
         v
[2. TypeScript 빌드 (tsc)]
         |
         v
[3. PM2로 서버 구동 (dist/server.js)]
         |
         v
[4. Express 서버 시작 (port 11111)]
         |
         v
[5. Scheduler.start() 호출]
    |
    +---> [5a. cron 설정: 0 * * * * (매 정시)]
    +---> [5b. 절전 복귀 감시 시작 (30초 tick)]
    +---> [5c. 놓친 실행 복구 (recoverMissedRun)]
              |
              +-- 마지막 실행이 60분+ 전이면 즉시 실행
              |
              v
    ============================================================
    |               [대기 상태: cron 또는 복귀 대기]            |
    ============================================================
         |                              |
         | 매 정시                      | 절전 복귀 (gap > 2분)
         v                              v
    [6. runMonitoring(isStartup=false)]

[7. URL 설정 로드 (data/config.json)]
         |
         v
[8. 활성화된 URL 순회 -- Monitor.checkUrls()]
         |
    +----+----+----+
    |         |         |
    v         v         v
[Grafana] [Playwright] [HTTP]
  API       체크       체크
    |         |         |
    +----+----+----+
         |
         v
[9. 결과 JSON 저장 (monitoring-YYYY-MM-DD.json)]
         |
         v
[10. 에러 결과 필터링]
         |
         +-- 에러 0건: 종료
         |
         +-- 에러 발생: [11. Slack 알림 전송]
                                |
                                v
                    [12. 매일 1회 7일 이전 데이터 삭제]
                                |
                                v
                    [13. 다음 cron 주기 대기]
```

### 2.2 세부 동작 단계

**1) 서버 시작 (`start-server.bat`)**
- 작업 디렉토리 이동 -> TypeScript 빌드(`npx tsc`) -> PM2로 컴파일된 서버 구동 -> 대시보드 브라우저 열기

**2) 스케줄러 초기화 (`src/core/scheduler.ts:21-45`)**
- cron 태스크 등록 (기본 `0 * * * *` = 매 정시)
- 30초 간격 절전 복귀 감시 타이머 시작
- 서버 재시작 시 이전 실행 기록 확인 -> 60분 이상 경과 시 즉시 모니터링 실행

**3) 모니터링 실행 (`src/core/scheduler.ts:158-210`)**
- `isRunning` 플래그로 중복 실행 방지
- 활성화된 URL 설정만 필터링하여 순차 체크
- 체크 완료 후 결과를 날짜별 JSON 파일에 저장
- 에러 건이 있으면 개별 Slack 알림 전송
- 실행 완료 시간 기록 (`lastRunTime`)

**4) 절전 복귀 감지 (`src/core/scheduler.ts:80-110`)**
- 30초마다 tick 체크, 2분 이상 gap 발생 시 절전 복귀로 판단
- 마지막 모니터링이 60분 이상 전이면 즉시 실행

**5) 서버 재시작 (`restart-server.bat`)**
- 관리자 권한 자동 승격 -> TypeScript 빌드 -> taskkill로 기존 node 프로세스 종료 -> PM2 PID 파일 정리 -> PM2 시작 -> HTTP 헬스체크

---

## 3. 모니터링 대상 상세표

### 3.1 현재 모니터링 대상 (data/config.json 기준)

| 항목 | 에듀템 대시보드 | 매쓰타입 서버 | LMS api | Viewer api |
|------|----------------|--------------|---------|-----------|
| **체크 방식** | Grafana API | Grafana API | Playwright (CSS 선택자) | Playwright (CSS 선택자) |
| **대시보드 UID** | 370cefbc... | 370cefbc... | - | - |
| **패널 ID** | 32, 28, 17, 26, 21, 18 | 76 | - | - |
| **임계값** | >= 6 | = 2 (eq) | != 0 (notEquals) | != 0 (notEquals) |
| **시간 범위** | 6시간 (시작), 1시간 (정시) | 6시간 (시작), 1시간 (정시) | 현재-1시간 ~ 현재 | 현재-1시간 ~ 현재 |
| **시간대 제한** | 없음 | 서비스별 상이 (하단 참조) | 없음 | 없음 |
| **대상 서비스** | pron_v2/, v1/gec (4개) | mathtype 001~006 (6개) | failed 카운트 | failed 카운트 |

### 3.2 매쓰타입 서비스별 시간대 조건

| 서비스 그룹 | 시작 시간 | 종료 시간 | 비고 |
|------------|----------|----------|------|
| mathtype003, mathtype004 | 08:40 | 17:00 | startBufferMinutes=40 적용 |
| mathtype005, mathtype006 | 08:40 | 15:00 | startBufferMinutes=40 적용 |
| mathtype01, mathtype02 | 제한 없음 | 제한 없음 | 24시간 감시 |

---

## 4. 핵심 코드 로직

### 4.1 Grafana API 체커 (`src/utils/grafana-checker.ts`)

이 프로그램에서 가장 복잡하고 핵심적인 로직. Grafana 공용 대시보드 API를 호출하여 패널 데이터를 조회하고, 임계값 및 시간대 조건으로 에러를 판정한다.

```
[동작 흐름]
1. config에서 dashboardUid, panelIds, threshold, timeRangeHours 등 설정 로드
2. 시간 범위 결정: isStartup=true면 timeRangeHours(6h), false면 scheduledTimeRangeHours(1h)
3. 각 panelId별로 Grafana API에 POST 요청
4. 응답의 frames에서 서비스명 추출 (schema.name > executedQueryString > panel-{id})
5. timeArray[i] < from 인 데이터 제외 (클라이언트 필터링)
6. targetServices에 해당하는 서비스만 수집
7. 임계값 판정: gte(이상) 또는 eq(일치) 연산자 적용
8. isWithinTimeRange()로 서비스별 시간대 조건 확인
9. 에러 데이터포인트를 서비스별로 집계하여 에러 메시지 생성
```

핵심 함수 구조 (53-191행):
- `checkGrafanaApi(config, isStartup)`: 메인 진입점
- `extractServiceName(frame, panelId)`: 서비스명 추출 (9-27행)
- `isThresholdExceeded(val)`: 임계값 판정 (62-64행)
- `isWithinTimeRange(...)`: 시간대 조건 (32-48행)

### 4.2 Playwright 체커 (`src/utils/playwright-checker.ts`)

헤드리스 브라우저를 이용해 동적 콘텐츠를 체크하는 로직. Pinpoint 대시보드의 failed 카운트를 CSS 선택자로 읽어온다.

```
[동작 흐름]
1. 공유 브라우저 인스턴스 획득 (없으면 Chromium launch, 최대 3회 재시도)
2. Pinpoint URL인 경우 from/to 타임스탬프를 현재 시간 기준으로 동적 교체
3. 새 브라우저 컨텍스트 생성 (1920x1080 뷰포트)
4. 페이지 이동 후 networkidle 대기
5. CSS 선택자로 요소 찾아 텍스트 콘텐츠 추출
6. checkType(notEquals, equals 등)에 따라 에러 판정
7. 실패 시 5초 대기 후 최대 2회 재시도
8. 브라우저 크래시 감지 시 공유 인스턴스 초기화 후 재연결
```

공유 브라우저 관리 (57-83행):
- 전역 `sharedBrowser` 변수로 브라우저 재사용
- 10분 간격 keep-alive로 idle disconnect 방지
- 연결 끊김 시 즉시 재시작

---

## 5. 주요 트러블슈팅

### 5.1 Grafana API 시간 범위 무시 이슈

**문제**: Grafana 공용 대시보드 API에 `from/to` 파라미터를 전달해도, API가 이를 무시하고 전체 기간 데이터를 반환함. 원하는 시간 범위의 데이터만 처리할 수 없는 상황.

**해결**: `grafana-checker.ts` 127행에서 `timeArray[i] < from` 조건으로 클라이언트 사이드 필터링을 구현. API 응답의 타임스탬프 배열을 직접 검사하여 요청한 시간 범위 밖의 데이터를 제외함.

**관련 파일**: `src/utils/grafana-checker.ts`

### 5.2 프로세스 관리 권한 이슈

**문제**: Windows 환경에서 `powershell Stop-Process` 및 `taskkill` 명령이 권한 부족으로 동작하지 않음. PM2의 named pipe 권한 이슈로 외부 세션(Claude Code)에서 PM2 직접 제어도 불가.

**해결**: `restart-server.bat`에 자동 관리자 권한 승격 로직 추가. `taskkill /F /IM node.exe`로 강제 종료 후 PM2 PID 파일을 수동 삭제(`del /f /q`)하여 상태 초기화. 이후 PM2 start + HTTP 헬스체크로 정상 구동 확인.

**관련 파일**: `restart-server.bat`

### 5.3 서비스별 시간대 조건 분기

**문제**: 매쓰타입 6개 서버가 각각 다른 운영 시간대(08:40~17:00, 08:40~15:00, 24시간)를 가짐. 동일한 임계값을 모든 시간대에 적용하면 서비스 미운영 시간에 오탐(false positive) 발생.

**해결**: `serviceTimeRanges` 배열로 서비스별 startHour, startBufferMinutes(분 단위 버퍼), endHour 설정. `isWithinTimeRange()` 함수에서 현재 데이터포인트의 시각이 해당 서비스의 운영 시간 내인지 판정. 시간 범위 밖의 데이터는 에러로 카운트하지 않음.

**관련 파일**: `src/utils/grafana-checker.ts`, `src/models/url-config.ts`, `data/config.json`

### 5.4 Playwright 브라우저 연결 끊김

**문제**: 장시간 모니터링 주기(1시간) 사이에 Chromium 브라우저의 idle 상태가 지속되면서 WebSocket 연결이 끊김. 다음 체크 시 브라우저 재시작으로 인한 지연 및 일시적 실패 발생.

**해결**: 10분 간격 keep-alive 타이머(`KEEP_ALIVE_INTERVAL = 10 * 60 * 1000`)로 `about:blank` 페이지를 방문하여 연결 유지. keep-alive 체크 시 연결 끊김이 감지되면 즉시 브라우저 재시작. 체크 실행 시에도 연결 끊김을 감지하면 공유 인스턴스를 null로 초기화 후 재연결.

**관련 파일**: `src/utils/playwright-checker.ts`
