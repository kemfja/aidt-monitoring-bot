@echo off
chcp 65001 >nul
title SUBAK Server Monitoring

cd /d "D:\minjung1.kim\Downloads\subak's server monitoring"
if %errorlevel% neq 0 (
    echo [SUBAK] 디렉토리 이동 실패
    pause
    exit /b 1
)
echo [SUBAK] 디렉토리 이동 성공

echo [SUBAK] 서버 빌드 중...
call npx tsc
if %errorlevel% neq 0 (
    echo [SUBAK] 빌드 실패. 10초 후 종료합니다.
    timeout /t 10
    exit /b 1
)
echo [SUBAK] 빌드 성공

echo [SUBAK] PM2로 서버 시작 중...
call C:\Users\minjung1.kim\AppData\Roaming\npm\pm2.cmd start dist/server.js --name "monitoring-bot"
echo [SUBAK] PM2 시작 완료

echo [SUBAK] 서버 기동 대기 중...
timeout /t 5 /nobreak >nul

echo [SUBAK] 대시보드 실행...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Default" http://localhost:11111
echo [SUBAK] 대시보드 실행 완료

echo [SUBAK] Slack 실행...
start "" "%LOCALAPPDATA%\Slack\slack.exe"
echo [SUBAK] Slack 실행 완료
