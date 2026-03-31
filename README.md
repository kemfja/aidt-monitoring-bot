# 서버 모니터링 시스템

웹사이트 모니터링 및 에러 알림 시스템입니다.

## 기능

- 다중 URL 모니터링
- HTTP 상태 코드, 응답 시간, 에러 키워드 검사
- 에러 발생 시 이메일 알림
- 웹 대시보드에서 실시간 상태 확인
- JSON 파일 기반 데이터 저장 (1주일 보관)

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 설정을 수정하세요.

```bash
cp .env.example .env
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 빌드

```bash
npm run build
```

### 5. 프로덕션 실행

```bash
npm start
```

## 사용법

1. 브라우저에서 `http://localhost:3000` 접속
2. "URL 추가" 버튼으로 모니터링 대상 추가
3. "지금 실행" 버튼으로 즉시 모니터링 실행
4. 자동으로 설정된 간격으로 모니터링 실행 (기본: 5분마다)

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/urls | 전체 URL 목록 조회 |
| POST | /api/urls | URL 추가 |
| PUT | /api/urls/:id | URL 수정 |
| DELETE | /api/urls/:id | URL 삭제 |
| GET | /api/monitoring/status | 현재 상태 요약 |
| GET | /api/monitoring/urls | 모든 URL 상태 |
| GET | /api/monitoring/results | 모니터링 기록 조회 |
| POST | /api/monitoring/run | 수동 모니터링 실행 |
