@echo off
title Git Push Tool
echo ============================================================
echo   Git Auto-Push Script - Face AI Attendance
echo ============================================================
echo.

:: Define git executable path
set GIT_PATH="C:\Users\Aspire\AppData\Local\GitHubDesktop\app-3.6.3\resources\app\git\cmd\git.exe"

if not exist %GIT_PATH% (
    echo [INFO] GitHub Desktop git.exe not found at default location.
    echo Trying to use system git command...
    set GIT_PATH=git
)

:: Stage all files
echo Staging all changes...
%GIT_PATH% add .
if %errorlevel% neq 0 (
    echo [ERROR] Git add failed. Check your repository status.
    goto end
)
echo [SUCCESS] Stage files completed.
echo.

:: Ask for commit message
set /p commit_msg="Enter commit message (Press Enter for default: UI: Update report filters and custom datepicker): "

if "%commit_msg%"=="" (
    set commit_msg=UI: Update report filters and custom datepicker
)

:: Commit
echo.
echo Committing changes...
%GIT_PATH% commit -m "%commit_msg%"
echo.

:: Push
echo Pushing code to GitHub (branch: main)...
echo.
echo * Note: If a login popup appears, please click "Sign in with your browser"
echo.
%GIT_PATH% push origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo   [SUCCESS] Code pushed to GitHub successfully!
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo   [ERROR] Git push failed. 
    echo   Please check your internet connection or login credentials.
    echo ============================================================
)

:end
echo.
echo Press any key to close this window...
pause > nul
