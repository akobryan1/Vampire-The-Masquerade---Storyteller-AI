@echo off
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing desktop app dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b %errorlevel%
)

echo Building Midnight Domain...
call node node_modules/vite/bin/vite.js build
if errorlevel 1 exit /b %errorlevel%

echo Launching Midnight Domain desktop app...
start "" "node_modules\electron\dist\electron.exe" "electron\main.cjs"
