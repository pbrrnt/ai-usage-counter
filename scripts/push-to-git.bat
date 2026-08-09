@echo off
REM ============================================================
REM  push-to-git.bat — launcher สำหรับ double-click จาก desktop
REM  เรียก push-to-git.ps1 (ข้าม ExecutionPolicy เฉพาะครั้งนี้)
REM
REM  วางไฟล์นี้ + push-to-git.ps1 ไว้โฟลเดอร์เดียวกัน
REM  (เช่น C:\ai-usage-counter\scripts\) แล้วสร้าง shortcut ของ .bat ไปที่ desktop
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-git.ps1"

pause
