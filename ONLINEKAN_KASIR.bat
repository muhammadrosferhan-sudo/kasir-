@echo off
title Onlinekan Aplikasi Kasir ke Internet
color 0B
echo ========================================================
echo   MENGHUBUNGKAN APLIKASI KASIR KE INTERNET (ONLINE)
echo ========================================================
echo.
echo Pastikan JALANKAN_SERVER.bat sudah aktif terlebih dahulu.
echo Menghubungkan ke internet... Tunggu hingga muncul link https://...
echo.
ssh -R 80:localhost:3000 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 nokey@localhost.run
pause
