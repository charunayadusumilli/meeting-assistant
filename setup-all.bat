@echo off
echo ========================================
echo  Meeting Assistant - Complete Setup
echo ========================================
echo.

echo [1/2] Installing Electron app dependencies...
cd /d "%~dp0\resources\app"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ✗ Failed to install Electron app dependencies
    goto :error
)
echo ✓ Electron app dependencies installed
echo.

echo [2/2] Installing backend dependencies...
cd /d "%~dp0\backend"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ✗ Failed to install backend dependencies
    goto :error
)
echo ✓ Backend dependencies installed
echo.

echo ========================================
echo  ✓ Setup Complete!
echo ========================================
echo.
echo You can now:
echo   - Launch the Electron app
echo   - Run backend tests with: cd backend ^&^& npm test
echo.
goto :end

:error
echo.
echo ========================================
echo  ✗ Setup Failed
echo ========================================
echo.
echo Please ensure Node.js and npm are installed.
echo Download from: https://nodejs.org/
echo.

:end
pause
