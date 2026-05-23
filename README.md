# Magic Lab

Magic Lab is a single-page meme-maker prototype. Users can upload a photo or describe a situation, get six AI-generated meme suggestions, edit/export a PNG, share it by link, and see live emoji reactions.

## Project Structure

```text
.
├── server.py                     # FastAPI backend, OpenRouter calls, SQLite, SSE, static serving
├── frontend/
│   ├── index.html                # SPA shell
│   └── static/
│       ├── css/app.css           # UI styles
│       ├── js/                   # browser modules
│       └── assets/templates/     # meme template images
├── var/                          # local runtime data, ignored by git
│   ├── magic_lab.sqlite3
│   └── shares/
├── tasks/                        # task briefs
├── prompts/                      # implementation prompts
├── otherRelevantFiles/           # contracts, context, deployment notes, work log
└── .env.example
```

## Requirements

- Python virtual environment at `.venv`
- Python packages: `fastapi uvicorn httpx pillow python-multipart`
- Node/npm only for temporary `localtunnel` deployment

Install Python dependencies:

```bash
.venv/bin/pip install fastapi uvicorn httpx pillow python-multipart
```

## Environment

Create `.env` from `.env.example` or rely on `.env.example` for the demo key:

```bash
OPENROUTER_API_KEY='sk-or-v1-...'
APP_ORIGIN=http://localhost:8000
```

## Run Locally

```bash
.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
```

Open:

```text
http://localhost:8000/
```

## API Surface

- `POST /api/upload`
- `POST /api/suggest`
- `POST /api/share`
- `GET /api/share/{id}`
- `POST /api/react`
- `GET /api/stream/{id}`
- `GET /shares/{id}.png`
- `GET /`, `/static/*`, `/assets/*`

## Temporary Public Deployment

Use the helper script for the short demo window:

```bash
./deploy.sh
```

It starts FastAPI on port `8000`, opens a localtunnel URL, and writes runtime logs/state under `var/`.

Stop the temporary deployment:

```bash
./undeploy.sh
```

## Notes

- Runtime data lives in `var/` and is ignored by git.
- Shared meme image URLs remain public as `/shares/<shareId>.png`.
- Live reactions use Server-Sent Events at `/api/stream/{shareId}`.
