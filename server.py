import asyncio
import base64
import io
import json
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel


ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
VAR_DIR = ROOT / "var"
DB_PATH = VAR_DIR / "magic_lab.sqlite3"
SHARES_DIR = VAR_DIR / "shares"
VAR_DIR.mkdir(exist_ok=True)
SHARES_DIR.mkdir(exist_ok=True)
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
HTTP_REFERER = "http://localhost:8000"
PHOTO_MAX_SIDE = 1024  # AMENDMENT-7: downscale uploaded photos
subscribers: dict[str, list[asyncio.Queue]] = {}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_file(ROOT / ".env")
load_env_file(ROOT / ".env.example")

app = FastAPI(title="Magic Lab")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def nanoid(size: int = 8, prefix: str = "") -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return prefix + "".join(secrets.choice(alphabet) for _ in range(size))


def now_ms() -> int:
    return int(time.time() * 1000)


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                data_url TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                mime TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS shares (
                id TEXT PRIMARY KEY,
                image_path TEXT NOT NULL,
                meta_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                share_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_reactions_share_id ON reactions(share_id)")

        # AMENDMENT-1 migration: shares.image_data_url → shares.image_path
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(shares)").fetchall()}
        if "image_data_url" in cols and "image_path" not in cols:
            conn.execute("DROP TABLE shares")
            conn.execute(
                """
                CREATE TABLE shares (
                    id TEXT PRIMARY KEY,
                    image_path TEXT NOT NULL,
                    meta_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
                """
            )


@app.on_event("startup")
async def startup() -> None:
    init_db()
    print("Magic Lab running at http://localhost:8000.\nExpose with: ngrok http 8000")


class SuggestRequest(BaseModel):
    mode: str
    photoId: str | None = None
    backstory: str | None = ""
    textInput: str | None = ""
    templates: list[dict[str, Any]]


class ShareRequest(BaseModel):
    imageBase64: str
    meta: dict[str, Any] = {}


class ReactRequest(BaseModel):
    shareId: str
    emoji: str


SYSTEM_PROMPT = """
You are a meme curator with razor-sharp taste. You write captions that
are SPECIFIC to what's in the photo (or in the user's situation),
funny, and unexpected. You hate generic "When you..." captions unless
they nail the punchline.

You have a library of meme templates. Given a photo (and optional
backstory) — OR — a user's situation, pick the 6 TEMPLATES that best
fit, and write captions for each.

AVAILABLE TEMPLATES (id, mode, description, slot definitions):
{templates_json}

RULES:
1. Be SPECIFIC to the photo/situation. Reference actual visual details
   or words from the user's input.
2. Mix tones: relatable, absurd, unexpected, niche. Don't pick all
   templates of the same vibe.
3. Caption length must fit slot.maxLength. Honor slot constraints.
4. For each template you pick, fill ALL its slots — don't leave any blank.
5. Confidence = how WELL the template fits this content, 0.0-1.0.
6. Pick 6 DIFFERENT templates. Mix image-mode and text-mode if both fit
   the user's selected mode.
7. Return STRICT JSON only. No prose. No markdown.

OUTPUT JSON SCHEMA (return exactly this):
{
  "suggestions": [
    {
      "templateId": "string (must match an available template's id)",
      "slotValues": { "slotId": "caption text" },
      "confidence": 0.0,
      "reasoning": "one sentence"
    },
    ... 6 total
  ]
}
""".strip()


def data_url_for_upload(content: bytes, mime: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def get_photo(photo_id: str) -> sqlite3.Row | None:
    with db() as conn:
        return conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()


def reaction_counts(share_id: str) -> dict[str, int]:
    with db() as conn:
        rows = conn.execute(
            "SELECT emoji, COUNT(*) AS count FROM reactions WHERE share_id = ? GROUP BY emoji",
            (share_id,),
        ).fetchall()
    return {row["emoji"]: int(row["count"]) for row in rows}


def filtered_templates(mode: str, templates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pool = [t for t in templates if t.get("mode") in (mode, "both")]
    return pool or templates


def strip_json_fence(content: str) -> str:
    text = content.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def fit_text(value: Any, max_length: int) -> str:
    text = str(value or "").strip()
    if len(text) > max_length:
        text = text[: max(0, max_length - 1)].rstrip() + "…"
    return text


def validate_suggestions(raw: Any, req: SuggestRequest, templates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    template_by_id = {str(t.get("id")): t for t in templates}
    items = raw.get("suggestions", []) if isinstance(raw, dict) else []
    suggestions: list[dict[str, Any]] = []
    seen = set()

    for item in items:
        if not isinstance(item, dict):
            continue
        template_id = str(item.get("templateId") or "")
        template = template_by_id.get(template_id)
        if not template or template_id in seen:
            continue
        seen.add(template_id)

        slot_values_in = item.get("slotValues") if isinstance(item.get("slotValues"), dict) else {}
        slot_values: dict[str, str] = {}
        for slot in template.get("slots", []):
            slot_id = str(slot.get("id") or "")
            if not slot_id:
                continue
            max_length = int(slot.get("maxLength") or 80)
            fallback = f"POV: {req.backstory or req.textInput or 'this moment'}"
            slot_values[slot_id] = fit_text(slot_values_in.get(slot_id) or fallback, max_length)

        confidence = item.get("confidence", 0.5)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.5

        mode = template.get("mode")
        if mode == "both":
            mode = req.mode
        if mode not in ("image", "text"):
            mode = req.mode

        suggestion = {
            "id": nanoid(8, "sug_"),
            "templateId": template_id,
            "mode": mode,
            "slotValues": slot_values,
            "confidence": confidence,
            "reasoning": fit_text(item.get("reasoning") or "Template fits the provided context.", 180),
        }
        if req.mode == "image" and req.photoId:
            suggestion["userPhotoId"] = req.photoId
        suggestions.append(suggestion)
        if len(suggestions) == 6:
            break

    if len(suggestions) < 6:
        used = {s["templateId"] for s in suggestions}
        suggestions.extend(fallback_suggestions(req, templates, used_ids=used, count=6 - len(suggestions)))

    return suggestions[:6]


def fallback_suggestions(
    req: SuggestRequest,
    templates: list[dict[str, Any]],
    used_ids: set[str] | None = None,
    count: int = 6,
) -> list[dict[str, Any]]:
    used_ids = used_ids or set()
    seed = (req.backstory or req.textInput or "this moment").strip() or "this moment"
    pool = [t for t in templates if str(t.get("id")) not in used_ids] or templates
    out = []

    for i in range(count):
        template = pool[i % len(pool)] if pool else {"id": "classic-impact", "mode": req.mode, "slots": []}
        template_id = str(template.get("id") or "classic-impact")
        slot_values: dict[str, str] = {}
        slots = template.get("slots") or [{"id": "caption", "label": "Caption", "maxLength": 80}]
        for slot in slots:
            slot_id = str(slot.get("id") or "caption")
            max_length = int(slot.get("maxLength") or 80)
            label = str(slot.get("label") or slot_id).lower()
            slot_values[slot_id] = fit_text(f"POV: when {seed} ({label})", max_length)

        mode = template.get("mode")
        if mode == "both":
            mode = req.mode
        if mode not in ("image", "text"):
            mode = req.mode

        suggestion = {
            "id": nanoid(8, "sug_"),
            "templateId": template_id,
            "mode": mode,
            "slotValues": slot_values,
            "confidence": 0.3,
            "reasoning": "Fallback suggestion because the AI response was unavailable or incomplete.",
        }
        if req.mode == "image" and req.photoId:
            suggestion["userPhotoId"] = req.photoId
        out.append(suggestion)
    return out


async def call_openrouter(req: SuggestRequest, templates: list[dict[str, Any]], photo_data_url: str | None) -> dict[str, Any]:
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing")

    templates_json = json.dumps(templates, ensure_ascii=False)
    system_prompt = SYSTEM_PROMPT.replace("{templates_json}", templates_json)
    if req.mode == "image":
        if not photo_data_url:
            raise RuntimeError("photo data url is missing")
        user_content = [
            {
                "type": "text",
                "text": f"Photo backstory (optional): {req.backstory or ''}\n\nGenerate 6 meme suggestions in the JSON schema above.",
            },
            {"type": "image_url", "image_url": {"url": photo_data_url}},
        ]
        model = "openai/gpt-4o-mini"
    else:
        user_content = [
            {
                "type": "text",
                "text": f"User situation: {req.textInput or ''}\n\nGenerate 6 meme suggestions in the JSON schema above.",
            }
        ]
        model = "anthropic/claude-3.5-haiku"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.85,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": HTTP_REFERER,
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    content = data["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in content)
    return json.loads(strip_json_fence(str(content)))


@app.post("/api/upload")
async def upload_photo(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")

    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid image") from exc

    # AMENDMENT-7: downscale to max 1024px long edge before storing/sending to LLM
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    longest = max(image.size)
    if longest > PHOTO_MAX_SIDE:
        ratio = PHOTO_MAX_SIDE / longest
        new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
        resample = getattr(Image, "Resampling", Image).LANCZOS
        image = image.resize(new_size, resample)
    width, height = image.size

    out_buf = io.BytesIO()
    out_mime = "image/jpeg"
    image.convert("RGB").save(out_buf, format="JPEG", quality=88, optimize=True)
    out_bytes = out_buf.getvalue()

    photo_id = nanoid(10, "photo_")
    data_url = data_url_for_upload(out_bytes, out_mime)
    with db() as conn:
        conn.execute(
            "INSERT INTO photos (id, data_url, width, height, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (photo_id, data_url, int(width), int(height), out_mime, now_ms()),
        )

    return {"photoId": photo_id, "dataUrl": data_url, "width": int(width), "height": int(height), "mime": out_mime}


@app.post("/api/suggest")
async def suggest(req: SuggestRequest) -> dict[str, Any]:
    if req.mode not in ("image", "text"):
        raise HTTPException(status_code=400, detail="mode must be image or text")

    templates = filtered_templates(req.mode, req.templates)
    if not templates:
        raise HTTPException(status_code=400, detail="templates are required")

    photo_data_url = None
    if req.mode == "image":
        if not req.photoId:
            return {"suggestions": fallback_suggestions(req, templates)}
        photo = get_photo(req.photoId)
        if photo:
            photo_data_url = photo["data_url"]

    try:
        raw = await call_openrouter(req, templates, photo_data_url)
        suggestions = validate_suggestions(raw, req, templates)
    except Exception:
        suggestions = fallback_suggestions(req, templates)

    return {"suggestions": suggestions[:6]}


@app.post("/api/share")
async def share_meme(req: ShareRequest, request: Request) -> dict[str, str]:
    image_base64 = (req.imageBase64 or "").strip()
    if not image_base64:
        raise HTTPException(status_code=400, detail="imageBase64 is required")
    if image_base64.startswith("data:"):
        # strip data URL prefix
        _, _, image_base64 = image_base64.partition(",")
    try:
        png_bytes = base64.b64decode(image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid base64 image") from exc

    share_id = nanoid(8)
    file_path = SHARES_DIR / f"{share_id}.png"
    file_path.write_bytes(png_bytes)
    rel_path = f"/shares/{share_id}.png"

    created_at = now_ms()
    with db() as conn:
        conn.execute(
            "INSERT INTO shares (id, image_path, meta_json, created_at) VALUES (?, ?, ?, ?)",
            (share_id, rel_path, json.dumps(req.meta or {}, ensure_ascii=False), created_at),
        )

    origin = request.headers.get("origin") or os.getenv("APP_ORIGIN") or str(request.base_url).rstrip("/")
    share_url = f"{origin.rstrip('/')}/?view={share_id}"
    return {"shareId": share_id, "shareUrl": share_url, "imageUrl": rel_path}


@app.get("/api/share/{share_id}")
async def get_share(share_id: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute("SELECT * FROM shares WHERE id = ?", (share_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="share not found")
    return {
        "id": row["id"],
        "imageUrl": row["image_path"],
        "createdAt": int(row["created_at"]),
        "reactions": reaction_counts(share_id),
    }


@app.post("/api/react")
async def react(req: ReactRequest) -> dict[str, Any]:
    share_id = (req.shareId or "").strip()
    emoji = (req.emoji or "").strip()
    if not share_id or not emoji:
        raise HTTPException(status_code=400, detail="shareId and emoji are required")

    with db() as conn:
        share = conn.execute("SELECT id FROM shares WHERE id = ?", (share_id,)).fetchone()
        if not share:
            raise HTTPException(status_code=404, detail="share not found")
        conn.execute(
            "INSERT INTO reactions (share_id, emoji, created_at) VALUES (?, ?, ?)",
            (share_id, emoji, now_ms()),
        )

    counts = reaction_counts(share_id)
    # AMENDMENT-2: SSE payload is strictly {emoji, counts}
    event = {"emoji": emoji, "counts": counts}
    for queue in list(subscribers.get(share_id, [])):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass
    return {"ok": True, "counts": counts}


@app.get("/api/stream/{share_id}")
async def stream(share_id: str) -> StreamingResponse:
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        subscribers.setdefault(share_id, []).append(queue)
        try:
            yield ":\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"event: reaction\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ":\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            queues = subscribers.get(share_id, [])
            if queue in queues:
                queues.remove(queue)
            if not queues:
                subscribers.pop(share_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/")
async def index() -> FileResponse:
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)


app.mount("/shares", StaticFiles(directory=SHARES_DIR), name="shares")
app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/{path:path}", response_model=None)
async def static_files(path: str):
    safe_path = (STATIC_DIR / path).resolve()
    if STATIC_DIR not in safe_path.parents and safe_path != STATIC_DIR:
        raise HTTPException(status_code=404, detail="not found")
    if safe_path.is_file():
        return FileResponse(safe_path)
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return JSONResponse({"error": "not found"}, status_code=404)


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
