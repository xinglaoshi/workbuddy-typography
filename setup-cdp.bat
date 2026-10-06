@echo off
REM ============================================================
REM  WorkBuddy Typography Plugin - Setup CDP Port
REM  Creates a desktop shortcut that starts WorkBuddy with
REM  --remote-debugging-port so the plugin can inject CSS.
REM  Run this ONCE per Windows account.
REM
REM  Pure ASCII on purpose (see README.md for Chinese docs).
REM  Logging is done in JS to avoid cmd.exe escaping problems.
REM ============================================================
setlocal

REM Resolve plugin dir from this script's own location (portable).
set PLUGIN_DIR=%~dp0
if "%PLUGIN_DIR:~-1%"=="\" set PLUGIN_DIR=%PLUGIN_DIR:~0,-1%
set CDP_PORT=9222

REM --- locate WorkBuddy.exe ---
REM WB_EXE can be overridden:  setup-cdp.bat "C:\path\to\WorkBuddy.exe"
set WB_EXE=%~1
if not defined WB_EXE set WB_EXE=D:\Programs\WorkBuddy\WorkBuddy.exe

REM --- locate node ---
set NODE_BIN=
for /f "delims=" %%d in ('dir /b /ad "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
  if not defined NODE_BIN if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe" set NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe
)
if not defined NODE_BIN for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_BIN set NODE_BIN=%%i
)
if not defined NODE_BIN (
  echo [typography] ERROR: node.exe not found. Install Node.js 18+ and retry.
  echo Press any key to close...
  pause
  exit /b 1
)

echo [typography] Using node: %NODE_BIN%
echo.

"%NODE_BIN%" "%PLUGIN_DIR%\make-launcher.js" %CDP_PORT% "%WB_EXE%"
set RC=%ERRORLEVEL%

echo.
if not "%RC%"=="0" (
  echo [typography] Setup FAILED. See the error above.
) else (
  echo [typography] Setup finished. Read the next steps listed above.
)
echo Press any key to close...
pause
endlocal
