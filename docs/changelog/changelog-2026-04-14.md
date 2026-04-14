# Changelog 2026-04-14

## 매쓰타입 Grafana 체크 시간 범위 분기 처리

### 변경 내용
- 서버 시작 시: `timeRangeHours` (6시간) 전체 데이터 조회 (기존 동작 유지)
- 정시 체크 시: `scheduledTimeRangeHours` (1시간) 축소 데이터 조회
- 절전 복귀 / 수동 실행: 정시 체크와 동일하게 축소 범위 사용

### 변경 파일
- `src/models/url-config.ts` - `GrafanaApiCheck` 인터페이스에 `scheduledTimeRangeHours` 필드 추가
- `src/utils/grafana-checker.ts` - `isStartup` 파라미터로 시간 범위 분기 처리
- `src/core/monitor.ts` - `isStartup` 컨텍스트 전달
- `src/core/scheduler.ts` - 시작/정시/복구 실행 구분
- `data/config.json` - 매쓰타입 설정에 `scheduledTimeRangeHours: 1` 추가

### 누락 체크 복구
기존 복구 메커니즘(recoverMissedRun, startWakeUpDetector)이 Grafana 체크에도 정상 적용됨을 확인.

## 매쓰타입 서비스 시간대 버퍼 추가

### 변경 내용
- 34번(mathtype003, 004): 8:00~20:00 -> 8:20~20:00
- 56번(mathtype005, 006): 8:00~15:00 -> 8:20~15:00
- 12번(mathtype01, 02): 시간 제한 없음 (변경 없음)

### 변경 파일
- `src/models/url-config.ts` - `ServiceTimeRange`에 `startBufferMinutes` 필드 추가
- `src/utils/grafana-checker.ts` - `isWithinTimeRange`에서 분 단위 버퍼 처리
- `data/config.json` - 34, 56 그룹에 `startBufferMinutes: 20` 적용
