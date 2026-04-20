@echo off

:: Self-elevate to administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    copy /y "%~f0" "%temp%\subak-restart.bat" >nul
    powershell -Command "Start-Process '%temp%\subak-restart.bat' -Verb RunAs"
    exit /b
)

chcp 65001 >nul
title SUBAK Server Restart

cd /d "D:\minjung1.kim\Downloads\subak's server monitoring"
if %errorlevel% neq 0 (
    echo [SUBAK] cd failed
    pause
    exit /b 1
)

echo [SUBAK] Building...
call npx tsc
if %errorlevel% neq 0 (
    echo [SUBAK] Build failed
    pause
    exit /b 1
)
echo [SUBAK] Build OK

echo [SUBAK] Stopping all node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [SUBAK] Cleaning PM2 state...
del /f /q "%USERPROFILE%\.pm2\pm2.pid" 2>nul
del /f /q "%USERPROFILE%\.pm2\pids\*" 2>nul

echo [SUBAK] Starting server...
call C:\Users\minjung1.kim\AppData\Roaming\npm\pm2.cmd start "dist/server.js" --name "monitoring-bot" >nul 2>&1
timeout /t 3 /nobreak >nul

echo [SUBAK] Health check...
curl -s -o nul -w "HTTP %%{http_code}\n" http://localhost:11111/api/urls 2>nul | findstr "200" >nul
if %errorlevel% equ 0 (
    echo [SUBAK] SUCCESS - Server is running
) else (
    echo [SUBAK] FAILED - Server is not responding
)

pause
