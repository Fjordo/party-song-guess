ECHO OFF
REM This script deploys the client application to fly.io
pushd "%~dp0..\app\client"
fly deploy --remote-only
popd
