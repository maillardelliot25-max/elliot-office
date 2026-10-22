@echo off
rem Starts the God Station automatically every time you log in to Windows.
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Jarvis God Station.lnk'); $s.TargetPath='%~dp0start_station.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo Done. The God Station will start (minimized) when you log in.
echo To undo: press Win+R, type shell:startup, delete "Jarvis God Station".
if /i not "%~1"=="/quiet" pause
