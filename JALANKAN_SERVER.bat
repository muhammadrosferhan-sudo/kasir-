@echo off
title Server Kasir POS (Node.js + SQLite)
color 0A
echo ========================================================
echo   MENJALANKAN SERVER APLIKASI KASIR (NODE.JS + SQLITE)
echo ========================================================
echo.
echo Server siap diakses di browser: http://localhost:3000
echo Tekan Ctrl + C untuk mematikan server.
echo.
cd /d "%~dp0"
node server.js
pause
