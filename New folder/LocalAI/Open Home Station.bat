@echo off
rem Opens Friday's Home Station dashboard in its own window (no tabs or address bar).
rem Friday must be running (Start Elliot AI.bat). Move the window to the tablet with Win+Shift+Right Arrow,
rem then click "Full screen" on the dashboard.
set "URL=http://localhost:8765/station"
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe") do (
  if exist %%B ( start "" %%B --new-window --app=%URL% & exit /b )
)
start "" %URL%
