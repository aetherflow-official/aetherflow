@echo off
:: Self-elevation check
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to trust local development certificate...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb runAs"
    exit /b
)

echo ========================================================
echo Installing AetherFlow Development Certificate...
echo ========================================================
certutil -addstore -f "TrustedPeople" "%~dp0AetherFlowDev.cer"
certutil -addstore -f "Root" "%~dp0AetherFlowDev.cer"

echo.
echo ========================================================
echo SUCCESS! Certificate trusted by Windows.
echo You can now double-click 'AetherFlow_1.1.1_x64.msix' to install!
echo ========================================================
pause
