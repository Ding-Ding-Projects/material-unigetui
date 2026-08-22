@echo off
REM Obtains every dependency this project needs to build, run and test.
REM
REM Silent mode: /s, --silent, or SILENT=1 in the environment. It installs and
REM builds with no prompt and no interactive pause, and exits non-zero on the
REM first real failure so a caller can branch on it.
REM
REM Code signing is permanently prohibited for this project. Nothing in this
REM path requests, discovers or invokes a signer.
setlocal
set SILENT_FLAG=
if /I "%~1"=="/s" set SILENT_FLAG=-Silent
if /I "%~1"=="--silent" set SILENT_FLAG=-Silent
if "%SILENT%"=="1" set SILENT_FLAG=-Silent

REM Invoked by absolute path, and with forward slashes: cmd with
REM NoDefaultCurrentDirectoryInExePath set refuses to search the current
REM directory, and a backslash written through a shell can be eaten as an
REM escape - "script\build-windows.ps1" once reached disk as a backspace byte.
REM PowerShell accepts forward slashes on Windows, so the escape is not needed.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0script/build-windows.ps1" -Mode Prepare %SILENT_FLAG%
exit /b %ERRORLEVEL%
