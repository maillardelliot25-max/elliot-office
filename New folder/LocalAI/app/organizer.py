"""
Sort ("sectionize") the files in a folder into sub-folders.

Three ways to sort:
  - "ai":   the AI looks at each photo and reads each document, then picks a folder
            name (Receipts, Screenshots, Family Photos, Invoices, …)
  - "type": Images, Videos, Documents, Spreadsheets, Audio, …
  - "date": by the month each file was last modified

Nothing moves until the user approves the plan, and every applied plan can be undone.
"""

import base64
import io
import json
import re
import shutil
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

TYPES = {
    "Images": "jpg jpeg png gif webp heic heif bmp tif tiff raw cr2 nef arw dng svg",
    "Videos": "mp4 mov avi mkv webm m4v wmv 3gp",
    "Audio": "mp3 wav m4a aac flac ogg wma",
    "Documents": "pdf doc docx odt rtf txt md pages",
    "Spreadsheets": "xls xlsx csv ods numbers",
    "Presentations": "ppt pptx key odp",
    "Archives": "zip rar 7z tar gz bz2 xz",
    "Code": "py js ts jsx tsx html css json java c cpp cs go rs rb php sh ps1 bat sql ipynb",
    "Installers": "exe msi dmg pkg deb rpm apk appimage",
    "Fonts": "ttf otf woff woff2",
}
EXT_TYPE = {ext: kind for kind, exts in TYPES.items() for ext in exts.split()}
READABLE = set(TYPES["Documents"].split() + TYPES["Spreadsheets"].split() + TYPES["Presentations"].split()
               + TYPES["Code"].split())
VISION = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}
MAX_FILES = 500


def kind_of(path):
    return EXT_TYPE.get(path.suffix.lower().lstrip("."), "Other")


def clean_name(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(name or "")).strip(" .")
    return name[:40] or "Unsorted"


def check_folder(folder):
    p = Path(folder).expanduser().resolve()
    if not p.is_dir():
        raise ValueError(f"Folder not found: {p}")
    if p.parent == p or p == Path.home().resolve().parent:
        raise ValueError("Pick a specific folder (like Downloads or Pictures), not a whole drive.")
    if any(part.lower() in {"windows", "program files", "program files (x86)", "system32", "system", "library",
                            "applications", "bin", "etc", "usr", "var"} for part in p.parts[1:2]):
        raise ValueError("That looks like a system folder. Pick one of your own folders.")
    return p


def list_files(folder):
    files = [f for f in sorted(folder.iterdir()) if f.is_file() and not f.name.startswith((".", "~$"))
             and f.name.lower() not in {"desktop.ini", "thumbs.db"}]
    return files[:MAX_FILES]


def image_b64(path):
    """Shrink photos before sending them to a model when Pillow is available (much faster, cheaper)."""
    try:
        from PIL import Image
        with Image.open(path) as im:
            im.thumbnail((768, 768))
            buf = io.BytesIO()
            im.convert("RGB").save(buf, "JPEG", quality=80)
            return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        if path.stat().st_size <= 4_000_000:
            return base64.b64encode(path.read_bytes()).decode()
    except Exception:
        pass
    return None


def ask_ai(path, known, fixed, model, complete, extract_text):
    ext = path.suffix.lower().lstrip(".")
    images, about = [], ""
    if ext in VISION:
        b64 = image_b64(path)
        if b64:
            images, about = [b64], "The image is attached."
    elif ext in READABLE and path.stat().st_size < 20_000_000:
        try:
            text = extract_text(path.name, path.read_bytes())[:2500]
            about = f"Its contents begin:\n<<<\n{text}\n>>>"
        except Exception:
            pass
    if not about:   # videos, archives, unreadable files: sort by type, no AI needed
        return kind_of(path), ""
    rule = (f"Use ONLY one of these folders: {', '.join(fixed)}." if fixed else
            f"Folders used so far: {', '.join(sorted(known)) or 'none yet'}. Reuse one when it fits, otherwise invent a new one.")
    prompt = (f"You are sorting someone's files into folders.\nFile name: {path.name}\n{about}\n\n{rule}\n"
              "Pick ONE folder name (1-3 words, Title Case, like Receipts, Screenshots, Family Photos, Invoices, "
              "Travel, Work Documents, Memes, School).\n"
              'Reply with JSON only: {"folder": "...", "description": "what this file is, in under 12 words"}')
    reply = complete(model, prompt, images)
    m = re.search(r"\{.*\}", reply or "", re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except ValueError:
        data = {}
    folder = clean_name(data.get("folder"))
    if fixed and folder not in fixed:
        folder = next((f for f in fixed if f.lower() == folder.lower()), fixed[0])
    return folder, str(data.get("description", ""))[:120]


def scan(folder, method, categories, model, complete, extract_text, emit, stop, parallel=1):
    folder = check_folder(folder)
    files = list_files(folder)
    fixed = [clean_name(c) for c in categories if c.strip()]
    plan = {"id": uuid.uuid4().hex, "folder": str(folder), "method": method, "created": time.time(), "items": []}
    emit({"type": "start", "total": len(files), "folder": str(folder)})

    def add(path, category, note=""):
        item = {"file": path.name, "category": category, "note": note}
        plan["items"].append(item)
        emit({"type": "item", **item, "done": len(plan["items"]), "total": len(files)})

    if method in ("type", "date"):
        for f in files:
            add(f, kind_of(f) if method == "type" else datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m %B"))
        return plan

    known = set(fixed)
    with ThreadPoolExecutor(max_workers=parallel) as pool:
        pending = {}
        for f in files:
            if stop.is_set():
                break
            pending[pool.submit(ask_ai, f, set(known), fixed, model, complete, extract_text)] = f
            if len(pending) >= parallel:
                done = next(as_completed(pending))
                f_done = pending.pop(done)
                category, note = _result(done, f_done)
                known.add(category)
                add(f_done, category, note)
        for done in as_completed(pending):
            category, note = _result(done, pending[done])
            add(pending[done], category, note)
    return plan


def _result(future, path):
    try:
        return future.result()
    except Exception as e:
        return kind_of(path), f"(AI unavailable: {str(e)[:80]})"


def apply(plan, renames, exclude):
    folder = Path(plan["folder"])
    moves = []
    for item in plan["items"]:
        if item["file"] in exclude:
            continue
        src = folder / item["file"]
        if not src.is_file():
            continue
        target_dir = folder / clean_name(renames.get(item["category"], item["category"]))
        target_dir.mkdir(exist_ok=True)
        dst, n = target_dir / src.name, 1
        while dst.exists():
            dst = target_dir / f"{src.stem} ({n}){src.suffix}"
            n += 1
        shutil.move(str(src), str(dst))
        moves.append([str(src), str(dst)])
    plan["moves"] = moves
    plan["applied"] = time.time()
    return len(moves)


def undo(plan):
    restored = 0
    for src, dst in reversed(plan.get("moves", [])):
        if Path(dst).is_file() and not Path(src).exists():
            shutil.move(dst, src)
            restored += 1
    for d in {str(Path(dst).parent) for _, dst in plan.get("moves", [])}:
        try:
            Path(d).rmdir()   # only removes folders we emptied
        except OSError:
            pass
    plan["moves"] = []
    return restored
