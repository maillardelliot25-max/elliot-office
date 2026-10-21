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


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    enable_dpi_awareness()
    config = StationConfig.from_env()

    print("=" * 60)
    print(f"  JARVIS GOD STATION v{__version__}  —  owner: {config.owner_name}")
    print("=" * 60)
    print("  Open one of these in Chrome on your phone:")
    for label, ip in local_addresses():
        print(f"    {label:<28} http://{ip}:{config.port}")
    print(f"  Brain: Ollama {config.ollama_model} @ {config.ollama_url}")
    print(f"  Terminal from phone: {'ON' if config.allow_shell else 'OFF'}")
    print("=" * 60, flush=True)

    from station.server import create_app  # prints the pairing PIN
    app = create_app(config)
    uvicorn.run(app, host=config.host, port=config.port, log_level="warning")


if __name__ == "__main__":
    main()
