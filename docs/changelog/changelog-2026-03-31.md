# Changelog 2026-03-31

## 자동 검사 토글 기능 추가

### 변경 사항
- 대시보드 헤더 우측에 자동 검사 ON/OFF 토글 스위치 추가
- `GET /api/monitoring/scheduler/status` - 스케줄러 활성화 상태 조회 API 추가
- `POST /api/monitoring/scheduler/toggle` - 스케줄러 ON/OFF 토글 API 추가 (API Key 필요)

### 동작
- ON: 매 정시마다 자동 체크 실행 (서버 시작 시 기본값)
- OFF: 다시 ON으로 전환할 때까지 자동 체크 중지
- OFF -> ON 전환 시 즉시 체크 1회 실행 후 스케줄 재개
- 서버 재시작 시 항상 ON 상태로 시작

### 수정 파일
- `src/routes/monitoring.ts` - 스케줄러 상태 조회/토글 엔드포인트 추가
- `public/index.html` - 토글 스위치 UI 추가
- `public/css/dashboard.css` - 토글 스타일 추가
- `public/js/dashboard.js` - 토글 API 연동 로직 추가
