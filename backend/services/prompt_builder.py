import re
from typing import Dict, Any, Optional


class PromptBuilder:
    """
    Constructs clean, structured Gemini TTS prompts containing director instructions,
    scene context, voice/audio profiles, and exact spoken transcript.
    """

    @classmethod
    def build_system_instruction(cls, config: Optional[Dict[str, Any]] = None) -> str:
        """
        Builds a strict text-to-speech system prompt to prevent the model from conversing or generating extraneous words.
        """
        return (
            "You are a professional studio text-to-speech voice generator. "
            "Your sole task is to read the exact provided transcript aloud verbatim with the specified emotion, style, and pacing. "
            "NEVER converse, NEVER explain, NEVER answer questions, and NEVER add any preamble, greeting, commentary, or extra words. "
            "Speak ONLY the exact spoken transcript words and respect inline emotion/timing tags."
        )

    @classmethod
    def build_tts_prompt(cls, config: Dict[str, Any], preserve_inline_tags: bool = True) -> str:
        """
        Builds the complete TTS prompt from paragraph configuration fields.
        """
        # If user explicitly provided a custom edited prompt, return it directly
        if config.get("custom_prompt") and config["custom_prompt"].strip():
            return config["custom_prompt"].strip()

        transcript = (config.get("transcript") or "").strip()
        if not preserve_inline_tags:
            # Strip [tag] if disabled
            transcript = re.sub(r'\[[\w\s\-_]+\]', '', transcript).strip()

        sections = [
            "Generate a natural spoken narration.",
            "Follow the director's instructions carefully.",
            "Do not speak the metadata, headings, labels, or instructions aloud.",
            "Only speak the transcript."
        ]

        if config.get("audio_profile") and str(config["audio_profile"]).strip():
            sections.append(f"AUDIO PROFILE:\n{str(config['audio_profile']).strip()}")

        if config.get("scene") and str(config["scene"]).strip():
            sections.append(f"SCENE:\n{str(config['scene']).strip()}")

        if config.get("sample_context") and str(config["sample_context"]).strip():
            sections.append(f"SAMPLE CONTEXT:\n{str(config['sample_context']).strip()}")

        # Director's notes block
        director_items = []
        if config.get("style") and str(config["style"]).strip():
            director_items.append(f"STYLE:\n{str(config['style']).strip()}")
        if config.get("pace") and str(config["pace"]).strip():
            director_items.append(f"PACE:\n{str(config['pace']).strip()}")
        if config.get("accent") and str(config["accent"]).strip():
            director_items.append(f"ACCENT:\n{str(config['accent']).strip()}")
        if config.get("director_notes") and str(config["director_notes"]).strip():
            director_items.append(f"NOTES:\n{str(config['director_notes']).strip()}")
        if config.get("additional_notes") and str(config["additional_notes"]).strip():
            director_items.append(f"ADDITIONAL NOTES:\n{str(config['additional_notes']).strip()}")

        if director_items:
            sections.append("DIRECTOR'S NOTES:\n" + "\n\n".join(director_items))

        if config.get("voice") and str(config["voice"]).strip():
            sections.append(f"VOICE:\n{str(config['voice']).strip()}")

        sections.append(f"TRANSCRIPT:\n{transcript}")

        return "\n\n".join(sections)
