@echo off
REM ============================================================
REM  WorkBuddy Typography Plugin - Apply
REM  Pure ASCII on purpose. Chinese text here would be garbled
REM  by cmd.exe codepage. See README.md for Chinese docs.
REM ============================================================
setlocal

REM Resolve plugin dir from this script's own location, so the whole
REM folder can be moved anywhere without editing this file.
set PLUGIN_DIR=%~dp0
if "%PLUGIN_DIR:~-1%"=="\" set PLUGIN_DIR=%PLUGIN_DIR:~0,-1%
REM Auto-detect node: prefer WorkBuddy managed runtime, fall back to PATH.
set NODE_BIN=
for /f "delims=" %%d in ('dir /b /ad "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
  if not defined NODE_BIN if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe" set NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe
)
if not defined NODE_BIN for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_BIN set NODE_BIN=%%i
)
if not defined NODE_BIN (
  echo [typography] ERROR: node.exe not found.
  echo [typography] Install Node.js 18+ then run apply again.
  pause
  exit /b 1
)
set CDP_PORT=9222

echo [typography] Plugin dir: %PLUGIN_DIR%
echo [typography] Node: %NODE_BIN%

REM --- Step 1: stop existing watcher (lock port is released on exit) ---
echo [typography] Stopping previous watcher if any...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :9335 ^| findstr LISTENING') do (
  taskkill /PID %%p /F >nul 2>&1
)

REM --- Step 2: is WorkBuddy running with CDP port open? ---
echo [typography] Checking CDP port %CDP_PORT%...
REM curl succeeds only if it got a valid HTTP reply. Use findstr to
REM confirm real JSON came back - curl alone gives false positives.
set PORT_CHECK=
for /f "usebackq delims=" %%j in (`curl -s -m 3 http://127.0.0.1:%CDP_PORT%/json/version 2^>nul`) do set PORT_CHECK=%%j
echo %PORT_CHECK% | findstr /C:"webSocketDebuggerUrl" >nul
if errorlevel 1 (
  echo [typography] CDP port %CDP_PORT% is NOT available.
  echo.
  echo [typography] WorkBuddy must be started with the debug port.
  echo [typography] If you have not set that up yet:
  echo    1. Run setup-cdp.bat once
  echo    2. Close WorkBuddy completely
  echo    3. Start it from the new desktop shortcut
  echo    4. Run this apply.bat again
  echo.
  pause
  exit /b 1
)
echo [typography] CDP is up.

REM --- Step 3: inject typography CSS once ---
echo [typography] Injecting...
"%NODE_BIN%" "%PLUGIN_DIR%\inject.js" %CDP_PORT%
if errorlevel 1 (
  echo [typography] Initial inject failed.
  pause
  exit /b 1
)

REM --- Step 4: start watcher detached (survives this window) ---
echo [typography] Starting watcher...
start "" /min "%NODE_BIN%" "%PLUGIN_DIR%\watcher.js" %CDP_PORT%

echo.
echo [typography] Done. Edit config.json to change font - takes effect in ~2s.
echo [typography] To remove: run remove.bat
echo Press any key to close...
pause
endlocal
