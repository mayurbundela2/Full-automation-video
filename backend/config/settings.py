import os
import sys
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

if getattr(sys, "frozen", False):
    exe_dir = Path(sys.executable).resolve().parent
    cwd = Path.cwd()
    if (cwd / ".env").exists() or (cwd / "data").exists():
        BASE_DIR = cwd
    else:
        BASE_DIR = exe_dir
else:
    BASE_DIR = Path(__file__).resolve().parent.parent.parent

load_dotenv(BASE_DIR / ".env")



class AppConfig(BaseSettings):
    # Gemini API
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-tts-preview")
    DEFAULT_VOICE: str = "Algenib"

    # Length Limits
    MAX_TTS_CHARACTERS: int = 3000
    MAX_TTS_WORDS: int = 500
    NEAR_LIMIT_THRESHOLD: float = 0.80  # 80%

    # Audio & Splitting behavior
    AUTO_SPLIT: bool = False
    AUTO_CONVERT_MP3: bool = True
    MP3_BITRATE: str = "320k"
    PRESERVE_INLINE_TAGS: bool = True

    # Paths
    OUTPUT_FOLDER: str = str(BASE_DIR / "outputs")
    CHROME_PATH: str = ""
    FFMPEG_PATH: str = "ffmpeg"

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = AppConfig()
