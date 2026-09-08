ECHO OFF
REM This script deploys both the server and client applications to fly.io
call "%~dp0deploy_server.bat"
if errorlevel 1 exit /b 1
call "%~dp0deploy_client.bat"
