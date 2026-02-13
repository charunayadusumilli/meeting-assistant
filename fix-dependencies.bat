@echo off
echo ========================================
echo  Fixing Missing Dependencies
echo ========================================
echo.

REM Check if npm is available
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ✗ ERROR: npm is not installed or not in PATH
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo After installation, restart your terminal and run this script again.
    pause
    exit /b 1
)

echo ✓ npm is available
echo.

echo Current directory: %CD%
echo.

echo ----------------------------------------
echo  Step 1: Installing Electron App Dependencies
echo ----------------------------------------
cd /d "%~dp0resources\app"
echo Current path: %CD%
echo.

if not exist "package.json" (
    echo ✗ ERROR: package.json not found in resources\app
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install --verbose
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Failed to install Electron app dependencies
    echo.
    echo Please check the error messages above.
    pause
    exit /b 1
)

echo.
echo ✓ Electron app dependencies installed successfully
echo.

REM Verify electron-log is installed
if exist "node_modules\electron-log" (
    echo ✓ Verified: electron-log is installed
) else (
    echo ✗ WARNING: electron-log not found in node_modules
)
echo.

echo ----------------------------------------
echo  Step 2: Installing Backend Test Dependencies
echo ----------------------------------------
cd /d "%~dp0backend"
echo Current path: %CD%
echo.

if not exist "package.json" (
    echo ✗ WARNING: package.json not found in backend
    goto :finish
)

echo Installing backend dependencies...
call npm install --verbose
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Failed to install backend dependencies
    pause
    exit /b 1
)

echo.
echo ✓ Backend dependencies installed successfully
echo.

:finish
echo ========================================
echo  ✓ Installation Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Launch the Meeting Assistant app
echo   2. The "Cannot find module 'electron-log'" error should be fixed
echo   3. To run backend tests: cd backend && npm test
echo.
pause
