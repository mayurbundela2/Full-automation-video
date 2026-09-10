import os
import time
import re
from typing import Dict, Any, Optional, Tuple
from google import genai
from google.genai import types
from backend.services.audio_converter import AudioConverter


class GeminiTTSService:
    """
    Isolated Google Gemini TTS Generation Service using official google-genai SDK
    with retry exponential backoff and Demo Mode support.
    """

    _current_active_key_index: int = 0
    _last_key_use_time: Dict[str, float] = {}
    MIN_INTERVAL_PER_KEY: float = 20.5  # 3 RPM = 1 request every 20s

    FALLBACK_MODELS = [
        "gemini-3.1-flash-tts-preview",
        "gemini-2.5-flash-preview-tts",
        "gemini-2.5-flash"
    ]

    @classmethod
    def get_api_key_pool(cls, explicit_key: Optional[str] = None) -> list[str]:
        """
        Extracts all configured Gemini API keys from input, environment, and settings.
        Supports comma-separated, semicolon-separated, or newline-separated keys.
        """
        sources = [explicit_key, os.getenv("GEMINI_API_KEYS"), os.getenv("GEMINI_API_KEY")]
        clean_keys = []
        for src in sources:
            if not src:
                continue
            tokens = re.split(r'[,;\n\r]+', src)
            for t in tokens:
                k = t.strip()
                if k and k not in clean_keys and k not in ("your_google_gemini_api_key_here", "your_api_key_here", "demo_mode"):
                    clean_keys.append(k)
        return clean_keys

    @classmethod
    def _enforce_rate_limit(cls, key: str):
        """
        Ensures we never exceed the Google Free Tier 3 RPM (20s interval) limit for a given key.
        """
        now = time.time()
        last_used = cls._last_key_use_time.get(key, 0.0)
        elapsed = now - last_used

        if elapsed < cls.MIN_INTERVAL_PER_KEY:
            wait_needed = round(cls.MIN_INTERVAL_PER_KEY - elapsed, 1)
            print(f"[GeminiTTSService] [RATE-LIMIT] Free tier: waiting {wait_needed}s to stay within 3 RPM limit...")
            time.sleep(wait_needed)

        cls._last_key_use_time[key] = time.time()

    @classmethod
    def generate_speech(
        cls,
        prompt: str,
        transcript: str,
        voice: str = "Algenib",
        model: str = "gemini-3.1-flash-tts-preview",
        api_key: Optional[str] = None,
        max_retries: int = 2
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Generates TTS speech audio with:
        1. Free-tier 3 RPM rate limiter protection (prevents 429 errors).
        2. Automatic multi-key rotation across configured keys.
        3. Automatic fallback between 3.1 Flash and 2.5 Flash models if daily quota is reached.
        """
        key_pool = cls.get_api_key_pool(api_key)

        # If no valid keys are provided, run in DEMO MODE
        if not key_pool:
            print(f"[GeminiTTSService] No active keys found. Running in DEMO MODE (synthetic audio).")
            words = len(transcript.split()) if transcript else 15
            duration_sec = max(2.0, round(words / 2.3, 1))
            demo_pcm = AudioConverter.generate_demo_wav(duration_seconds=duration_sec, sample_rate=24000)
            return demo_pcm, {
                "model": f"{model} (Demo Mode)",
                "voice": voice,
                "sample_rate": 24000,
                "mime_type": "audio/pcm;rate=24000",
                "is_demo": True
            }

        voice_clean = voice.strip() if voice else "Algenib"
        last_error = None
        total_keys = len(key_pool)

        # Models to try (user selected model first, then compatible fallback TTS models)
        models_to_try = [model]
        for fm in cls.FALLBACK_MODELS:
            if fm not in models_to_try:
                models_to_try.append(fm)

        # Start from current active working key index and cycle through keys
        start_idx = cls._current_active_key_index % total_keys

        for step in range(total_keys):
            key_index = (start_idx + step) % total_keys
            current_key = key_pool[key_index]
            masked_key = f"...{current_key[-6:]}" if len(current_key) > 8 else "***"
            client = genai.Client(api_key=current_key)

            for cur_model in models_to_try:
                attempt = 0
                while attempt < max_retries:
                    attempt += 1
                    try:
                        # Enforce 3 RPM rate-limit interval before call
                        cls._enforce_rate_limit(current_key)

                        speech_config = types.SpeechConfig(
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                    voice_name=voice_clean
                                )
                            )
                        )

                        config = types.GenerateContentConfig(
                            response_modalities=["AUDIO"],
                            speech_config=speech_config,
                        )

                        response = client.models.generate_content(
                            model=cur_model,
                            contents=prompt,
                            config=config,
                        )

                        # Extract audio part
                        audio_bytes = None
                        mime_type = "audio/pcm;rate=24000"
                        sample_rate = 24000

                        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                            for part in response.candidates[0].content.parts:
                                if hasattr(part, "inline_data") and part.inline_data:
                                    audio_bytes = part.inline_data.data
                                    if hasattr(part.inline_data, "mime_type") and part.inline_data.mime_type:
                                        mime_type = part.inline_data.mime_type
                                        rate_match = re.search(r'rate=(\d+)', mime_type)
                                        if rate_match:
                                            sample_rate = int(rate_match.group(1))
                                    break

                        if not audio_bytes:
                            raise RuntimeError(f"Gemini API returned response without audio data on model {cur_model}.")

                        # Mark this key as the active working key for subsequent calls
                        cls._current_active_key_index = (key_index + 1) % total_keys
                        print(f"[GeminiTTSService] [OK] Generated audio successfully using API key #{key_index + 1} [{masked_key}] with model [{cur_model}].")

                        return audio_bytes, {
                            "model": cur_model,
                            "voice": voice_clean,
                            "sample_rate": sample_rate,
                            "mime_type": mime_type,
                            "is_demo": False,
                            "key_used": masked_key
                        }

                    except Exception as e:
                        err_str = str(e)
                        last_error = e

                        print(f"[GeminiTTSService] [WARN] Key #{key_index + 1} [{masked_key}] model [{cur_model}] error: {err_str[:120]}")

                        # If 429 daily quota on this model, break model loop to try fallback model or next key
                        if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str or "quota" in err_str.lower():
                            break

                        if attempt < max_retries:
                            time.sleep(1.0)

            # Rotate to next key if current key failed across models
            if total_keys > 1 and step < total_keys - 1:
                next_idx = (key_index + 1) % total_keys
                next_masked = f"...{key_pool[next_idx][-6:]}"
                print(f"[GeminiTTSService] [SWITCH] Auto-switching to next API key #{next_idx + 1} [{next_masked}]...")

        raise RuntimeError(
            f"TTS generation failed across all {total_keys} configured API keys.\n"
            f"Last technical error: {str(last_error)}"
        )
