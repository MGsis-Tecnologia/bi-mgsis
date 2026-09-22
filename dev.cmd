@echo off
setlocal
cd /d "%~dp0"

REM ---------------------------------------------------------------
REM  Sobe o BI em http://localhost:3000
REM  Uso:  dev           -> sobe normal (rapido, usa o cache)
REM        dev limpar    -> apaga o cache do Next antes de subir
REM ---------------------------------------------------------------

REM 1) Derruba qualquer servidor dev antigo preso na porta 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  echo Encerrando servidor antigo na porta 3000 ^(PID %%a^)...
  taskkill /f /pid %%a >nul 2>&1
)

REM 2) Limpeza opcional do cache (.next/dev costuma passar de 2 GB)
if /i "%~1"=="limpar" (
  echo Limpando o cache do Next...
  if exist ".next\dev" rmdir /s /q ".next\dev"
  if exist ".next\cache" rmdir /s /q ".next\cache"
)

REM 3) Teto de memoria do Node. A maquina tem ~12 GB e o Postgres
REM    roda junto, entao sem teto o Turbopack come tudo e trava o PC.
set NODE_OPTIONS=--max-old-space-size=3072

echo.
echo Subindo o BI... aguarde o "Ready" e abra http://localhost:3000
echo Para parar: Ctrl+C nesta janela.
echo.
call npm run dev
