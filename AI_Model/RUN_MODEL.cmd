@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  py -m supplyguard_sgri.company_model_cli --interactive --output company_model_result.json
) else (
  python -m supplyguard_sgri.company_model_cli --interactive --output company_model_result.json
)
if errorlevel 1 (
  echo.
  echo 실행에 실패했습니다. 위 오류 메시지를 확인하세요.
) else (
  echo.
  echo 완료: company_model_result.json
)
pause
