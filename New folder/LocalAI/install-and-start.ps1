# One click: installs only what's missing, then starts Friday (and Jarvis's reporter) and opens it.
# Run by "Install and start Friday.bat". Safe to run again any time: it skips what's already there.
$ErrorActionPreference = "Continue"
$Here = $PSScriptRoot
$App = Join-Path $Here "app"
$Shared = Join-Path (Split-Path $Here -Parent) "Shared"
$Jarvis = Join-Path (Split-Path $Here -Parent) "Jarvis"

function Say($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   $text" -ForegroundColor Yellow }
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") +
        ";$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts" +
        ";$env:LOCALAPPDATA\Programs\Ollama"
}
function Port-Open($port) {
    try { $c = New-Object Net.Sockets.TcpClient; $r = $c.BeginConnect("127.0.0.1", $port, $null, $null)
          $ok = $r.AsyncWaitHandle.WaitOne(400) -and $c.Connected; $c.Close(); return $ok } catch { return $false }
}
# A working Python 3 (Windows has a fake "python" that only opens the Store, so test it really runs)
function Find-Python {
    foreach ($cand in @(@("py", "-3"), @("python"), @("$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"))) {
        $exe = $cand[0]; $extra = @($cand | Select-Object -Skip 1)
        try {
            $v = & $exe @extra -c "import sys; print(sys.version_info[0])" 2>$null
            if ($LASTEXITCODE -eq 0 -and "$v".Trim() -eq "3") { return , $cand }
        } catch {}
    }
    return $null
}
function Winget-Install($id, $name, $scopeUser) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Warn "Windows' installer (winget) is missing. Open the Microsoft Store, update 'App Installer', then run this again."
        Read-Host "Press Enter to close"; exit 1
    }
    Write-Host "   Installing $name (a few minutes)..."
    $wargs = @("install", "--id", $id, "-e", "--silent", "--accept-source-agreements", "--accept-package-agreements")
    if ($scopeUser) { $wargs += @("--scope", "user") }
    winget @wargs | Out-Host
    Refresh-Path
}

Write-Host "Setting up Friday. This window does everything; you can watch or walk away." -ForegroundColor White

# 1. Python
Say "Python"
Refresh-Path
$Py = Find-Python
if (-not $Py) { Winget-Install "Python.Python.3.12" "Python 3.12" $true; $Py = Find-Python }
if (-not $Py) { Warn "Python didn't install. Restart the PC and run this again."; Read-Host "Press Enter to close"; exit 1 }
$PyExe = $Py[0]; $PyArgs = @($Py | Select-Object -Skip 1)
Ok ("Ready: " + (& $PyExe @PyArgs --version))

Say "Friday's Python packages"
& $PyExe @PyArgs -m pip install --quiet --disable-pip-version-check --upgrade anthropic openai pypdf pillow pynput mss psutil 2>&1 |
    Where-Object { $_ -match "error" } | Out-Host
Ok "Installed"

# 2. Ollama (the free offline brain) and models that fit this PC
Say "Offline brain (Ollama)"
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { Winget-Install "Ollama.Ollama" "Ollama" $false }
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    if (-not (Port-Open 11434)) { Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden; Start-Sleep 3 }
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    if ($ramGB -lt 12) { $models = @("qwen3:4b", "qwen3-vl:4b") }
    elseif ($ramGB -lt 24) { $models = @("qwen3:8b", "qwen3-vl:8b") }
    else { $models = @("qwen3-coder:30b", "qwen3-vl:8b") }
    $have = (ollama list 2>$null) -join "`n"
    $missing = @($models | Where-Object { $have -notmatch [regex]::Escape($_) })
    if ($missing.Count) {
        $pulls = ($missing | ForEach-Object { "ollama pull $_" }) -join "; "
        Start-Process powershell -WindowStyle Minimized -ArgumentList "-NoProfile", "-Command",
            "`$host.UI.RawUI.WindowTitle = 'Friday: downloading offline brains'; $pulls; Write-Host 'Done. You can close this window.'; Start-Sleep 30"
        Ok "This PC has $ramGB GB of memory: downloading $($missing -join ' and ') in a minimized window (several GB). Friday works meanwhile."
    } else { Ok "Brains ready: $($models -join ', ')" }
} else { Warn "Ollama didn't install; Friday still works with API keys. Run this again later to retry." }

# 3. Start Friday, its screen helper, and Jarvis's reporter (dashboard data + offline sync)
Say "Starting Friday"
if (Port-Open 8765) { Ok "Friday is already running" }
else {
    Start-Process $PyExe -ArgumentList ($PyArgs + @("server.py", "--no-browser")) -WorkingDirectory $App -WindowStyle Minimized
    $pyw = switch -regex ($PyExe) { "^py$" { "pyw" } "^python$" { "pythonw" } default { $PyExe -replace "python\.exe$", "pythonw.exe" } }
    try { Start-Process $pyw -ArgumentList ($PyArgs + @("friday_lens.py")) -WorkingDirectory $App } catch {}
    foreach ($i in 1..60) { if (Port-Open 8765) { break }; Start-Sleep 1 }
    if (Port-Open 8765) { Ok "Friday is running (minimized window 'python'; close it to stop Friday)" }
    else { Warn "Friday didn't start. Open the minimized Python window to see why, and send a screenshot to Claude." }
}
if (Test-Path (Join-Path $Shared "jarvis_reporter.py")) {
    $running = Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "jarvis_reporter" }
    if (-not $running) {
        $rArgs = @("jarvis_reporter.py")
        if ((Test-Path (Join-Path $Jarvis "station")) -and -not (Port-Open 8780)) { $rArgs += "--run-jarvis" }
        Start-Process $PyExe -ArgumentList ($PyArgs + $rArgs) -WorkingDirectory $Shared -WindowStyle Minimized
        Ok ("Reporter started" + $(if ($rArgs -contains "--run-jarvis") { " (with Jarvis)" } else { "" }))
    } else { Ok "Reporter already running" }
}

# 4. A desktop shortcut for next time, then open Friday
Say "Desktop shortcut"
try {
    $lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "Friday.lnk"
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $s.TargetPath = Join-Path $Here "Install and start Friday.bat"
    $s.WorkingDirectory = $Here
    $s.Description = "Start Friday (installs anything missing first)"
    $s.Save()
    Ok "Added 'Friday' to your desktop. Double-click it next time."
} catch { Warn "Couldn't add a desktop shortcut (not important)." }

if (Port-Open 8765) {
    Start-Process "http://localhost:8765"
    Say "All done. Friday is open in your browser."
    Write-Host "   Home Station dashboard (for the tablet): http://localhost:8765/station"
    Write-Host "   For the rest of the setup, paste the prompt from CLAUDE_IN_CHROME.md into Claude in Chrome."
}
Write-Host ""
Read-Host "Press Enter to close this window (Friday keeps running)"
