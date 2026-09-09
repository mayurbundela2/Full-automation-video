from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import AppSetting
from backend.config.voice_library import get_all_voices
from backend.services.chrome_launcher import ChromeLauncher
from backend.config.settings import settings
import subprocess
import os
import sys

voices_router = APIRouter(prefix="/api/voices", tags=["Voices"])
system_router = APIRouter(prefix="/api", tags=["System"])


class CustomVoiceCreate(BaseModel):
    name: str


@voices_router.get("", response_model=List[Dict[str, Any]])
def list_voices(db: Session = Depends(get_db)):
    custom_setting = db.query(AppSetting).filter(AppSetting.key == "CUSTOM_VOICES").first()
    custom_list = [v.strip() for v in custom_setting.value.split(",") if v.strip()] if custom_setting else []
    return get_all_voices(custom_list)


@voices_router.post("", response_model=List[Dict[str, Any]])
def add_custom_voice(voice_data: CustomVoiceCreate, db: Session = Depends(get_db)):
    custom_setting = db.query(AppSetting).filter(AppSetting.key == "CUSTOM_VOICES").first()
    existing = [v.strip() for v in custom_setting.value.split(",") if v.strip()] if custom_setting else []
    if voice_data.name.strip() and voice_data.name.strip() not in existing:
        existing.append(voice_data.name.strip())
        val_str = ",".join(existing)
        if not custom_setting:
            db.add(AppSetting(key="CUSTOM_VOICES", value=val_str))
        else:
            custom_setting.value = val_str
        db.commit()
    return get_all_voices(existing)


@system_router.post("/open-ai-studio")
def trigger_open_ai_studio(db: Session = Depends(get_db)):
    chrome_path_setting = db.query(AppSetting).filter(AppSetting.key == "CHROME_PATH").first()
    manual_path = chrome_path_setting.value if chrome_path_setting and chrome_path_setting.value else None
    opened = ChromeLauncher.open_ai_studio(manual_path)
    return {"status": "ok", "opened": opened, "url": "https://aistudio.google.com/"}


@system_router.post("/open-folder")
def open_system_folder(path: str):
    if not os.path.exists(path):
        return {"status": "error", "message": "Folder does not exist yet."}
    
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif sys.platform.startswith("linux"):
        subprocess.Popen(["xdg-open", path])
    elif sys.platform == "win32":
        subprocess.Popen(["explorer", path])
    
    return {"status": "ok", "path": path}
 
 
@system_router.api_route("/select-folder", methods=["GET", "POST"])
def select_system_folder(title: str = "Select Video / Media Folder"):
    """
    Opens the native OS directory chooser dialog and returns the selected folder path.
    Works on Windows, macOS, and Linux when backend is running locally.
    """
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder_selected = filedialog.askdirectory(title=title)
        root.destroy()
        if folder_selected:
            normalized = folder_selected.replace("\\", "/")
            return {"status": "ok", "folder_path": normalized}
        return {"status": "cancelled", "folder_path": None}
    except Exception as e:
        return {"status": "error", "message": str(e), "folder_path": None}


@system_router.get("/health")
def health_check():
    return {"status": "healthy", "service": "Gemini TTS Generator", "version": "1.0.0"}
