import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import AppSetting
from backend.schemas import SettingsSchema, SettingsUpdateSchema
from backend.config.settings import settings

router = APIRouter(prefix="/api/settings", tags=["Settings"])


def get_setting_val(db: Session, key: str, default_val: any) -> str:
    item = db.query(AppSetting).filter(AppSetting.key == key).first()
    return item.value if item else str(default_val)


@router.get("", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    api_key = get_setting_val(db, "GEMINI_API_KEY", settings.GEMINI_API_KEY)
    masked_key = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else ("***" if api_key else "")
    is_demo = not bool(api_key) or api_key.lower() == "demo_mode" or api_key == "your_api_key_here"

    return SettingsSchema(
        gemini_api_key_masked=masked_key,
        gemini_model=get_setting_val(db, "GEMINI_MODEL", settings.GEMINI_MODEL),
        default_voice=get_setting_val(db, "DEFAULT_VOICE", settings.DEFAULT_VOICE),
        voice_speed=float(get_setting_val(db, "DEFAULT_VOICE_SPEED", settings.DEFAULT_VOICE_SPEED)),
        max_tts_characters=int(get_setting_val(db, "MAX_TTS_CHARACTERS", settings.MAX_TTS_CHARACTERS)),
        max_tts_words=int(get_setting_val(db, "MAX_TTS_WORDS", settings.MAX_TTS_WORDS)),
        near_limit_threshold=float(get_setting_val(db, "NEAR_LIMIT_THRESHOLD", settings.NEAR_LIMIT_THRESHOLD)),
        auto_split=get_setting_val(db, "AUTO_SPLIT", settings.AUTO_SPLIT).lower() == "true",
        auto_convert_mp3=get_setting_val(db, "AUTO_CONVERT_MP3", settings.AUTO_CONVERT_MP3).lower() == "true",
        mp3_bitrate=get_setting_val(db, "MP3_BITRATE", settings.MP3_BITRATE),
        preserve_inline_tags=get_setting_val(db, "PRESERVE_INLINE_TAGS", settings.PRESERVE_INLINE_TAGS).lower() == "true",
        output_folder=get_setting_val(db, "OUTPUT_FOLDER", settings.OUTPUT_FOLDER),
        chrome_path=get_setting_val(db, "CHROME_PATH", settings.CHROME_PATH),
        ffmpeg_path=get_setting_val(db, "FFMPEG_PATH", settings.FFMPEG_PATH),
        is_demo_mode=is_demo
    )


@router.put("", response_model=SettingsSchema)
def update_settings(update_data: SettingsUpdateSchema, db: Session = Depends(get_db)):
    data_dict = update_data.model_dump(exclude_unset=True)

    for field, val in data_dict.items():
        if val is not None:
            key_upper = "DEFAULT_VOICE_SPEED" if field == "voice_speed" else field.upper()
            # If empty string was sent for API key, don't erase if masked
            if field == "gemini_api_key" and not val.strip():
                continue

            setting_entry = db.query(AppSetting).filter(AppSetting.key == key_upper).first()
            if not setting_entry:
                setting_entry = AppSetting(key=key_upper, value=str(val))
                db.add(setting_entry)
            else:
                setting_entry.value = str(val)

            # Also update in-memory settings
            if hasattr(settings, key_upper):
                setattr(settings, key_upper, val)
            if key_upper == "GEMINI_API_KEY":
                os.environ["GEMINI_API_KEY"] = str(val)

    db.commit()
    return get_settings(db)
