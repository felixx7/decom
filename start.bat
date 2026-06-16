@echo off
title Topic Brancher Launcher
cd /d "%~dp0"

echo ==========================================
echo   Menjalankan Topic Branching App...
echo ==========================================

:: Menunggu 2 detik kemudian membuka browser secara otomatis ke alamat aplikasi
start /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"

:: Menjalankan server Node.js
npm run dev

pause
