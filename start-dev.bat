@echo off
rem Double-click to run the app in development mode.
rem This window closes by itself when you close the app.
cd /d "%~dp0"

rem Some editors set this, and it makes Electron start as plain Node and crash.
set ELECTRON_RUN_AS_NODE=

if not exist node_modules (
  echo Installing packages, this takes a minute the first time...
  call npm install
)

call npm run dev

rem Only stay open if something went wrong, so the error can be read.
if errorlevel 1 pause
