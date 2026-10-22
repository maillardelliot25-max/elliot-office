# Jarvis God Station: control your PC from your phone and tablet

> **Jarvis + Friday:** Friday is the everywhere AI (Chrome, Android, on the go) on port 8765. Jarvis is the home base (this PC, files, screen memory, management and data) on port **8780**. They run side by side; see §13.
>
> New here? **[START_HERE.md](START_HERE.md)** is the 6-step version. In the app, **PC → Setup** shows what's left.

Your HP laptop becomes the **God Station**. Your Android phone and tablet become remotes, and Jarvis lives on the PC.
Every device gets the same app and the same features. Tablets get a big-screen layout.
**Everything here is free.** No API keys and no subscriptions.

| On your phone you can… | |
|---|---|
| 🖥 **Screen** | See your PC screen live. Tap = click, hold = right-click, swipe = scroll, **Drag** mode to drag. Type on the PC, plus shortcut keys (Enter, Alt+Tab, Copy/Paste, Win…) |
| ✦ **Jarvis** | Chat or talk 🎙 to Jarvis. It remembers every conversation from every device, and you can search it all. Say *"open youtube"*, *"lock my pc"*, *"volume up"*, *"next song"* and it does it. |
| 🗂 **Files** | Browse every drive on the PC, download any file to your phone, and upload photos and files to the PC |
| 📋 **Clip** | **Shared clipboard**, like Phone Link. Copy on the PC (Ctrl+C) and it shows up on your phone/tablet; tap to copy it there. Paste on the phone and send it to the PC (Ctrl+V). Send files from the PC with right-click → **Send to → Jarvis phone**. |
| 🕘 **Recall** | **Screen memory.** Jarvis remembers what was on your screen, in 8-hour segments stored on the PC. Search it ("invoice", "flight"), scroll the timeline, and see how much storage each segment uses. |
| ⚙ **PC** | **Switches** to turn each feature on/off, photo/music/file sync folders, CPU/RAM/battery/disk, power, volume and media, open apps, running apps, terminal, **My details** (for forms) and your **signature** |

Plus:
- **Jarvis Assist** for Chrome: start filling any web form and Jarvis highlights it and says *"Sir, I've got this."* One tap fills it from your details.
- **Sign and fill PDFs:** in **Files**, tap ✍ next to a PDF to sign it, or ✎ to fill its form.
- **Telegram:** talk to Jarvis from Telegram, anywhere.
- **Claude link:** Claude (the desktop app) can use Jarvis's memory, screen history, files and your details, so the two AIs work together.

Shut down, restart, sleep, terminal commands and closing apps **always ask before running**.

---

## 1. Install on the PC (one time, ~10 minutes)

1. **Python:** open *Terminal* and run `winget install Python.Python.3.12`
   (or download it from python.org and tick **"Add python.exe to PATH"**).
2. Open this `Jarvis` folder and double-click **`install_station.bat`**.
   Then double-click **`install_extras.bat`** to add the free extras (Ollama brain, Tailscale, Syncthing, Claude app). It asks before each one.
3. Double-click **`start_station.bat`**. A window opens showing:
   - the address to open on your phone, e.g. `http://192.168.1.20:8780`
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
2. Restart `start_station.bat`. The window now also shows a **Tailscale** address (`http://100.x.x.x:8780`). Use that on your phone from anywhere: mobile data, school, anywhere.

**Recommended: HTTPS** (needed for the 🎙 mic button and a full "Install app"):
1. In the Tailscale admin page → **DNS** → turn on **MagicDNS** and **HTTPS Certificates**.
2. On the PC, in Terminal: `tailscale serve --bg 8780`
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

## 6. Switches: turn anything on or off

App → **PC** → **Switches**. Changes apply instantly and are saved on the PC.

| Switch | What it does |
|---|---|
| Clipboard sync | Copies on the PC show up on your phone/tablet (Clip tab) |
| Screen memory | Recall: Jarvis remembers your screen |
| Form helper | The Chrome helper offers to fill forms |
| Telegram | Jarvis answers you on Telegram |
| Notifications | Jarvis pings your phone/tablet (and Telegram) when it finishes a job. Off = silence everywhere |
| Notifications on this device | Turn on push notifications for *this* phone/tablet (needs the https:// Tailscale address) |
| Auto-copy on this device | While the app is open, new copies from other devices go straight to *this* device's clipboard |
| Photo / music / file folders | One switch per Syncthing folder (below) |

### Photos, music and files that sync on their own (Syncthing)

A web app can't run in the background on Android, so automatic photo/music/file sync uses **Syncthing**, a free, open-source app.
1. Install Syncthing on the PC (syncthing.net, or `winget install Syncthing.Syncthing`) and **Syncthing-Fork** on the phone and tablet (Play Store / F-Droid).
2. Link the devices (scan the QR code) and share the folders you want: Camera (DCIM), Pictures, Music, Documents…
3. In Syncthing on the PC: **Actions → Settings → API Key** → copy. In the Jarvis app: **PC → Photos, music & files sync**, paste it, then **Connect**.
4. Every shared folder now has its own on/off switch in the app.

**What Android allows:** since Android 10, no app can read your clipboard in the background, not even Phone Link.
So **phone → everywhere** takes one tap: *Share → Jarvis*, or *Clip → Paste → Send*.
**PC → phone/tablet** is automatic.

## 7. Screen memory (Recall)

Jarvis looks at the screen every 5 seconds and saves a picture **only when something changed**. It also saves the window title and the text on screen (free Windows OCR), so you can search it.

- **8-hour segments:** 00:00–08:00, 08:00–16:00, 16:00–24:00. The Recall tab shows each segment's size.
- **Storage:** about 50–150 MB per busy segment (a few hundred MB a day). The defaults keep the **last 9 segments (3 days)** and **never more than 10 GB**; the oldest segment is deleted first.
  Change these in `station_data/settings.json` (`recall_keep_segments`, `recall_max_gb`, `recall_every_s`).
- **Private:** everything stays on your PC. Nothing is saved while the PC is locked, or when the window title contains
  *password, Bitwarden, 1Password, LastPass, KeePass, InPrivate, Incognito* (edit `recall_exclude` to add your bank, etc.).
- Delete a segment: long-press it in the Recall tab. Turn it all off: **PC → Switches → Screen memory**.
- Jarvis uses it in chat ("what was the price of that flight I looked at?"), and so can Claude.

## 8. Jarvis Assist: the Chrome form helper

1. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
2. **Load unpacked** → choose the `Jarvis/extension` folder.
3. Click the puzzle icon → pin **Jarvis Assist** → click it → enter the PIN from the God Station window.
4. Fill in **App → PC → My details** (name, email, phone, address…).

Start typing in any form. Jarvis highlights it in blue, and a **Windows notification** pops up:
*"Sir, I've got this. I see a form with 8 boxes. Shall I fill it in?"* with **Fill it** / **Never on this site**.
Closing the notification means "not now".
**Fill it** fills what it knows (green) and leaves the rest for you (yellow), then a second notification says how it went.
Your phone/tablet also gets *"Done, sir — I filled 6 fields on …"* if notifications are on there.
(No notification? Windows Settings → System → Notifications → make sure **Google Chrome** is allowed.
If notifications are blocked, Jarvis shows the same message as a bubble inside the page instead.)
- It **never presses Submit**. You always check first.
- It never fills passwords, logins, card numbers, CVV or ID numbers, and it stays quiet on sign-in pages.
- **Never on this site** silences it for that website. The popup has an on/off switch too.
- Unusual questions ("Why do you want this job?") go to the local brain when it's running. It only answers from your details and memory, and leaves the box empty if unsure.

### Notifications on your phone and tablet

1. Open the app on the phone with the **https://** Tailscale address (section 3). Push notifications need HTTPS.
2. **PC → Switches → Notifications on this device** → allow. A test notification arrives straight away.
3. Jarvis now notifies you when it fills a form, signs or fills a PDF, or when Claude asks it to (Claude's `notify_me` tool).
   They arrive even when the app is closed. Telegram gets the same messages if it's set up.

## 9. Sign and fill PDFs

- **PC → Signature:** draw your signature with your finger, then **Save signature** (stored on the PC).
- **Files:** next to any PDF, tap **✍ Sign**. Jarvis finds "Signature / Sign here" and puts your signature there
  (or bottom-right of the last page). It saves `name-signed.pdf` next to the original, which is never changed.
- **✎ Fill** fills a fillable PDF form from *My details* and saves `name-filled.pdf`.
- Always open the result and check it before sending.

## 10. Telegram

The same Jarvis (brain, memory and PC control) in Telegram, from anywhere, with no Tailscale needed.
1. Telegram → **@BotFather** → `/newbot` → copy the token into `Jarvis/.env`: `TELEGRAM_BOT_TOKEN=...`
2. Restart the station and send your bot any message. The station window prints your chat id.
   Add `TELEGRAM_CHAT_ID=...` to `.env` and restart. Jarvis says *"Jarvis online, sir."*

Talk normally, or use `/screen` (screenshot), `/clip` (PC clipboard), `/recall <words>` (search screen memory) and `/status`.
Send a photo or file and it's saved on the PC. Shut down, restart and terminal commands come with a **▶ Run** button.
Only **your** chat id is obeyed; anyone else is ignored.

## 11. The Claude link: Jarvis + Claude working together

Jarvis is the local, always-on part: memory, eyes on your screen, files, details. **Claude** is the strong brain.
The link lets Claude use Jarvis's tools. It's free beyond your Claude account.
1. Install the **Claude desktop app** (claude.ai/download) and sign in.
2. With the station running, double-click **`setup_claude_link.bat`**, then fully quit Claude (tray icon → Quit) and reopen it.
3. Ask Claude things like: *"Search my screen history for the invoice I saw this morning and fill in this PDF with my details,"*
   *"What did I tell Jarvis about my tablet?"* or *"Look at my screen and help me with this form."*

Claude's tools: search memory, remember, search/view screen history, look at the screen now, clipboard, list folders, read text files,
my details, sign PDF, fill PDF form, **notify me** (pings your phone), open on PC.
**Claude in Chrome** (Claude's browser extension, on paid Claude plans) can then do the clicking and typing on websites,
with Jarvis supplying the details and memory.

## 12. Make it always-on (the God Station)

- Double-click **`install_autostart.bat`**. The station starts every time you log in.
- Settings → System → Power → **When plugged in, put my device to sleep after: Never**.
- Control Panel → Power Options → *Choose what closing the lid does* → **Plugged in: Do nothing**.

---

## Settings (optional, in `Jarvis/.env`)

```
OWNER_NAME=Elliot
STATION_PORT=8780
STATION_ALLOW_SHELL=true      # false = remove the terminal from the phone
OLLAMA_MODEL=llama3.2:3b
STATION_UPLOAD_DIR=C:\Users\Elliot\Downloads\Jarvis
STATION_CLIPBOARD_HISTORY=true  # false = don't keep a history of PC copies
TELEGRAM_BOT_TOKEN=             # from @BotFather (see section 10)
TELEGRAM_CHAT_ID=
```

Everything else (switches, screen memory limits) is in `station_data/settings.json`, changed from the app.

## Where things live

| | |
|---|---|
| `station/` | The God Station (server, controls, brain, memory) |
| `station/static/` | The phone app |
| `station_data/memory.db` | Every conversation. Back this file up to keep Jarvis's memory |
| `station_data/devices.json` | Paired devices (only hashes of their keys) |
| `station_data/recall/` | Screen memory, one folder per 8-hour segment |
| `station_data/profile.json`, `signature.png` | Your details and signature, used for forms and PDFs |
| `station_data/vapid_private.pem`, `push.json` | The PC's notification key and which devices get notifications |
| `station_data/claude.token` | The key Claude's Jarvis tools use. Delete it to cut Claude off; it's recreated on restart |
| `extension/` | Jarvis Assist for Chrome |

## Security

- Only paired devices can do anything. The PIN is single-use, and 5 wrong tries generate a new one.
- Lost your phone? Open the app on another paired device → **PC** → **Paired devices** → Remove.
  Or delete `station_data/devices.json` on the PC to unpair everything.
- Use Tailscale for outside access. **Never** port-forward 8780 on your router.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone can't open the address | Same Wi-Fi? Firewall "Allow" clicked? Try the Tailscale address. |
| Wrong PIN | Read the newest PIN in the station window (it changes after each pairing). |
| Screen is black | The PC is locked or asleep. Windows hides the lock screen from apps. Wake/unlock it. |
| Clicks land in the wrong place | Restart the station (it fixes Windows display scaling at startup). |
| "brain offline" | Start Ollama (Start menu) and run `ollama pull llama3.2:3b`. |
| Can't control Task Manager or admin windows | Right-click `start_station.bat` → Run as administrator. |
| Recall has no searchable text | The optional OCR didn't install. In the Jarvis folder run `.venv\Scripts\python -m pip install winocr`. |
| Form helper doesn't appear | Click the Jarvis Assist icon: paired? switch on? Did you choose "Never on this site"? (Clear it via the site's local storage, or use another site.) |
| Telegram silent | Check `TELEGRAM_CHAT_ID` is set and see the Telegram line under **PC → Switches**. |

Developers: tests run with `python -m pytest station/tests -q` (from the `Jarvis` folder).

## 13. Friday + Jarvis: two brains side by side

| | Friday | Jarvis |
|---|---|---|
| Role | The everywhere AI: Chrome, Android, on the go | The home base: this PC, files, screen memory, management and data |
| Address | `http://localhost:8765` | `http://localhost:8780` (`STATION_PORT`) |

**Link them:** in Friday → ⚙ Settings, copy the **Chrome pairing code**. In the Jarvis app go to **PC → Friday**, paste it, and tap **Link**.

- **Shared memory** (on): when Jarvis answers, he uses what Friday knows about you, and notes saved to Jarvis also go to Friday's memory.
  Friday never stores passwords, keys or card numbers.
- **Think with Friday's brains** (off by default): Jarvis answers using the models and API keys you set up in Friday (pick one in the list).
  If Friday is closed, Jarvis falls back to Ollama on his own.
- **Ask Friday:** in Jarvis's chat (or on Telegram), say *"ask Friday what's on my phone's to-do list"*.
- **Friday can call Jarvis:** Jarvis keeps a key for Friday in `station_data/friday.token`. Friday (on this PC) sends it as
  `Authorization: Bearer <token>` to Jarvis's API, e.g. `GET /api/recall/search?q=…`, `GET /api/memory/search?q=…`,
  `POST /api/memory/note`, `GET /api/files?path=…`, `GET /api/system`.
- **No doubling up:** keep screen memory in Jarvis (Recall) and leave Friday's screen memory off. Use one Chrome form helper,
  not both: turn the other off (Jarvis: **PC → Switches → Form helper**), or you'll get two pop-ups on every form.

## 14. "Hey Jarvis": voice, like Siri

**On the PC (hands-free):** app → **PC → Switches → "Hey Jarvis" voice** → on. The first time, Jarvis downloads a free
offline speech model (~40 MB). Then just talk:

- *"Hey Jarvis, open YouTube"* → he does it and says so.
- *"Jarvis"* … *"Yes, sir?"* … *"what did I work on this morning?"*
- *"Hey Jarvis, shut down the PC"* → *"Shall I go ahead? Say yes or no."* Risky things always wait for your yes.

Everything runs on the PC, offline. Audio is never saved, only what you ask (like a chat message).
He answers with a built-in Windows voice (a British male voice if Windows has one: Settings → Time & language → Speech → add voices).
The switch shows what he's doing ("listening", "thinking…") and the last thing he heard.

**On your phone/tablet:** tap 🎙 in the Jarvis tab, ask, and he answers out loud too
(switch: **PC → Switches → Speak answers on this device**).
For an always-there assistant on the phone (long-press the power button), use Friday's Android app. That's Friday's job.

If the switch says *voice isn't installed*, run `install_station.bat` again (it installs `vosk`, `sounddevice` and `pyttsx3`).

