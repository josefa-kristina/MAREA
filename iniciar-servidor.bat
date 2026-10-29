@echo off
title MAREA - Servidor Local
echo Iniciando servidor local para MAREA...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
pause
