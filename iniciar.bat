@echo off
chcp 65001 >nul
title Stream Deck
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js em https://nodejs.org e rode de novo. & pause & exit /b)
set STREAMDECK_BAT=1
:inicio
node server.js
if %errorlevel%==42 goto inicio
pause
