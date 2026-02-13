@echo off
echo Installing Electron app dependencies...
echo.
cd /d "%~dp0"
npm install
echo.
if %ERRORLEVEL% EQU 0 (
    echo ✓ Dependencies installed successfully!
    echo You can now launch the app.
) else (
    echo ✗ Installation failed. Please check if Node.js/npm is installed.
    echo Visit: https://nodejs.org/
)
echo.
pause
