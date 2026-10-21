# Jarvis God Station: control your PC from your phone and tablet

Your HP laptop becomes the **God Station**. Your Android phone and tablet become remotes, and Jarvis lives on the PC.
Every device gets the same app and the same features. Tablets get a big-screen layout.
**Everything here is free.** No API keys and no subscriptions.

| On your phone you can… | |
|---|---|
| 🖥 **Screen** | See your PC screen live. Tap = click, hold = right-click, swipe = scroll, **Drag** mode to drag. Type on the PC, plus shortcut keys (Enter, Alt+Tab, Copy/Paste, Win…) |
| ✦ **Jarvis** | Chat or talk 🎙 to Jarvis. It remembers every conversation from every device, and you can search it all. Say *"open youtube"*, *"lock my pc"*, *"volume up"*, *"next song"* and it does it. |
| 🗂 **Files** | Browse every drive on the PC, download any file to your phone, and upload photos and files to the PC |
| 📋 **Clip** | **Shared clipboard**, like Phone Link. Copy on the PC (Ctrl+C) and it shows up on your phone/tablet; tap to copy it there. Paste on the phone and send it to the PC (Ctrl+V). Send files from the PC with right-click → **Send to → Jarvis phone**. |
| ⚙ **PC** | CPU/RAM/battery/disk, lock/sleep/restart/shut down, volume and media, open apps and websites, running apps (close them), PowerShell terminal |

Shut down, restart, sleep, terminal commands and closing apps **always ask before running**.

---

## 1. Install on the PC (one time, ~10 minutes)

1. **Python:** open *Terminal* and run `winget install Python.Python.3.12`
   (or download it from python.org and tick **"Add python.exe to PATH"**).
2. Open this `Jarvis` folder and double-click **`install_station.bat`**.
3. Double-click **`start_station.bat`**. A window opens showing:
   - the address to open on your phone, e.g. `http://192.168.1.20:8765`
   - a **6-digit PIN**
4. If Windows Firewall asks, click **Allow** (Private networks).

## 2. Pair your phone (same Wi-Fi)

1. On the phone, open **Chrome** and go to the address from the PC window.
2. Type the **PIN** and tap **Pair this device**.
3. Chrome menu ⋮ → **Add to Home screen**. Now it's an app icon.

The PIN works once. Paired devices stay paired, even after restarts.

**Tablet:** do the same steps on the tablet. It needs the *new* PIN shown in the PC window (each PIN pairs one device).
Turn the tablet sideways and the screen view goes big, with the controls on the right.

## 3. Use it from anywhere (free, with Tailscale)

Tailscale makes a private, encrypted network between your devices. Nothing is opened to the public internet.

1. Install **Tailscale** on the PC (tailscale.com/download) and on the phone (Play Store). Sign in with the **same account** on both.
2. Restart `start_station.bat`. The window now also shows a **Tailscale** address (`http://100.x.x.x:8765`). Use that on your phone from anywhere: mobile data, school, anywhere.

**Recommended: HTTPS** (needed for the 🎙 mic button and a full "Install app"):
1. In the Tailscale admin page → **DNS** → turn on **MagicDNS** and **HTTPS Certificates**.
2. On the PC, in Terminal: `tailscale serve --bg 8765`
3. On the phone, open the `https://<your-pc-name>.<your-tailnet>.ts.net` address it prints. Chrome ⋮ → **Install app**.

## 4. Copy & paste between PC, phone and tablet

- **PC → phone/tablet:** copy anything on the PC. Open the **Clip** tab and tap the item; it's now on your phone's clipboard.
  The last 500 copies are kept (turn this off with `STATION_CLIPBOARD_HISTORY=false`, and use **clear** to wipe it).
- **Phone/tablet → PC:** in **Clip**, tap **Paste**, then **Send to PC clipboard**. Press Ctrl+V on the PC.
- **Files PC → phone:** right-click files in File Explorer → **Send to → Jarvis phone** (the installer adds this).
  They appear under *Sent from the PC*; tap to download.
- **Files phone → PC:** **Clip → Send files or photos to PC**. They land in `Downloads\Jarvis` on the PC.
- **Share menu:** after installing the app over HTTPS (step 3), *Jarvis* shows up in Android's **Share** menu.
  Share a link, text or photo from any app (YouTube, Chrome, Gallery…) and it goes straight to the PC.

Anything copied on the PC, including passwords, is saved to the history. Clear it, or turn history off if that bothers you.

## 5. Give Jarvis its brain (free, local, offline)

Without this, Jarvis still does instant commands (open, lock, volume, media, type…).
With it, Jarvis can answer questions, remember things you told it, and follow normal sentences.

1. Install **Ollama** from ollama.com (Windows installer). It starts by itself with Windows.
2. In Terminal: `ollama pull llama3.2:3b` (about 2 GB, one-time download).
3. The pill at the top of the app turns green: `brain: llama3.2:3b`.

Your laptop has an Intel i7 with no graphics card, so Jarvis thinks on the CPU. Expect a few seconds per answer.
Want faster? Use `llama3.2:1b`. Want smarter? Try `qwen2.5:7b` if you have 16 GB RAM.
To switch, set `OLLAMA_MODEL=` in `.env` (see below).

## 6. Make it always-on (the God Station)

- Double-click **`install_autostart.bat`**. The station starts every time you log in.
- Settings → System → Power → **When plugged in, put my device to sleep after: Never**.
- Control Panel → Power Options → *Choose what closing the lid does* → **Plugged in: Do nothing**.

---

## Settings (optional, in `Jarvis/.env`)

```
OWNER_NAME=Elliot
STATION_PORT=8765
STATION_ALLOW_SHELL=true      # false = remove the terminal from the phone
OLLAMA_MODEL=llama3.2:3b
STATION_UPLOAD_DIR=C:\Users\Elliot\Downloads\Jarvis
STATION_CLIPBOARD_HISTORY=true  # false = don't keep a history of PC copies
```

## Where things live

| | |
|---|---|
| `station/` | The God Station (server, controls, brain, memory) |
| `station/static/` | The phone app |
| `station_data/memory.db` | Every conversation. Back this file up to keep Jarvis's memory |
| `station_data/devices.json` | Paired devices (only hashes of their keys) |

## Security

- Only paired devices can do anything. The PIN is single-use, and 5 wrong tries generate a new one.
- Lost your phone? Open the app on another paired device → **PC** → **Paired devices** → Remove.
  Or delete `station_data/devices.json` on the PC to unpair everything.
- Use Tailscale for outside access. **Never** port-forward 8765 on your router.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone can't open the address | Same Wi-Fi? Firewall "Allow" clicked? Try the Tailscale address. |
| Wrong PIN | Read the newest PIN in the station window (it changes after each pairing). |
| Screen is black | The PC is locked or asleep. Windows hides the lock screen from apps. Wake/unlock it. |
| Clicks land in the wrong place | Restart the station (it fixes Windows display scaling at startup). |
| "brain offline" | Start Ollama (Start menu) and run `ollama pull llama3.2:3b`. |
| Can't control Task Manager or admin windows | Right-click `start_station.bat` → Run as administrator. |

Developers: tests run with `python -m pytest station/tests -q` (from the `Jarvis` folder).
