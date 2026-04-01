@echo off
chcp 65001 >nul
title SUBAK Server Monitoring

cd /d "D:\minjung1.kim\Downloads\subak's server monitoring"

echo [SUBAK] 서버 빌드 중...
call npx tsc
if %errorlevel% neq 0 (
    echo [SUBAK] 빌드 실패. 10초 후 종료합니다.
    timeout /t 10
    exit /b 1
)

echo [SUBAK] 서버 시작 중...
start "" npm start

echo [SUBAK] 서버 기동 대기 중...
timeout /t 5 /nobreak >nul

echo [SUBAK] 대시보드 실행...
start http://localhost:11111
