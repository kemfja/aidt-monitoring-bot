# Changelog 2026-04-22

## 프로젝트 문서 업데이트 (매쓰타입 모니터링 반영)

### 변경 내용
- SUBAK-Project-Overview: 모니터링 대상 3개 -> 4개 (매쓰타입 서버 추가), thresholdOperator, serviceTimeRanges, restart-server.bat 개선사항 반영
- SUBAK-Grafana-Monitoring-DeepDive: thresholdOperator(gte/eq), serviceTimeRanges, scheduledTimeRangeHours, 클라이언트 사이드 시간 필터링, 서비스명 추출 로직, 트러블슈팅 섹션 추가
- 기존 docx 파일의 마크다운 원본 추가 관리

### 변경 파일
- `docs/SUBAK-Project-Overview.docx` - 매쓰타입 모니터링, 임계값 연산자, 시간대 조건 등 업데이트
- `docs/SUBAK-Project-Overview.md` - 마크다운 원본 신규 추가
- `docs/SUBAK-Grafana-Monitoring-DeepDive.docx` - 임계값 연산자, 시간대 필터링, 트러블슈팅 등 업데이트
- `docs/SUBAK-Grafana-Monitoring-DeepDive.md` - 마크다운 원본 신규 추가

## MD -> DOCX 변환 스크립트 추가

### 변경 내용
- 마크다운 파일을 Word 문서로 변환하는 Node.js 스크립트 작성
- 헤딩, 테이블, 코드블록, 인라인 포맷팅 지원

### 추가 파일
- `scripts/md-to-docx.js` - 변환 스크립트
- `package.json` - docx, mammoth devDependency 추가
