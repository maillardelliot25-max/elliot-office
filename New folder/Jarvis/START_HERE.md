# START HERE: Jarvis God Station

Your PC is the **God Station**. Jarvis lives on it, remembers everything, watches your screen,
and you control it from your phone, tablet, Telegram, and Claude. **Everything is free.**

## Easiest: let Claude Cowork do it

Install the Claude desktop app, upload the two skills in [`cowork/`](cowork/COWORK.md), and say
**"Set up Jarvis on this PC."** Cowork installs everything, starts Jarvis and tells you the PIN for your phone.
Later, just say **"Update Jarvis."** Details: [cowork/COWORK.md](cowork/COWORK.md).

## Or set it up yourself (about 30 minutes, once)

| # | Do this | Where |
|---|---|---|
| 1 | Install Python: open Terminal and run `winget install Python.Python.3.12` | PC |
| 2 | Double-click **`install_station.bat`** | `Jarvis` folder |
| 3 | Double-click **`install_extras.bat`**: Ollama (brain), Tailscale (anywhere access), Syncthing (photo/music/file sync), Claude app | `Jarvis` folder |
| 4 | Double-click **`start_station.bat`**. A window shows the **address** and a **PIN** | PC |
| 5 | On your phone: Chrome → the address → PIN → ⋮ **Add to Home screen**. Same on the tablet (new PIN) | Phone, tablet |
| 6 | Open the **PC** tab in the app. The **Setup** card lists what's left, with the fix for each | App |

Then, as you like:
- **Chrome form helper:** `chrome://extensions` → Developer mode → **Load unpacked** → `Jarvis/extension` → click its icon → PIN
- **Claude link:** double-click **`setup_claude_link.bat`**, then restart Claude
- **Telegram:** put `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` in `.env` (README §10)
- **Always on:** double-click **`install_autostart.bat`**

Full guide with every feature, setting and fix: **[README_STATION.md](README_STATION.md)**

## What's in this folder

| | |
|---|---|
| `station/` | **The God Station.** This is what runs (`start_station.bat`) |
| `extension/` | Jarvis Assist for Chrome |
| `*.bat` | One-click install / start / autostart / Send-to / Claude link |
| `station_data/` | Created on first run: memory, screen memory, your details, keys. **Back this folder up.** It's never uploaded anywhere |
| `main_free.py`, `main.py`, `core/`, `integrations/`, `autopilot/` | The **original cloud Jarvis** (paid Claude brain). Kept for reference; the God Station replaces it, and its Telegram channel now lives in the station. Old guide: `docs/START_HERE_CLASSIC.md` |
