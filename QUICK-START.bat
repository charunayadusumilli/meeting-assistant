@echo off
echo ========================================
echo  Meeting Assistant - Quick Start
echo ========================================
echo.

echo [1/3] Installing Electron App Dependencies...
cd /d "%~dp0resources\app"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ✗ Failed to install Electron app dependencies
    pause
    exit /b 1
)
echo ✓ Electron app dependencies installed
echo.

echo [2/3] Installing Backend Dependencies...
cd /d "%~dp0backend"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ✗ Failed to install backend dependencies
    pause
    exit /b 1
)
echo ✓ Backend dependencies installed
echo.

echo [3/3] Verifying Installation...
cd /d "%~dp0resources\app"
if exist "node_modules\electron-log" (
    echo ✓ electron-log found
) else (
    echo ✗ electron-log missing
)
echo.

echo ========================================
echo  ✓ Setup Complete!
echo ========================================
echo.
echo You can now:
echo   - Launch the Meeting Assistant app
echo   - Run backend tests: cd backend ^&^& npm test
echo.
echo Press any key to exit...
pause >nul
