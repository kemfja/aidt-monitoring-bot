@echo off
chcp 65001 >nul
title SUBAK 서버 재시작

cd /d "D:\minjung1.kim\Downloads\subak's server monitoring"

echo [SUBAK] 빌드 중...
call npx tsc
if %errorlevel% neq 0 (
    echo [SUBAK] 빌드 실패. 10초 후 종료합니다.
    timeout /t 10
    exit /b 1
)
echo [SUBAK] 빌드 성공

echo [SUBAK] PM2 재시작 중...
call C:\Users\minjung1.kim\AppData\Roaming\npm\pm2.cmd restart monitoring-bot
timeout /t 3 /nobreak >nul

echo [SUBAK] 서버 상태 확인...
curl -s -o nul -w "HTTP %%{http_code}\n" http://localhost:11111/api/urls

echo [SUBAK] 재시작 완료
