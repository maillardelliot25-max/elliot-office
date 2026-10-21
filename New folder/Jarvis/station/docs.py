"""
God Station — Sign & fill PDFs
===============================
- Draw your signature once on your phone/tablet; it's saved on the PC
  (station_data/signature.png).
- "Sign" a PDF: Jarvis finds where it says "Signature" / "Sign here" and
  places your signature there (or bottom-right of the last page).
- "Fill" a PDF form: fillable fields are filled from your profile.

The original file is never changed. Results are saved next to it as
"<name>-signed.pdf" / "<name>-filled.pdf". Always check before sending.
"""

import io
import re
from pathlib import Path

from station.assist import fill_from_profile

SIGN_WORDS = re.compile(r"sign(ature|ed)?\s*(here)?|signed by", re.I)
SIGNATURE_WIDTH = 150  # points (~5.3 cm)


class DocError(Exception):
    pass


def _out_path(src: Path, suffix: str) -> Path:
    out = src.with_name(f"{src.stem}-{suffix}.pdf")
    n = 2
    while out.exists():
        out = src.with_name(f"{src.stem}-{suffix} ({n}).pdf")
        n += 1
    return out


def save_signature(png: bytes, path: Path) -> Path:
    """Crop the drawn signature to its ink and save it as a transparent PNG."""
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(png)).convert("RGBA")
    except Exception:
        raise DocError("That doesn't look like an image")
    box = img.getchannel("A").getbbox()
    if not box:
        raise DocError("The signature is empty — draw it first")
    pad = 6
    img = img.crop((max(box[0] - pad, 0), max(box[1] - pad, 0),
                    min(box[2] + pad, img.width), min(box[3] + pad, img.height)))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    return path


def _find_sign_spots(reader) -> list[tuple[int, float, float, float, bool]]:
    """(page, x, y, font_size, has_line) for each 'Signature' label, in reading order."""
    spots = []
    for pno, page in enumerate(reader.pages):
        def visit(text, cm, tm, font, size, pno=pno):
            if text and SIGN_WORDS.search(text):
                x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
                y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
                spots.append((pno, x, y, float(size or 10) * abs(cm[0] or 1), "_" in text))
        try:
            page.extract_text(visitor_text=visit)
        except Exception:
            continue
    return spots


def sign_pdf(src: str, signature: Path) -> dict:
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    src_path = Path(src).expanduser()
    if not src_path.is_file() or src_path.suffix.lower() != ".pdf":
        raise DocError(f"Not a PDF: {src}")
    if not signature.is_file():
        raise DocError("No signature saved yet. Draw it in the app first (PC → Signature).")

    reader = PdfReader(str(src_path))
    if reader.is_encrypted:
        raise DocError("This PDF is password-protected")
    writer = PdfWriter(clone_from=reader)

    sig = ImageReader(str(signature))
    sw, sh = sig.getSize()
    w = SIGNATURE_WIDTH
    h = w * sh / sw

    spots = _find_sign_spots(reader)
    if spots:
        pno, x, y, size, has_line = spots[-1]  # the last signature box is usually the one to sign
        if has_line:   # "Signature: ________"  → on the line, after the word
            x, y = x + size * 5, y - size * 0.3
        else:          # "Signature" under a line → just above the word
            y = y + size * 1.1
        where = f"next to “Signature” on page {pno + 1}"
    else:
        pno = len(reader.pages) - 1
        box = reader.pages[pno].mediabox
        x, y = float(box.right) - w - 50, float(box.bottom) + 60
        where = f"bottom-right of page {pno + 1} (no “Signature” label found)"

    page = writer.pages[pno]
    box = page.mediabox
    x = min(max(x, float(box.left) + 10), float(box.right) - w - 10)
    y = min(max(y, float(box.bottom) + 10), float(box.top) - h - 10)

    stamp = io.BytesIO()
    c = canvas.Canvas(stamp, pagesize=(float(box.width), float(box.height)))
    c.drawImage(sig, x - float(box.left), y - float(box.bottom), w, h, mask="auto")
    c.save()
    stamp.seek(0)
    from pypdf import Transformation
    page.merge_transformed_page(PdfReader(stamp).pages[0],
                                Transformation().translate(float(box.left), float(box.bottom)))

    out = _out_path(src_path, "signed")
    with open(out, "wb") as f:
        writer.write(f)
    return {"ok": True, "path": str(out), "message": f"Signed {where}. Saved as {out.name}"}


def fill_pdf(src: str, profile: dict) -> dict:
    from pypdf import PdfReader, PdfWriter

    src_path = Path(src).expanduser()
    if not src_path.is_file() or src_path.suffix.lower() != ".pdf":
        raise DocError(f"Not a PDF: {src}")
    reader = PdfReader(str(src_path))
    if reader.is_encrypted:
        raise DocError("This PDF is password-protected")
    fields = reader.get_fields() or {}
    text_fields = {name: f for name, f in fields.items() if f.get("/FT") == "/Tx"}
    if not text_fields:
        raise DocError("This PDF has no fillable text boxes")

    described = [{"i": i, "name": name, "label": str(f.get("/TU") or "")}
                 for i, (name, f) in enumerate(text_fields.items())]
    filled, unknown = fill_from_profile(described, profile)
    by_i = {d["i"]: d["name"] for d in described}
    values = {by_i[v["i"]]: v["value"] for v in filled}
    if not values:
        raise DocError("None of the boxes match your saved details. Fill in your profile first (PC → My details).")

    writer = PdfWriter(clone_from=reader)
    for page in writer.pages:
        writer.update_page_form_field_values(page, values, auto_regenerate=False)
    writer.set_need_appearances_writer(True)
    out = _out_path(src_path, "filled")
    with open(out, "wb") as f:
        writer.write(f)
    return {"ok": True, "path": str(out), "filled": len(values),
            "left_for_you": [d["label"] or d["name"] for d in unknown],
            "message": f"Filled {len(values)} of {len(text_fields)} boxes. Saved as {out.name}"}
