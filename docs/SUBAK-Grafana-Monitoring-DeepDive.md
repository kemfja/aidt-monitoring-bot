# SUBAK Server Monitoring

## Grafana API 수치 임계치 모니터링 심층 분석

최종 업데이트: 2026-04-22

---

## 1. Grafana 수치 감지 기능이란?

일반적인 웹 모니터링 도구들은 HTTP 상태 코드나 응답 시간 위주의 체크에 머뭅니다. 하지만 실제 장애의 징후는 Grafana 대시보드의 수치(metric)에서 먼저 나타나는 경우가 많습니다.

SUBAK Server Monitoring의 Grafana 수치 감지 기능은 Grafana 공용 대시보드(Public Dashboard) API를 직접 호출하여, 지정한 시간 범위 내의 데이터 포인트를 수집하고 설정한 임계값(threshold)과 임계값 연산자(thresholdOperator)로 에러를 판정합니다. 서비스별 시간대 조건(serviceTimeRanges)도 적용하여 운영 시간 외의 오탐을 방지합니다. 임계치 초과가 감지되면 Slack 알림을 즉시 발송합니다.

---

## 2. 동작 아키텍처

Grafana 수치 감지는 다음 5단계로 동작합니다:

1. **설정(Configuration)** - 대시보드 UID, 패널 ID, 임계값, 임계값 연산자, 시간 범위, 대상 서비스명, 서비스별 시간대 조건 등을 JSON 설정으로 등록
2. **시간 범위 결정(Time Range Selection)** - isStartup 여부에 따라 시작 시(6시간) 또는 정시 실행(1시간) 시간 범위 선택
3. **데이터 수집(Data Collection)** - 등록된 설정에 따라 Grafana 공용 API에 POST 요청을 보내 시계열 데이터를 조회. API가 시간 범위를 무시하는 경우에 대비해 클라이언트 사이드 필터링 수행
4. **임계치 검증(Threshold Validation)** - thresholdOperator(gte/eq)를 적용하여 각 데이터 포인트를 비교하고, serviceTimeRanges로 서비스별 운영 시간 내인지 확인
5. **결과 통보(Notification)** - 임계치 초과 건수가 1건 이상이면 장애로 판단하고 Slack 웹훅으로 상세 정보를 발송

---

## 3. Grafana API 통신 방식

Grafana의 공용 대시보드(Public Dashboard) 기능을 활용합니다. 이 기능은 인증 없이도 대시보드 데이터를 조회할 수 있는 공개 API 엔드포인트를 제공합니다.

**API 엔드포인트 형식:**

```
POST {hostUrl}/api/public/dashboards/{dashboardUid}/panels/{panelId}/query
```

**요청 바디(Request Body):**

```json
{
  "intervalMs": 1000,
  "maxDataPoints": 100,
  "timeRange": {
    "from": "1712000000000",
    "to": "1712003600000",
    "timezone": "browser"
  }
}
```

**Grafana API 응답 구조:**

```json
{
  "results": {
    "A": {
      "frames": [
        {
          "schema": { "name": "service-a" },
          "data": {
            "values": [
              [1712000000000, 1712000060000],
              [45.2, 82.7]
            ]
          }
        }
      ]
    }
  }
}
```

응답의 frames 배열에서 schema.name이 서비스명이 되고, data.values[0]은 시간 축, data.values[1]은 측정값 축입니다.

---

## 4. 핵심 코드 구현

### 4-1. 타입 정의 (Type Definitions)

**설정 인터페이스 (src/models/url-config.ts):**

```typescript
export interface GrafanaApiCheck {
  /** Grafana 공용 대시보드 UID */
  dashboardUid: string;
  /** Grafana 호스트 URL */
  hostUrl: string;
  /** 조회할 패널 ID 목록 */
  panelIds: number[];
  /** 에러 임계값 */
  threshold: number;
  /** 임계값 연산자 (gte: 이상, eq: 일치). 기본값: gte */
  thresholdOperator?: 'gte' | 'eq';
  /** 시작 시 조회 시간 범위 (시간 단위) */
  timeRangeHours: number;
  /** 정시 실행 시 조회 시간 범위 (시간 단위). 미설정 시 timeRangeHours 사용 */
  scheduledTimeRangeHours?: number;
  /** 조회 간격 (ms) */
  intervalMs: number;
  /** 최대 데이터 포인트 수 */
  maxDataPoints: number;
  /** 임계값 검사 대상 서비스명 목록 */
  targetServices: string[];
  /** 서비스별 시간대 조건 */
  serviceTimeRanges?: ServiceTimeRange[];
}

export interface ServiceTimeRange {
  /** 시간대 조건을 적용할 서비스명 목록 */
  services: string[];
  /** 시작 시간 (시, 0-23) */
  startHour: number;
  /** 시작 시간 추가 버퍼 (분). 예: startHour=8, startBufferMinutes=40 -> 08:40 */
  startBufferMinutes?: number;
  /** 종료 시간 (시, 0-23) */
  endHour: number;
}
```

**결과 데이터 타입 (src/models/monitor-result.ts):**

```typescript
export interface GrafanaDataPoint {
  service: string;
  time: string;
  value: number;
}

export interface GrafanaCheckDetail {
  type: 'grafana';
  apiUrl: string;
  threshold: number;
  thresholdOperator?: string;
  targetServices?: string[];
  dataPoints: GrafanaDataPoint[];
  errorDataPoints: GrafanaDataPoint[];
}
```

### 4-2. Grafana API 체커 (src/utils/grafana-checker.ts)

핵심 로직입니다. 설정된 패널 ID 목록을 순회하며 Grafana API를 호출하고, 응답 데이터에서 서비스별 데이터 포인트를 추출하여 임계치를 검증합니다.

**함수 시그니처:**

```typescript
export async function checkGrafanaApi(
  config: UrlConfig,
  isStartup = true
): Promise<{
  isValid: boolean;
  errorMessage?: string;
  responseTime: number;
  grafanaCheckDetail: GrafanaCheckDetail;
}>
```

**핵심 동작 흐름:**

```
1. 설정에서 dashboardUid, panelIds, threshold, thresholdOperator 등 로드
2. 시간 범위 결정:
   - isStartup=true: timeRangeHours (기본 6시간)
   - isStartup=false && scheduledTimeRangeHours 존재: scheduledTimeRangeHours
   - isStartup=false && scheduledTimeRangeHours 미존재: timeRangeHours
3. 임계값 판정 함수 생성:
   - thresholdOperator === 'eq': val === threshold
   - thresholdOperator === 'gte' (기본): val >= threshold
4. 각 panelId별로 Grafana API에 POST 요청
5. 응답 frames에서 서비스명 추출:
   - 1순위: schema.name
   - 2순위: schema.fields[].config.custom.executedQueryString
   - 3순위: panel-{id} (폴백)
6. 클라이언트 사이드 시간 필터링:
   - timeArray[i] < from 인 데이터 제외
7. targetServices 필터링
8. 임계값 판정 (isThresholdExceeded)
9. isWithinTimeRange()로 서비스별 시간대 조건 확인:
   - serviceTimeRanges에 등록된 서비스는 지정된 시간대 내의 데이터만 에러로 판정
   - 미등록 서비스는 24시간 감시
10. 에러 데이터포인트를 서비스별로 집계하여 에러 메시지 생성
```

**서비스명 추출 (extractServiceName):**

```typescript
function extractServiceName(frame: any, panelId: number): string {
  // 1) schema.name에서 추출
  if (frame.schema?.name) {
    return frame.schema.name;
  }
  // 2) executedQueryString에서 추출
  const fields = frame.schema?.fields;
  if (fields) {
    for (const field of fields) {
      const queryString = field?.config?.custom?.executedQueryString;
      if (queryString) {
        const match = queryString.match(/(?:from|expr):\s*([^\s,]+)/);
        if (match) return match[1];
      }
    }
  }
  // 3) 폴백
  return `panel-${panelId}`;
}
```

**시간대 조건 검증 (isWithinTimeRange):**

```typescript
function isWithinTimeRange(
  dataPointTime: number,
  serviceName: string,
  serviceTimeRanges?: ServiceTimeRange[]
): boolean {
  if (!serviceTimeRanges || serviceTimeRanges.length === 0) {
    return true; // 시간대 조건 없으면 항상 통과
  }

  const date = new Date(dataPointTime);
  const hour = date.getHours();
  const minute = date.getMinutes();

  for (const range of serviceTimeRanges) {
    if (range.services.some(s => serviceName.includes(s))) {
      const startMinute = (range.startHour * 60) + (range.startBufferMinutes || 0);
      const endMinute = range.endHour * 60;
      const currentMinute = hour * 60 + minute;
      return currentMinute >= startMinute && currentMinute < endMinute;
    }
  }
  return true; // 등록되지 않은 서비스는 항상 통과 (24시간 감시)
}
```

### 4-3. 모니터 파이프라인 통합 (src/core/monitor.ts)

Monitor 클래스의 checkUrl 메서드에서 Grafana 체크를 다른 모니터링 방식과 분기 처리합니다.

```typescript
async checkUrl(config: UrlConfig, isStartup = true): Promise<MonitorResult> {
  const hasGrafanaApiCheck = !!config.errorConditions?.grafanaApiCheck;
  const hasCssSelectorCheck = config.errorConditions?.cssSelectorChecks &&
    config.errorConditions.cssSelectorChecks.length > 0;

  if (hasGrafanaApiCheck) {
    // Grafana API 직접 체크
    const grafanaResult = await checkGrafanaApi(config, isStartup);
    // ...
  } else if (hasCssSelectorCheck) {
    // Playwright 동적 콘텐츠 체크
    // ...
  } else {
    // 일반 HTTP 상태 체크
    // ...
  }
}
```

### 4-4. 프론트엔드 결과 표시 (public/js/dashboard.js)

웹 대시보드에서는 모니터링 결과 상세 모달에 Grafana 체크 상세 섹션을 테이블 형식으로 렌더링합니다. 대상 서비스, 판단 시간대, 에러 조건을 테이블로 표시합니다.

```
+----------------+--------------------+------------------+
| 대상 서비스     | 판단 시간대         | 에러 조건         |
+----------------+--------------------+------------------+
| mathtype003    | 08:40 ~ 17:00      | 값 = 2 (eq)      |
| mathtype004    | 08:40 ~ 17:00      | 값 = 2 (eq)      |
| mathtype005    | 08:40 ~ 15:00      | 값 = 2 (eq)      |
| mathtype006    | 08:40 ~ 15:00      | 값 = 2 (eq)      |
| pron_v2/...    | 24시간             | 값 >= 6 (gte)    |
+----------------+--------------------+------------------+
```

---

## 5. 실제 설정 예시

### 5-1. 에듀템 대시보드 설정

```json
{
  "id": "edutem-grafana",
  "name": "에듀템 대시보드",
  "url": "https://monitoring.aidt.ai:3000/d/...",
  "method": "GET",
  "errorConditions": {
    "grafanaApiCheck": {
      "dashboardUid": "370cefbc...",
      "hostUrl": "https://monitoring.aidt.ai:3000",
      "panelIds": [32, 28, 17, 26, 21, 18],
      "threshold": 6,
      "thresholdOperator": "gte",
      "timeRangeHours": 6,
      "scheduledTimeRangeHours": 1,
      "intervalMs": 1000,
      "maxDataPoints": 100,
      "targetServices": ["pron_v2/", "v1/gec"]
    }
  },
  "enabled": true
}
```

### 5-2. 매쓰타입 서버 설정

```json
{
  "id": "mathtype-grafana",
  "name": "매쓰타입 서버",
  "url": "https://monitoring.aidt.ai:3000/d/...",
  "method": "GET",
  "errorConditions": {
    "grafanaApiCheck": {
      "dashboardUid": "370cefbc...",
      "hostUrl": "https://monitoring.aidt.ai:3000",
      "panelIds": [76],
      "threshold": 2,
      "thresholdOperator": "eq",
      "timeRangeHours": 6,
      "scheduledTimeRangeHours": 1,
      "intervalMs": 1000,
      "maxDataPoints": 100,
      "targetServices": [
        "aidt-audit-mathtype003",
        "aidt-audit-mathtype004",
        "aidt-audit-mathtype005",
        "aidt-audit-mathtype006",
        "aidt-audit-mathtype01",
        "aidt-audit-mathtype02"
      ],
      "serviceTimeRanges": [
        {
          "services": ["mathtype003", "mathtype004"],
          "startHour": 8,
          "startBufferMinutes": 40,
          "endHour": 17
        },
        {
          "services": ["mathtype005", "mathtype006"],
          "startHour": 8,
          "startBufferMinutes": 40,
          "endHour": 15
        }
      ]
    }
  },
  "enabled": true
}
```

### 5-3. 설정 필드 상세 설명

| 필드명 | 타입 | 설명 |
|--------|------|------|
| dashboardUid | string | Grafana 공용 대시보드의 고유 식별자 |
| hostUrl | string | Grafana 서버의 기본 URL |
| panelIds | number[] | 조회할 대시보드 패널 ID 목록 |
| threshold | number | 에러로 판단할 임계값 |
| thresholdOperator | 'gte' \| 'eq' | 임계값 연산자. gte: 이상(기본값), eq: 일치 |
| timeRangeHours | number | 시작 시 조회 시간 범위 (현재 시점부터 N시간 전까지) |
| scheduledTimeRangeHours | number | 정시 실행 시 조회 시간 범위. 미설정 시 timeRangeHours 사용 |
| intervalMs | number | 데이터 포인트 간 조회 간격 (밀리초) |
| maxDataPoints | number | 최대 데이터 포인트 수 |
| targetServices | string[] | 모니터링 대상 서비스명 목록 (빈 배열이면 전체 서비스) |
| serviceTimeRanges | ServiceTimeRange[] | 서비스별 시간대 조건. 미설정 시 24시간 감시 |

---

## 6. 이 기능의 기술적 장점

**1) 별도 인증 없이 공용 API 활용**

Grafana의 Public Dashboard 기능을 사용하여 API 키나 토큰 관리 없이 데이터에 접근할 수 있습니다.

**2) 다중 패널 동시 모니터링**

panelIds 배열에 여러 패널 ID를 등록하면 한 번의 체크 주기에 여러 대시보드 패널을 동시에 조회합니다.

**3) 유연한 임계값 연산자**

thresholdOperator로 gte(이상)와 eq(일치)를 지원합니다. "에러 수치가 N 이상"과 "정상 서버가 정확히 N대" 같은 서로 다른 판단 기준을 하나의 설정으로 관리할 수 있습니다.

**4) 서비스별 시간대 필터링**

serviceTimeRanges로 각 서비스의 운영 시간을 설정할 수 있습니다. 운영 시간 외의 데이터는 에러로 판정하지 않아 오탐(false positive)을 방지합니다. startBufferMinutes로 서비스 시작 후 유예 시간도 설정 가능합니다.

**5) 클라이언트 사이드 시간 필터링**

Grafana 공용 API가 from/to 파라미터를 무시하고 전체 기간 데이터를 반환하는 이슈를 클라이언트에서 timeArray[i] < from 조건으로 보완합니다.

**6) 시작/정시 시간 범위 분리**

isStartup 파라미터와 scheduledTimeRangeHours로 서버 시작 시(넓은 범위)와 정기 실행 시(좁은 범위)의 시간 범위를 분리합니다. 시작 시에는 누적된 과거 데이터를, 정기 실행 시에는 최근 데이터만 검사합니다.

**7) 기존 모니터링 인프라와 무통합 연동**

이미 Grafana 대시보드가 구축되어 있다면 추가 에이전트 설치나 데이터 파이프라인 구성 없이 API URL과 설정만으로 즉시 연동이 가능합니다.

**8) 장애 발생 시 상세 컨텍스트 제공**

에러 발생 시 어느 서비스에서 언제 어떤 수치가 임계치를 초과했는지를 상세히 Slack에 전달합니다.

---

## 7. 주요 트러블슈팅

### 7-1. Grafana API 시간 범위 무시 이슈

**문제**: Grafana 공용 대시보드 API에 from/to 파라미터를 전달해도 API가 이를 무시하고 전체 기간 데이터를 반환함.

**해결**: grafana-checker.ts에서 timeArray[i] < from 조건으로 클라이언트 사이드 필터링을 구현. API 응답의 타임스탬프 배열을 직접 검사하여 요청한 시간 범위 밖의 데이터를 제외함.

### 7-2. 매쓰타입 시간대 오탐 이슈

**문제**: 매쓰타입 6개 서버가 각각 다른 운영 시간대를 가짐. 동일한 임계값을 모든 시간대에 적용하면 서비스 미운영 시간에 오탐 발생.

**해결**: serviceTimeRanges 배열로 서비스별 startHour, startBufferMinutes, endHour 설정. isWithinTimeRange() 함수에서 현재 데이터포인트의 시각이 해당 서비스의 운영 시간 내인지 판정. 시간 범위 밖의 데이터는 에러로 카운트하지 않음.

### 7-3. 서비스명 추출 불안정

**문제**: Grafana API 응답의 frame에 따라 schema.name이 없는 경우가 있어 서비스명 추출이 실패함.

**해결**: extractServiceName() 함수에서 3단계 폴백 체인 적용: (1) schema.name, (2) executedQueryString 파싱, (3) panel-{id} 기본값.

---

## 8. 전체 데이터 흐름 요약

```
[Scheduler (node-cron)]
       |
       v
[Monitor.checkUrl(config, isStartup)]
       |
       |-- grafanaApiCheck 설정 존재? --> [checkGrafanaApi(config, isStartup)]
       |                                          |
       |                                          v
       |                              [시간 범위 결정]
       |                              - isStartup=true: timeRangeHours
       |                              - isStartup=false: scheduledTimeRangeHours
       |                                          |
       |                                          v
       |                              [Grafana Public API]
       |                              POST /panels/{id}/query
       |                                          |
       |                                          v
       |                              [응답 파싱]
       |                              - extractServiceName()로 서비스명 추출
       |                              - timeArray[i] < from 클라이언트 필터링
       |                              - targetServices 필터링
       |                                          |
       |                                          v
       |                              [임계치 검증]
       |                              - thresholdOperator (gte/eq) 적용
       |                              - isWithinTimeRange() 시간대 조건 확인
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
- 에러 조건 테이블 (서비스/시간대/조건)
- 상세 모달 (임계치 초과 테이블)
```

---

## 9. 결론

SUBAK Server Monitoring의 Grafana 수치 감지 기능은 기존 Grafana 관측 인프라 위에 "능동적 감시 레이어"를 추가하는 접근 방식입니다. 대시보드를 사람이 직접 확인하는 수동적 모니터링에서, 시스템이 자동으로 수치를 읽고 임계치를 판단하여 Slack으로 즉시 통보하는 능동적 모니터링으로 전환할 수 있습니다.

thresholdOperator와 serviceTimeRanges 기능을 통해 서로 다른 판단 기준과 운영 시간을 가진 다수의 서비스를 하나의 설정으로 통합 관리할 수 있습니다. 별도의 데이터 파이프라인 구축이나 에이전트 설치 없이 Grafana 공용 API만으로 구현되었기 때문에 도입 장벽이 매우 낮습니다.
