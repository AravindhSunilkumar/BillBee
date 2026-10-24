@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 or later from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo BillBee needs Node.js 24 or later. Update Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist ".env.local" copy /y ".env.example" ".env.local" >nul
node --env-file=.env.local -e "if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) process.exit(1)"
if errorlevel 1 (
  echo Enter your Supabase project URL and publishable key in .env.local, save it, then run this file again.
  notepad ".env.local"
  pause
  exit /b 1
)

echo Keep this window open while using BillBee. Press Ctrl+C to stop.
node --env-file=.env.local server/dev.js
pause
