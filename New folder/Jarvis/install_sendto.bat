@echo off
rem Adds "Jarvis phone" to the right-click Send to menu in File Explorer.
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('SendTo')+'\Jarvis phone.lnk'); $s.TargetPath='%~dp0send_to_phone.bat'; $s.WindowStyle=7; $s.Save()"
echo Done. Right-click any file - Send to - Jarvis phone.
