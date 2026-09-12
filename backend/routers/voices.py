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
    Works natively on macOS (AppleScript Finder/System Events), Windows (PowerShell/Tkinter),
    and Linux (Zenity/Kdialog/Tkinter) without requiring external GUI packages.
    """
    folder_selected = None

    # 1. macOS: Use AppleScript native file/folder chooser (works out of the box, no tkinter required)
    if sys.platform == "darwin":
        try:
            escaped_title = title.replace('"', '\\"')
            cmd = [
                "osascript",
                "-e", "try",
                "-e", "tell application \"Finder\"",
                "-e", "activate",
                "-e", f"set chosenFolder to choose folder with prompt \"{escaped_title}\"",
                "-e", "return POSIX path of chosenFolder",
                "-e", "end tell",
                "-e", "on error number -128",
                "-e", "return \"\"",
                "-e", "end try"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            chosen = res.stdout.strip()
            if chosen:
                folder_selected = chosen
            else:
                return {"status": "cancelled", "folder_path": None}
        except subprocess.TimeoutExpired:
            return {"status": "cancelled", "folder_path": None}
        except Exception as mac_err:
            print(f"[select-folder] macOS osascript error: {mac_err}")

    # 2. Windows: Try PowerShell FolderBrowserDialog first if tkinter isn't present
    if not folder_selected and sys.platform == "win32":
        try:
            ps_script = (
                "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null;"
                "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog;"
                f"$dlg.Description = '{title}';"
                "$dlg.ShowNewFolderButton = $true;"
                "if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }"
            )
            res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True, timeout=60)
            chosen = res.stdout.strip()
            if chosen:
                folder_selected = chosen
        except Exception as win_err:
            print(f"[select-folder] Windows PowerShell error: {win_err}")

    # 3. Linux: Try Zenity or Kdialog
    if not folder_selected and sys.platform.startswith("linux"):
        for dialog_cmd in [["zenity", "--file-selection", "--directory", f"--title={title}"], ["kdialog", "--getexistingdirectory", "--title", title]]:
            try:
                res = subprocess.run(dialog_cmd, capture_output=True, text=True, timeout=60)
                chosen = res.stdout.strip()
                if chosen:
                    folder_selected = chosen
                    break
            except Exception:
                continue

    # 4. Fallback: Tkinter (if installed and working)
    if not folder_selected:
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            folder_selected = filedialog.askdirectory(title=title)
            root.destroy()
        except Exception as tk_err:
            # If nothing worked and it's not macOS (macOS cancellation returns above)
            if not folder_selected:
                return {"status": "error", "message": f"Native folder picker unavailable: {tk_err}", "folder_path": None}

    if folder_selected:
        normalized = folder_selected.replace("\\", "/").rstrip("/")
        return {"status": "ok", "folder_path": normalized}
    
    return {"status": "cancelled", "folder_path": None}


@system_router.get("/health")
def health_check():
    return {"status": "healthy", "service": "Gemini TTS Generator", "version": "1.0.0"}
