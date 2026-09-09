import re
from typing import List, Dict, Any, Optional


class ReferenceParser:
    """
    Parses unstructured or structured markdown / text TTS references from AI Studio breakdowns
    into structured paragraph units with metadata and clean transcripts.
    """

    PARAGRAPH_SPLIT_REGEX = re.compile(
        r'(?:^|\n)\s*(?:---\s*\n\s*)?'
        r'(?:'
        r'(?:#{1,6}\s+)(?:\*{1,2})?(?:Part|Paragraph|Scene|Section)\s*(\d+)(?:[A-Za-z])?[:\s—\-&]*(.*?)(?:\*{1,2})?'
        r'|'
        r'(?:\*{1,2})?(?:Part|Paragraph)\s*(\d+)(?:[A-Za-z])?[:\s—\-&]*(.*?)(?:\*{1,2})?'
        r')(?:\n|$)',
        re.IGNORECASE
    )

    PART_HEADER_REGEX = re.compile(
        r'^\s*(?:---\s*\n\s*)?(?:#{1,6}\s*)?(?:\*{1,2})?(?:Part|Paragraph|Scene|Section)\s*(\d+)(?:[A-Za-z])?[:\s—\-]*(.*?)(?:\*{1,2})?$',
        re.MULTILINE | re.IGNORECASE
    )

    SCRIPT_HEADER_REGEX = re.compile(
        r'^[ \t]*(?:#{1,6}\s*)?(?:[*-]\s*)?(?:\*{1,2})?'
        r'(?:Formatted Script to Copy-Paste|Formatted Script|Script to Copy-Paste|Script to Copy|Script \(Copy-Paste\)|'
        r'Script|Transcript|Spoken Text|Spoken Dialogue|Spoken Narration|Narration Script|Narration|Dialogue|'
        r'Voiceover Script|Voiceover|Voice-over Script|Voice-over|Audio Script|TTS Script|'
        r'Hindi Script|Hindi Voiceover|English Script|Final Script)'
        r'[:\s]*(?:\*{1,2})?$',
        re.MULTILINE | re.IGNORECASE
    )

    FOOTER_LINE_REGEX = re.compile(
        r'^(?:'
        r'---+'
        r'|(?:🎬|🎥|💡|📌|📝)'
        r'|(?:Let me know|Generate these|Hope this helps|Feel free to)'
        r'|(?:[*-]\s*)?(?:\*{1,2})?(?:CapCut(?:\s+Editing)?|Production|Video\s+Editing|Audio\s+Editing|Editing|Director\x27?s?)\s+(?:Tips?|Notes?|Setup|Workflow|Instructions?)(?:\*{1,2})?[:\s\-–—]'
        r'|(?:[*-]\s*)?(?:\*{1,2})?(?:Editing\s+Tips?|Production\s+Notes?|Director\x27?s?\s+Notes?|Hook\s+Impact|Setup\s+to\s+Twist)(?:\*{1,2})?[:\-–—]'
        r')',
        re.IGNORECASE
    )

    # Metadata field extractors
    FIELD_PATTERNS = {
        "scene": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Scene|Visual Scene|Visual|Setting)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "sample_context": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Sample Context|Context|Delivery Context|Emotional Context)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "audio_profile": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Audio Profile|Profile|Speaker Profile|Persona|Character Profile)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "speaker": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Speaker|Narrator|Voice Actor)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "style": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Style|Delivery Style|Tone|Speaking Style)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "pace": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Pace|Speed|Cadence)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "accent": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Accent|Language Accent|Dialect)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "voice": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Voice|Voice Name|TTS Voice|Recommended Voice)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ],
        "director_notes": [
            r'^[ \t]*[-*]?[ \t]*(?:\*\*)?(?:Director Notes|Director\'s Notes|Director Note|Direction)(?:\*\*)?[:\s]+["\']?(.*?)["\']?$',
        ]
    }

    @classmethod
    def parse_batch_text(cls, raw_text: str, default_voice: str = "Algenib") -> List[Dict[str, Any]]:
        """
        Parses full pasted batch reference into a list of structured paragraph dictionaries.
        """
        if not raw_text or not raw_text.strip():
            return []

        clean_text = raw_text.strip().replace("\r\n", "\n")

        # Find all Part/Paragraph headers
        matches = list(cls.PARAGRAPH_SPLIT_REGEX.finditer(clean_text))

        if not matches:
            # Fallback to single paragraph
            return [cls._parse_single_block(clean_text, 1, default_voice)]

        parsed_paragraphs: List[Dict[str, Any]] = []

        for idx, m in enumerate(matches):
            start = m.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(clean_text)
            block = clean_text[start:end].strip()

            parsed = cls._parse_single_block(block, idx + 1, default_voice)
            if parsed["transcript"] or parsed["scene"] or parsed["director_notes"]:
                parsed_paragraphs.append(parsed)

        return parsed_paragraphs

    @classmethod
    def _clean_markdown_line(cls, line: str) -> str:
        l = re.sub(r'^\s*[-*+]\s+', '', line).strip()
        l = re.sub(r'\*\*([^*]+)\*\*', r'\1', l)
        return l.strip()

    @classmethod
    def _clean_transcript_line(cls, line: str) -> str:
        l = line.strip()
        if l.startswith('>'):
            l = l[1:].strip()
        # Normalize `[tag]` to [tag]
        l = re.sub(r'\`(\[[^\]]+\])\`', r'\1', l)
        return l

    @classmethod
    def _match_metadata_field(cls, clean_line: str, metadata: dict) -> bool:
        """Helper to match metadata fields including pipe-separated key-values."""
        if "|" in clean_line and ":" in clean_line:
            pipe_segments = [seg.strip() for seg in clean_line.split("|") if seg.strip()]
            matched_any = False
            for seg in pipe_segments:
                s_clean = cls._clean_markdown_line(seg)
                for field, patterns in cls.FIELD_PATTERNS.items():
                    for pat in patterns:
                        m = re.match(pat, s_clean, re.IGNORECASE)
                        if m:
                            metadata[field] = m.group(1).strip().strip('"\'')
                            matched_any = True
                            break
            if matched_any:
                return True

        for field, patterns in cls.FIELD_PATTERNS.items():
            for pat in patterns:
                m = re.match(pat, clean_line, re.IGNORECASE)
                if m:
                    metadata[field] = m.group(1).strip().strip('"\'')
                    return True
        return False

    @classmethod
    def _extract_metadata(cls, lines: list, metadata: dict, additional_notes: list):
        """Extracts metadata from non-transcript lines."""
        for line in lines:
            raw_s = line.strip()
            clean_s = cls._clean_markdown_line(raw_s)
            if not clean_s or clean_s == "---":
                continue
            if re.match(r'^(?:#{1,6}\s*)?(?:\*{1,2})?(?:Playground Setup|Setup|Voice Setup|Parameters)[:\s]*(?:\*{1,2})?$', clean_s, re.I):
                continue
            if cls.PART_HEADER_REGEX.match(raw_s) or cls.PART_HEADER_REGEX.match(clean_s):
                continue

            matched = cls._match_metadata_field(clean_s, metadata)
            if not matched and not clean_s.startswith("#"):
                additional_notes.append(clean_s)

    @classmethod
    def _parse_single_block(cls, block_text: str, index: int, default_voice: str) -> Dict[str, Any]:
        """
        Parses a single paragraph/part block text into metadata and transcript.
        """
        lines = block_text.split("\n")

        paragraph_number = index
        part_name = f"Part {index}"

        # 1. Check for Part header in the first few lines
        for line in lines[:4]:
            header_match = cls.PART_HEADER_REGEX.match(line.strip())
            if header_match:
                try:
                    paragraph_number = int(header_match.group(1))
                except (ValueError, TypeError):
                    paragraph_number = index
                subtitle = header_match.group(2).strip()
                subtitle_clean = re.sub(r'^\*{1,2}|\*{1,2}$', '', subtitle).strip()
                part_name = f"Part {paragraph_number}" + (f": {subtitle_clean}" if subtitle_clean else "")
                break

        # 2. Check for explicit script header
        script_start_idx = -1
        for idx, line in enumerate(lines):
            cleaned_header_line = re.sub(r'^\s*[-*+]\s+', '', line).strip()
            if cls.SCRIPT_HEADER_REGEX.match(cleaned_header_line):
                script_start_idx = idx
                break

        metadata: Dict[str, Any] = {
            "scene": "",
            "sample_context": "",
            "audio_profile": "",
            "speaker": "",
            "style": "Newscaster",
            "pace": "Natural",
            "accent": "Neutral",
            "voice": default_voice,
            "director_notes": "",
            "additional_notes": "",
        }

        additional_notes_lines: List[str] = []
        cleaned_transcript_lines: List[str] = []

        if script_start_idx != -1:
            metadata_lines = lines[:script_start_idx]
            raw_transcript_lines = lines[script_start_idx + 1:]

            # Process metadata
            cls._extract_metadata(metadata_lines, metadata, additional_notes_lines)

            # Process transcript lines
            for l in raw_transcript_lines:
                raw_l = l.strip()
                if not raw_l:
                    if cleaned_transcript_lines and cleaned_transcript_lines[-1] != "":
                        cleaned_transcript_lines.append("")
                    continue

                is_blockquote = raw_l.startswith(">")
                cl = cls._clean_transcript_line(raw_l)

                # Spoken blockquote: ALWAYS keep, NEVER break on footer checks
                if is_blockquote:
                    cleaned_transcript_lines.append(cl)
                    continue

                # Non-blockquote line: check if footer / editing tip / separator
                if cls.FOOTER_LINE_REGEX.match(raw_l) or cls.FOOTER_LINE_REGEX.match(cl):
                    break

                cleaned_transcript_lines.append(cl)

        else:
            # Check if block has markdown blockquotes (>)
            has_blockquotes = any(l.strip().startswith(">") for l in lines)

            if has_blockquotes:
                metadata_lines = []
                for l in lines:
                    raw_l = l.strip()
                    if raw_l.startswith(">"):
                        cleaned_transcript_lines.append(cls._clean_transcript_line(raw_l))
                    else:
                        metadata_lines.append(l)

                cls._extract_metadata(metadata_lines, metadata, additional_notes_lines)
            else:
                # Fallback: scan lines for metadata vs transcript
                in_transcript = False
                for l in lines:
                    raw_l = l.strip()
                    clean_l = cls._clean_markdown_line(raw_l)

                    if not raw_l or clean_l == "---":
                        continue

                    # Part header
                    if cls.PART_HEADER_REGEX.match(raw_l) or cls.PART_HEADER_REGEX.match(clean_l):
                        continue

                    # Footer check
                    if cls.FOOTER_LINE_REGEX.match(raw_l) or cls.FOOTER_LINE_REGEX.match(clean_l):
                        break

                    # Check metadata
                    matched = cls._match_metadata_field(clean_l, metadata)
                    if matched:
                        continue

                    # Check if transcript line
                    cl = cls._clean_transcript_line(raw_l)
                    if cl.startswith("[") or in_transcript:
                        in_transcript = True
                        cleaned_transcript_lines.append(cl)
                    else:
                        additional_notes_lines.append(clean_l)

        raw_transcript = "\n".join(cleaned_transcript_lines).strip()
        # Collapse 3+ consecutive newlines to 2
        raw_transcript = re.sub(r'\n{3,}', '\n\n', raw_transcript)

        # Clean additional notes
        if additional_notes_lines:
            metadata["additional_notes"] = "\n".join(additional_notes_lines).strip()

        # Calculate word and char count
        cleaned_for_count = re.sub(r'\[.*?\]', '', raw_transcript).strip()
        words = len(cleaned_for_count.split()) if cleaned_for_count else 0
        characters = len(raw_transcript)

        return {
            "paragraph_number": paragraph_number,
            "part_number": part_name,
            "scene": metadata["scene"] or None,
            "sample_context": metadata["sample_context"] or None,
            "audio_profile": metadata["audio_profile"] or None,
            "speaker": metadata["speaker"] or None,
            "style": metadata["style"] or "Newscaster",
            "pace": metadata["pace"] or "Natural",
            "accent": metadata["accent"] or "Neutral",
            "voice": metadata["voice"] or default_voice,
            "director_notes": metadata["director_notes"] or None,
            "additional_notes": metadata["additional_notes"] or None,
            "transcript": raw_transcript,
            "word_count": words,
            "character_count": characters,
            "raw_reference": block_text.strip(),
            "status": "READY" if raw_transcript else "DRAFT"
        }
