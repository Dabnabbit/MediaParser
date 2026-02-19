@echo off
title MediaParser
cd /d "%~dp0"
tools\python\python.exe launcher.py %*
