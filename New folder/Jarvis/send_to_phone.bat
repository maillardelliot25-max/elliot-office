@echo off
rem Right-click any file -> Send to -> Jarvis phone. It appears in the Clip tab on your phone/tablet.
set "OUT=%USERPROFILE%\Downloads\Jarvis\To phone"
if not exist "%OUT%" mkdir "%OUT%"
:next
if "%~1"=="" goto done
if exist "%~1\*" (
  echo Skipping folder %~nx1 - send the files inside it instead.
) else (
  copy /y "%~1" "%OUT%\" >nul && echo Sent %~nx1
)
shift
goto next
:done
timeout /t 2 >nul
