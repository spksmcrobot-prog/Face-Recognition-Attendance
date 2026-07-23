@echo off
chcp 65001 > nul
title Git Push Tool - Face AI Attendance

echo ============================================================
echo            Git Auto-Push Tool (ระบบเช็คชื่อ นศท)
echo ============================================================
echo.

:: Check if git is installed and accessible
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบการติดตั้ง Git ในระบบ! กรุณาติดตั้ง Git ก่อนใช้งาน
    goto end
)

:: Auto check and init git if not exists
if not exist ".git" (
    echo [INFO] เริ่มต้น Git Repository...
    git init
    git branch -M main
)

:: Step 1: Stage all changes
echo [1/3] กำลังเตรียมไฟล์ที่แก้ไข (Staging changes)...
git add .
if %errorlevel% neq 0 (
    echo [ERROR] คำสั่ง git add ล้มเหลว กรุณาตรวจสอบสถานะ Repository
    goto end
)
echo [สำเร็จ] เตรียมไฟล์เรียบร้อย!
echo.

:: Step 2: Get commit message
set /p commit_msg="ป้อนข้อความอธิบายการแก้ไข (กด Enter หากต้องการใช้ค่าเริ่มต้น: UI/Code updates): "
if "%commit_msg%"=="" (
    set commit_msg=UI/Code updates
)
echo.

:: Step 3: Commit
echo [2/3] กำลังบันทึกการแก้ไข (Committing)...
git commit -m "%commit_msg%"
if %errorlevel% neq 0 (
    echo [INFO] ไม่มีไฟล์ใหม่หรือไฟล์ที่เปลี่ยนแปลงเพื่อทำการ commit
) else (
    echo [สำเร็จ] บันทึกการแก้ไขเรียบร้อย!
)
echo.

:: Step 4: Push
echo [3/3] กำลังส่งโค้ดขึ้น GitHub (Pushing to main)...
git push origin main
if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo   [SUCCESS] อัปโหลดโค้ดขึ้น GitHub เรียบร้อยแล้ว!
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo   [ERROR] อัปโหลดโค้ดล้มเหลว!
    echo   กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือการยืนยันตัวตน GitHub
    echo ============================================================
)

:end
echo.
echo กดปุ่มใดๆ เพื่อปิดหน้าต่างนี้...
pause > nul
