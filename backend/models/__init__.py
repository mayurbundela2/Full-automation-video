import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from backend.database import Base


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    batches = relationship("Batch", back_populates="project", cascade="all, delete-orphan", order_by="Batch.batch_number")


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    batch_number = Column(Integer, nullable=False, default=1)
    name = Column(String(255), nullable=False)
    raw_reference = Column(Text, nullable=True)
    status = Column(String(50), default="DRAFT")  # DRAFT, READY, GENERATING, COMPLETED, PARTIAL
    combined_wav_path = Column(String(500), nullable=True)
    combined_mp3_path = Column(String(500), nullable=True)
    combined_duration = Column(Float, nullable=True)
    tight_wav_path = Column(String(500), nullable=True)
    tight_mp3_path = Column(String(500), nullable=True)
    tight_mp4_path = Column(String(500), nullable=True)
    tight_duration = Column(Float, nullable=True)
    media_folder = Column(String(500), nullable=True)
    master_video_path = Column(String(500), nullable=True)
    master_video_duration = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    project = relationship("Project", back_populates="batches")
    paragraphs = relationship("Paragraph", back_populates="batch", cascade="all, delete-orphan", order_by="Paragraph.paragraph_number, Paragraph.part_number")


class Paragraph(Base):
    __tablename__ = "paragraphs"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    paragraph_number = Column(Integer, nullable=False, default=1)
    part_number = Column(String(50), nullable=True)  # e.g., "A", "B" or "Part 1"
    
    # AI Studio style metadata fields
    scene = Column(Text, nullable=True)
    sample_context = Column(Text, nullable=True)
    audio_profile = Column(Text, nullable=True)
    speaker = Column(String(100), nullable=True)
    style = Column(String(100), nullable=True, default="Newscaster")
    pace = Column(String(100), nullable=True, default="Natural")
    accent = Column(String(100), nullable=True, default="Neutral")
    voice = Column(String(100), nullable=True, default="Algenib")
    director_notes = Column(Text, nullable=True)
    additional_notes = Column(Text, nullable=True)

    # Video Shot production metadata
    on_screen_text = Column(Text, nullable=True)
    video_prompt = Column(Text, nullable=True)
    scene_progression = Column(Text, nullable=True)
    overall_mood = Column(Text, nullable=True)
    sound_effects = Column(Text, nullable=True)
    background_music = Column(Text, nullable=True)

    # Matched media asset & synchronized video
    media_path = Column(String(500), nullable=True)
    media_type = Column(String(20), nullable=True)  # "video", "image"
    original_media_duration = Column(Float, nullable=True)
    speed_factor = Column(Float, nullable=True)
    synced_video_path = Column(String(500), nullable=True)
    thumbnail_path = Column(String(500), nullable=True)
    
    # Spoken transcript
    transcript = Column(Text, nullable=False, default="")
    
    # Custom edited prompt override (if any)
    custom_prompt = Column(Text, nullable=True)
    
    # Stats & Status
    word_count = Column(Integer, default=0)
    character_count = Column(Integer, default=0)
    status = Column(String(50), default="DRAFT")  # DRAFT, READY, OVER_LIMIT, QUEUED, GENERATING, COMPLETED, FAILED
    
    generation_id = Column(Integer, nullable=True)
    parent_paragraph_id = Column(Integer, ForeignKey("paragraphs.id", ondelete="SET NULL"), nullable=True)
    raw_reference = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    batch = relationship("Batch", back_populates="paragraphs")
    generations = relationship("Generation", back_populates="paragraph", cascade="all, delete-orphan", order_by="desc(Generation.created_at)")


class Generation(Base):
    __tablename__ = "generations"

    id = Column(Integer, primary_key=True, index=True)
    paragraph_id = Column(Integer, ForeignKey("paragraphs.id", ondelete="CASCADE"), nullable=False)
    project_name = Column(String(255), nullable=True)
    batch_number = Column(Integer, nullable=True)
    paragraph_number = Column(Integer, nullable=True)
    part_number = Column(String(50), nullable=True)
    
    voice = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    duration = Column(Float, nullable=True)
    
    wav_path = Column(String(500), nullable=True)
    mp3_path = Column(String(500), nullable=True)
    metadata_path = Column(String(500), nullable=True)
    
    prompt_used = Column(Text, nullable=True)
    transcript_used = Column(Text, nullable=True)
    
    status = Column(String(50), default="COMPLETED")  # GENERATING, COMPLETED, FAILED
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)

    paragraph = relationship("Paragraph", back_populates="generations")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=False)
