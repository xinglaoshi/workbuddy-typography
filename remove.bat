@echo off
REM ============================================================
REM  WorkBuddy Typography Plugin - Remove
REM  Stops the watcher and removes injected CSS. Leaves official
REM  appearance 100% untouched (plugin never modified app files).
REM  Pure ASCII on purpose (see README.md for Chinese docs).
REM ============================================================
setlocal

REM Resolve plugin dir from this script's own location (portable).
set PLUGIN_DIR=%~dp0
if "%PLUGIN_DIR:~-1%"=="\" set PLUGIN_DIR=%PLUGIN_DIR:~0,-1%
set NODE_BIN=
for /f "delims=" %%d in ('dir /b /ad "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
  if not defined NODE_BIN if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe" set NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\%%d\node.exe
)
if not defined NODE_BIN for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_BIN set NODE_BIN=%%i
)
if not defined NODE_BIN set NODE_BIN=node
set CDP_PORT=9222

echo [typography] Stopping watcher...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :9335 ^| findstr LISTENING') do (
  taskkill /PID %%p /F >nul 2>&1
)

echo [typography] Removing injected CSS from open pages...
"%NODE_BIN%" -e "const http=require('http');function g(p){return new Promise((s,j)=>{http.get({host:'127.0.0.1',port:%CDP_PORT%,path:p,timeout:2500},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{s(JSON.parse(d))}catch(e){j(e)}})}).on('error',j).on('timeout',()=>{j(new Error('timeout'))})})}(async()=>{try{const t=await g('/json/list');const p=t.filter(x=>x.webSocketDebuggerUrl&&['page','webview','iframe'].includes(x.type));let n=0;for(const x of p){try{const ws=new WebSocket(x.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j)});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:\"(function(){var o=document.getElementById('wb-typography');if(o){o.remove();return 'removed'}return 'none'})()\",returnByValue:true}}));n++;ws.close()}catch(e){}}console.log('[typography] processed '+n+' pages')}catch(e){console.log('[typography] CDP not reachable: '+e.message)}})()"

echo.
echo [typography] Typography removed. Official appearance is untouched.
echo [typography] (The plugin never modified app files - nothing to restore.)
echo Press any key to close...
pause
endlocal
