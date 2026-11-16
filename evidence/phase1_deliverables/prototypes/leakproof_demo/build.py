"""Assemble the demo page from src/ into dist/.

  dist/index.html     standalone page (host anywhere, or open the file)
  dist/artifact.html  page body only, for publishing as a claude.ai Artifact

Feedback is configured at build time (all optional):
  TALLY_FORM_ID=wXXXXX   Tally form id (popup opens with a hidden field "scene")
  VOICE_URL=https://...  a voice-recording form link (anonymous)
  WHATSAPP=91XXXXXXXXXX  a WhatsApp number for voice notes (shows the sender's number)
"""
import html
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, DIST = ROOT / "src", ROOT / "dist"


def read(name: str) -> str:
    return (SRC / name).read_text(encoding="utf-8")


def build() -> None:
    tally = os.environ.get("TALLY_FORM_ID", "").strip()
    voice = os.environ.get("VOICE_URL", "").strip()
    whatsapp = os.environ.get("WHATSAPP", "").strip()
    page = read("template.html")
    page = page.replace("{{STYLE}}", read("style.css"))
    page = page.replace("{{LOGIC}}", read("logic.js"))
    page = page.replace("{{APP}}", read("app.js"))
    page = page.replace("{{TALLY_FORM_ID}}", html.escape(tally, quote=True))
    page = page.replace("{{VOICE_URL}}", html.escape(voice, quote=True))
    page = page.replace("{{WHATSAPP}}", html.escape(whatsapp, quote=True))
    page = page.replace(
        "{{TALLY_SCRIPT}}",
        '<script async src="https://tally.so/widgets/embed.js"></script>' if tally else "",
    )
    DIST.mkdir(exist_ok=True)
    (DIST / "artifact.html").write_text(page, encoding="utf-8")
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<style>:root{color-scheme:light}html,body{margin:0}</style>\n"
        "</head>\n<body>\n" + page + "\n</body>\n</html>\n"
    )
    (DIST / "index.html").write_text(standalone, encoding="utf-8")
    print("built dist/index.html and dist/artifact.html;",
          "tally:", tally or "(not set)", "| voice:", voice or whatsapp or "(not set)")


if __name__ == "__main__":
    build()
