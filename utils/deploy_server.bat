ECHO OFF
REM This script deploys the server application to fly.io
pushd "%~dp0..\app\server"
fly deploy --remote-only
popd
