"""
Start the God Station:   python -m station
"""

import logging
import socket

import uvicorn

from station import __version__
from station.config import StationConfig
from station.controls import enable_dpi_awareness


def local_addresses() -> list[tuple[str, str]]:
    """(label, ip) for every network this PC is on. 100.x.x.x is Tailscale."""
    out = []
    try:
        import psutil
        for name, addrs in psutil.net_if_addrs().items():
            for a in addrs:
                if a.family == socket.AF_INET and not a.address.startswith(("127.", "169.254.")):
                    label = "Tailscale (anywhere)" if a.address.startswith("100.") else f"Home Wi-Fi ({name})"
                    out.append((label, a.address))
    except Exception:
        pass
    return out


def keep_pc_awake() -> bool:
    """Stop Windows from going to sleep while Jarvis runs (the screen can still turn off).
    A sleeping PC is what makes the phone say "unreachable". Set JARVIS_KEEP_AWAKE=0 to turn off."""
    import os
    import sys
    if sys.platform != "win32" or os.getenv("JARVIS_KEEP_AWAKE", "1") == "0":
        return False
    try:
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        return bool(ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED))
    except Exception:
        return False


def install_bundled_wheels():
    """Packages new versions need ship in ./wheels, so they install with no internet."""
    import importlib.util
    import subprocess
    import sys
    from pathlib import Path
    wheels = Path(__file__).resolve().parent.parent / "wheels"
    if importlib.util.find_spec("webauthn") or not wheels.is_dir():
        return
    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
                    "--no-index", "--find-links", str(wheels), "webauthn"], timeout=180)


def main():
    try:
        install_bundled_wheels()
    except Exception as e:
        print(f"  (couldn't install bundled packages: {e})")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    enable_dpi_awareness()
    awake = keep_pc_awake()
    config = StationConfig.from_env()

    print("=" * 60)
    print(f"  JARVIS GOD STATION v{__version__}  —  owner: {config.owner_name}")
    print("=" * 60)
    print("  Open one of these in Chrome on your phone:")
    lines = [f"{label:<28} http://{ip}:{config.port}" for label, ip in local_addresses()]
    for line in lines:
        print(f"    {line}")
    try:  # for helpers on this PC (e.g. Claude Cowork) that can't see this window
        config.data_dir.mkdir(parents=True, exist_ok=True)
        (config.data_dir / "addresses.txt").write_text("\n".join(lines) + "\n")
    except OSError:
        pass
    print(f"  Brain: Ollama {config.ollama_model} @ {config.ollama_url}")
    print(f"  Terminal from phone: {'ON' if config.allow_shell else 'OFF'}")
    if awake:
        print("  Keeping this PC awake while Jarvis runs (screen may still turn off)")
    print("  No internet? Turn on this PC's Mobile hotspot, join it from the phone,")
    print("  then open http://192.168.137.1:" + str(config.port))
    print("=" * 60, flush=True)

    from station.server import create_app  # prints the pairing PIN
    app = create_app(config)

    def publish_https():   # secure Tailscale address: needed for fingerprint unlock on the phone
        from station import tailnet
        url = tailnet.serve(config.port)
        app.state.secure_url["url"] = url
        if url:
            print(f"  Secure address (fingerprint unlock, works anywhere): {url}", flush=True)
            try:
                with open(config.data_dir / "addresses.txt", "a") as f:
                    f.write(f"{'Secure (Tailscale https)':<28} {url}\n")
            except OSError:
                pass
    import threading
    threading.Thread(target=publish_https, daemon=True).start()

    uvicorn.run(app, host=config.host, port=config.port, log_level="warning")


if __name__ == "__main__":
    main()
