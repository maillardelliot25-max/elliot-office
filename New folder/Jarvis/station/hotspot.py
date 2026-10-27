"""
Keeps this PC's Mobile hotspot switched on, always.

The phone and tablet join the hotspot (the Friday phone app does it automatically), so they reach
Jarvis at http://192.168.137.1:8780 and Friday at :8765 with no router and no internet. When the PC
has internet it's shared with them too. Windows normally switches the hotspot off after 5 minutes with
nobody connected; that timer is disabled here.
"""

import json
import logging
import os
import subprocess
import threading
import time

logger = logging.getLogger("jarvis.station.hotspot")
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
ADDRESS = "192.168.137.1"

PS = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if (-not $profile) {   # no internet right now: share whichever network the PC is on, so the hotspot still runs
  $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles() |
    Where-Object { $_.IsWlanConnectionProfile -or $_.IsWwanConnectionProfile -or $_.NetworkAdapter } | Select-Object -First 1
}
if (-not $profile) { @{ on = $false; error = 'No network adapter to share' } | ConvertTo-Json -Compress; exit }
$m = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
try { [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::DisableNoConnectionsTimeout() } catch {}
if ($m.TetheringOperationalState -ne 'On') {
  $r = Await ($m.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
}
$c = $m.GetCurrentAccessPointConfiguration()
@{ on = ($m.TetheringOperationalState -eq 'On'); ssid = $c.Ssid; passphrase = $c.Passphrase;
   clients = $m.ClientCount } | ConvertTo-Json -Compress
"""


class HotspotKeeper:
    def __init__(self, port: int, interval: int = 60):
        self.port = port
        self.interval = interval
        self.state: dict = {"on": False}
        self._stop = threading.Event()

    def check(self) -> dict:
        if os.name != "nt":
            return {"on": False, "error": "Windows only"}
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", PS], capture_output=True,
                               text=True, timeout=60, creationflags=NO_WINDOW)
            out = (r.stdout or "").strip().splitlines()
            state = json.loads(out[-1]) if out else {"on": False, "error": (r.stderr or "")[:200]}
        except Exception as e:
            state = {"on": False, "error": str(e)[:200]}
        state.update(address=ADDRESS, jarvis=f"http://{ADDRESS}:{self.port}", friday=f"http://{ADDRESS}:8765")
        if state.get("on") != self.state.get("on"):
            logger.info(f"[HOTSPOT] {'on' if state.get('on') else 'off'} {state.get('ssid', '')} {state.get('error', '')}")
        self.state = state
        return state

    def run(self):
        while not self._stop.is_set():
            self.check()
            self._stop.wait(self.interval)

    def start(self):
        threading.Thread(target=self.run, daemon=True, name="hotspot-keeper").start()
