import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


# --- Settings Schemas ---
class SettingsSchema(BaseModel):
    gemini_api_key_masked: str = ""
    gemini_api_key: Optional[str] = None  # only sent on update
    gemini_model: str = "gemini-3.1-flash-tts-preview"
    default_voice: str = "Algenib"
    max_tts_characters: int = 3000
    max_tts_words: int = 500
    near_limit_threshold: float = 0.80
    auto_split: bool = False
    auto_convert_mp3: bool = True
    mp3_bitrate: str = "320k"
    preserve_inline_tags: bool = True
    output_folder: str = "outputs"
    chrome_path: str = ""
    ffmpeg_path: str = "ffmpeg"
    is_demo_mode: bool = True


class SettingsUpdateSchema(BaseModel):
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    default_voice: Optional[str] = None
    max_tts_characters: Optional[int] = None
    max_tts_words: Optional[int] = None
    near_limit_threshold: Optional[float] = None
    auto_split: Optional[bool] = None
    auto_convert_mp3: Optional[bool] = None
    mp3_bitrate: Optional[str] = None
    preserve_inline_tags: Optional[bool] = None
    output_folder: Optional[str] = None
    chrome_path: Optional[str] = None
    ffmpeg_path: Optional[str] = None


# --- Project Schemas ---
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    batch_count: int = 0
    paragraph_count: int = 0
    completed_generations: int = 0


# --- Paragraph Schemas ---
class ParagraphBase(BaseModel):
    paragraph_number: int = 1
    part_number: Optional[str] = None
    scene: Optional[str] = None
    sample_context: Optional[str] = None
    audio_profile: Optional[str] = None
    speaker: Optional[str] = None
    style: Optional[str] = "Newscaster"
    pace: Optional[str] = "Natural"
    accent: Optional[str] = "Neutral"
    voice: Optional[str] = "Algenib"
    director_notes: Optional[str] = None
    additional_notes: Optional[str] = None
    transcript: str = ""
    custom_prompt: Optional[str] = None

    # Video Shot & Media fields
    on_screen_text: Optional[str] = None
    video_prompt: Optional[str] = None
    scene_progression: Optional[str] = None
    overall_mood: Optional[str] = None
    sound_effects: Optional[str] = None
    background_music: Optional[str] = None
    media_path: Optional[str] = None
    media_type: Optional[str] = None
    original_media_duration: Optional[float] = None
    speed_factor: Optional[float] = None
    synced_video_path: Optional[str] = None
    thumbnail_path: Optional[str] = None


class ParagraphCreate(ParagraphBase):
    pass


class ParagraphUpdate(BaseModel):
    paragraph_number: Optional[int] = None
    part_number: Optional[str] = None
    scene: Optional[str] = None
    sample_context: Optional[str] = None
    audio_profile: Optional[str] = None
    speaker: Optional[str] = None
    style: Optional[str] = None
    pace: Optional[str] = None
    accent: Optional[str] = None
    voice: Optional[str] = None
    director_notes: Optional[str] = None
    additional_notes: Optional[str] = None
    transcript: Optional[str] = None
    custom_prompt: Optional[str] = None
    status: Optional[str] = None


class ParagraphSplitRequest(BaseModel):
    part_a_transcript: str
    part_b_transcript: str
    part_c_transcript: Optional[str] = None


class ParagraphResponse(ParagraphBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    word_count: int
    character_count: int
    status: str
    limit_status: str = "SAFE"  # SAFE, NEAR_LIMIT, OVER_LIMIT
    limit_metrics: Optional[Dict[str, Any]] = None
    raw_reference: Optional[str] = None
    parent_paragraph_id: Optional[int] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    latest_generation: Optional[Dict[str, Any]] = None


# --- Batch Schemas ---
class BatchCreate(BaseModel):
    name: str
    batch_number: Optional[int] = 1


class ParseReferenceRequest(BaseModel):
    raw_text: str
    default_voice: Optional[str] = "Algenib"
    media_folder: Optional[str] = None
    aspect_ratio: Optional[str] = None
    fit_mode: Optional[str] = None


class ParseReferenceResponse(BaseModel):
    detected_count: int
    paragraphs: List[Dict[str, Any]]
    detected_aspect_ratio: Optional[str] = None


class BatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    batch_number: int
    name: str
    raw_reference: Optional[str] = None
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    paragraphs: List[ParagraphResponse] = []
    total_words: int = 0
    total_characters: int = 0
    ready_count: int = 0
    over_limit_count: int = 0
    completed_count: int = 0
    combined_audio: Optional[Dict[str, Any]] = None
    tight_audio: Optional[Dict[str, Any]] = None
    media_folder: Optional[str] = None
    master_video_path: Optional[str] = None
    master_video_duration: Optional[float] = None
    tight_mp4_path: Optional[str] = None
    tight_video_duration: Optional[float] = None
    aspect_ratio: Optional[str] = "16:9"
    fit_mode: Optional[str] = "crop"


class VideoConfigUpdateRequest(BaseModel):
    aspect_ratio: Optional[str] = "16:9"
    fit_mode: Optional[str] = "crop"


# --- Video Media Schemas ---
class ScanMediaRequest(BaseModel):
    folder_path: Optional[str] = None
    media_folder: Optional[str] = None


class MediaMatchItem(BaseModel):
    paragraph_number: int
    paragraph_id: Optional[int] = None
    matched_file: str
    media_type: str  # "video" | "image"
    original_duration: Optional[float] = None
    audio_duration: Optional[float] = None
    speed_factor: Optional[float] = None


class ScanMediaResponse(BaseModel):
    media_folder: str
    total_files_found: int
    matches: List[MediaMatchItem]


class AssignMediaRequest(BaseModel):
    paragraph_id: int
    file_path: str


# --- Generation Schemas ---
class PromptPreviewResponse(BaseModel):
    paragraph_id: int
    prompt: str
    is_custom: bool
    transcript: str
    voice: str


class GenerationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    paragraph_id: int
    project_name: Optional[str]
    batch_number: Optional[int]
    paragraph_number: Optional[int]
    part_number: Optional[str]
    voice: str
    model: str
    duration: Optional[float]
    wav_path: Optional[str]
    mp3_path: Optional[str]
    metadata_path: Optional[str]
    status: str
    error_message: Optional[str]
    created_at: datetime.datetime
    waveform: Optional[Dict[str, Any]] = None
