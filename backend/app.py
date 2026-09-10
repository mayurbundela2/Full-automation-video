import os
import sys
from pathlib import Path

# Ensure Windows consoles don't crash on emojis or non-ASCII characters
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from backend.database import init_db
from backend.routers.projects import router as projects_router
from backend.routers.batches import router as batches_router
from backend.routers.paragraphs import router as paragraphs_router
from backend.routers.generations import router as generations_router
from backend.routers.settings import router as settings_router
from backend.routers.voices import voices_router, system_router

# Initialize database tables and migrations
init_db()

app = FastAPI(
    title="Gemini TTS Generator",
    description="Localhost Google Gemini Text-to-Speech narration generator with AI Studio voice controls",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(projects_router)
app.include_router(batches_router)
app.include_router(paragraphs_router)
app.include_router(generations_router)
app.include_router(settings_router)
app.include_router(voices_router)
app.include_router(system_router)

# Mount frontend static distribution if available
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

if (FRONTEND_DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST_DIR / "assets")), name="static_assets")

@app.get("/")
def serve_root():
    index_file = FRONTEND_DIST_DIR / "index.html"
    if index_file.exists():
        with open(index_file, "rb") as f:
            content = f.read()
        return Response(content=content, media_type="text/html")
    return JSONResponse(status_code=404, content={"detail": "Frontend build not found. Run 'npm run build' inside frontend/"})

@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    # Don't intercept /api or /docs or /openapi.json routes
    if full_path.startswith("api") or full_path.startswith("docs") or full_path == "openapi.json":
        return JSONResponse(status_code=404, content={"detail": "Endpoint not found"})
    
    file_path = FRONTEND_DIST_DIR / full_path
    if file_path.exists() and file_path.is_file():
        with open(file_path, "rb") as f:
            content = f.read()
        media = "text/html" if file_path.suffix == ".html" else ("application/javascript" if file_path.suffix == ".js" else ("text/css" if file_path.suffix == ".css" else "application/octet-stream"))
        return Response(content=content, media_type=media)

    index_file = FRONTEND_DIST_DIR / "index.html"
    if index_file.exists():
        with open(index_file, "rb") as f:
            content = f.read()
        return Response(content=content, media_type="text/html")
    return JSONResponse(status_code=404, content={"detail": "Frontend build not found"})
