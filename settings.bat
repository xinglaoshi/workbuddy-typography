@echo off
REM ============================================================
REM  WorkBuddy Typography Plugin - Settings UI
REM  Opens the local settings page in your default browser.
REM  Pure ASCII on purpose (see README.md for Chinese docs).
REM ============================================================
setlocal

REM Resolve plugin dir from this script's own location, so the whole
REM folder can be moved anywhere without editing this file.
set PLUGIN_DIR=%~dp0
if "%PLUGIN_DIR:~-1%"=="\" set PLUGIN_DIR=%PLUGIN_DIR:~0,-1%
set UI_PORT=8787

set NODE_BIN=
for /f "delims=" %%d in ('dir /b /ad "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
  if not defined NODE_BIN if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe" set NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe
)
if not defined NODE_BIN for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_BIN set NODE_BIN=%%i
)
if not defined NODE_BIN (
  echo [typography] ERROR: node.exe not found. Install Node.js 18+ and retry.
  goto done
)

echo [typography] Starting settings server on port %UI_PORT%...
start "" "%NODE_BIN%" "%PLUGIN_DIR%\server.js"

REM wait for the port then open the browser
set TRIES=0
:wait
timeout /t 1 /nobreak >nul
set TRIES=%TRIES%1+1
curl -s -m 2 "http://127.0.0.1:%UI_PORT%/api/path" >nul 2>&1
if not errorlevel 1 goto open
if %TRIES% lss 10 goto retry

:retry
echo [typography] Server did not respond in time. Opening browser anyway.
start "" "http://127.0.0.1:%UI_PORT%/"
goto done

:open
echo [typography] Opening browser...
start "" "http://127.0.0.1:%UI_PORT%/"

:done
echo.
echo Press any key to close...
pause
endlocal
