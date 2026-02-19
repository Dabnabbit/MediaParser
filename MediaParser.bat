@echo off
title MediaParser
cd /d "%~dp0"
tools\python\python.exe launcher.py %*
if %errorlevel% neq 0 (
    echo.
    echo MediaParser exited with error %errorlevel%. Check the output above.
    pause
)
