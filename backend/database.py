import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

if getattr(sys, "frozen", False):
    exe_dir = Path(sys.executable).resolve().parent
    cwd = Path.cwd()
    if (cwd / ".env").exists() or (cwd / "data").exists():
        BASE_DIR = cwd
    else:
        BASE_DIR = exe_dir
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_DIR = BASE_DIR / "data"
DATABASE_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATABASE_DIR / 'automate_ai_video.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db():
    Base.metadata.create_all(bind=engine)
    # Check and add new columns if existing SQLite DB
    import sqlite3
    db_file = DATABASE_DIR / "automate_ai_video.db"
    if db_file.exists():
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA table_info(batches)")
            columns = [row[1] for row in cursor.fetchall()]
            if "combined_wav_path" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN combined_wav_path VARCHAR(500)")
            if "combined_mp3_path" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN combined_mp3_path VARCHAR(500)")
            if "combined_duration" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN combined_duration FLOAT")
            if "tight_wav_path" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN tight_wav_path VARCHAR(500)")
            if "tight_mp3_path" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN tight_mp3_path VARCHAR(500)")
            if "tight_mp4_path" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN tight_mp4_path VARCHAR(500)")
            if "tight_duration" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN tight_duration FLOAT")
            if "media_folder" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN media_folder VARCHAR(500)")
            if "master_video_path" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN master_video_path VARCHAR(500)")
            if "master_video_duration" not in columns:
                cursor.execute("ALTER TABLE batches ADD COLUMN master_video_duration FLOAT")

            cursor.execute("PRAGMA table_info(paragraphs)")
            p_cols = [row[1] for row in cursor.fetchall()]
            new_p_cols = [
                ("on_screen_text", "TEXT"),
                ("video_prompt", "TEXT"),
                ("scene_progression", "TEXT"),
                ("overall_mood", "TEXT"),
                ("sound_effects", "TEXT"),
                ("background_music", "TEXT"),
                ("media_path", "VARCHAR(500)"),
                ("media_type", "VARCHAR(20)"),
                ("original_media_duration", "FLOAT"),
                ("speed_factor", "FLOAT"),
                ("synced_video_path", "VARCHAR(500)"),
                ("thumbnail_path", "VARCHAR(500)"),
            ]
            for col_name, col_type in new_p_cols:
                if col_name not in p_cols:
                    cursor.execute(f"ALTER TABLE paragraphs ADD COLUMN {col_name} {col_type}")

            conn.commit()
        except Exception as e:
            print(f"[DB] Migration note: {e}")
        finally:
            conn.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
