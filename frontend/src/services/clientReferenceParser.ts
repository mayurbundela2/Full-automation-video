/**
 * Client-Side Reference Parser & Prompt Builder for Android Standalone App & Web Frontend.
 * Parses multi-part AI Studio Markdown scripts, splits into paragraph parts, and extracts director metadata.
 */

export interface ParsedParagraphData {
  paragraph_number: number;
  part_number?: string;
  scene?: string;
  sample_context?: string;
  audio_profile?: string;
  speaker?: string;
  style?: string;
  pace?: string;
  accent?: string;
  voice?: string;
  on_screen_text?: string;
  video_prompt?: string;
  scene_progression?: string;
  overall_mood?: string;
  sound_effects?: string;
  background_music?: string;
  voice_over_alignment?: string;
  media_path?: string;
  media_type?: string;
  transcript: string;
  raw_reference?: string;
}

export class ClientReferenceParser {
  public static parseBatch(rawText: string, defaultVoice: string = 'Algenib'): ParsedParagraphData[] {
    const text = rawText.trim().replace(/\r\n/g, '\n');
    if (!text) return [];

    // Check header priority: if "Part 1" exists, only split on Part/Paragraph, not on Video SHOT inside it
    let headerRegex: RegExp;
    if (/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*{1,2})?Part\s+\d+/i.test(text)) {
      headerRegex = /(?:^|\n)\s*(?:---\s*\n\s*)?(?:#{1,6}\s*)?(?:\*{1,2})?Part\s*(\d+)[:\s—\-&]*(.*?)(?:\*{1,2})?(?=\n|$)/gi;
    } else if (/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*{1,2})?Paragraph\s+\d+/i.test(text)) {
      headerRegex = /(?:^|\n)\s*(?:---\s*\n\s*)?(?:#{1,6}\s*)?(?:\*{1,2})?Paragraph\s*(\d+)[:\s—\-&]*(.*?)(?:\*{1,2})?(?=\n|$)/gi;
    } else {
      headerRegex = /(?:^|\n)\s*(?:---\s*\n\s*)?(?:#{1,6}\s*)?(?:\*{1,2})?(?:Part|Paragraph|Scene|Section|Shot|Video\s+SHOT)\s*(\d+)[:\s—\-&]*(.*?)(?:\*{1,2})?(?=\n|$)/gi;
    }

    const matches: { index: number; fullMatch: string; partNum: number; subtitle: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = headerRegex.exec(text)) !== null) {
      const partNum = parseInt(match[1], 10);
      const subtitle = (match[2] || '').trim().replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      matches.push({
        index: match.index,
        fullMatch: match[0],
        partNum,
        subtitle,
      });
    }

    if (matches.length === 0) {
      return [this.parseSingleBlock(text, 1, `Part 1`, defaultVoice)];
    }

    const results: ParsedParagraphData[] = [];

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const start = current.index;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const block = text.substring(start, end).trim();
      if (!block) continue;

      const partLabel = current.subtitle
        ? `Part ${current.partNum}: ${current.subtitle}`
        : `Part ${current.partNum}`;

      results.push(this.parseSingleBlock(block, current.partNum || (i + 1), partLabel, defaultVoice));
    }

    return results;
  }

  private static parseSingleBlock(
    block: string,
    pNum: number,
    partLabel: string,
    defaultVoice: string
  ): ParsedParagraphData {
    const lines = block.split('\n');

    const data: Record<string, string[]> = {
      script: [],
      scene: [],
      sample_context: [],
      audio_profile: [],
      speaker: [],
      style: [],
      pace: [],
      accent: [],
      voice: [],
      voice_over_alignment: [],
      on_screen_text: [],
      video_prompt: [],
      scene_progression: [],
      overall_mood: [],
      sound_effects: [],
      background_music: [],
    };

    // Heading patterns in order of specificity
    const HEADING_PATTERNS: [string, RegExp][] = [
      ['script', /^(?:Formatted\s+Script\s+to\s+Copy[\s\-]*Paste|Formatted\s+Script|Script\s+to\s+Copy[\s\-]*Paste|Script|Transcript|Spoken\s+Text)[:\s]*$/i],
      ['voice_over_alignment', /^(?:Voice[\s\-]*over\s*&\s*Subtitle\s*Al[ie]gnment|Subtitle\s*Al[ie]gnment|Voice[\s\-]*over\s*Al[ie]gnment)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['on_screen_text', /^(?:On[\s\-]*screen\s*text|Screen\s*text)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['video_prompt', /^(?:Video[\s\-]*prompt|Visual[\s\-]*prompt|Google[\s\-]*Flow[\s\-]*prompt)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['sound_effects', /^(?:Sound\s*effects?|SFX)(?:[a-zA-Z\s\-–—]*\([^)]*\))?[:\s]*$/i],
      ['background_music', /^(?:Background\s*music|BGM|Music)(?:[a-zA-Z\s\-–—]*\([^)]*\))?[:\s]*$/i],
      ['scene_progression', /^(?:Scene\s*progression|Visual\s*progression)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['overall_mood', /^(?:Overall\s*mood|Overall\s*modd|Mood)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['scene', /^(?:Scene|Visual\s*Scene)(?!\s*progression)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['sample_context', /^(?:Sample\s*context|Context|Delivery\s*context)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['audio_profile', /^(?:Audio\s*profile|Speaker\s*profile|Persona)(?:\s*\([^)]*\))?[:\s]*$/i],
      ['style', /^(?:Style|Delivery\s*style|Tone)(?:\s*\([^)]*\))?[:\s]*$/i],
    ];

    let currentSection: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (currentSection && data[currentSection].length > 0 && data[currentSection][data[currentSection].length - 1] !== '') {
          data[currentSection].push('');
        }
        continue;
      }

      // Check if line is Part/Shot banner: e.g. "VIDEO SHOT 1 — [0:00–0:10]..." or "Part 1: ..."
      if (/^(?:#{1,6}\s*)?(?:\*{1,2})?(?:Part|Paragraph|Shot|Video\s+SHOT)\s*\d+.*$/i.test(line)) {
        currentSection = null;
        continue;
      }

      if (/^(?:Playground\s+Setup|Setup)[:\s]*$/i.test(line)) {
        currentSection = null;
        continue;
      }

      // Check for piped line: e.g. "Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib"
      if (line.includes('|') && (line.includes(':') || line.includes('Voice'))) {
        currentSection = null;
        const segments = line.split('|');
        for (const seg of segments) {
          const s = seg.trim();
          const colIdx = s.indexOf(':');
          if (colIdx !== -1) {
            const k = s.substring(0, colIdx).trim().toLowerCase();
            const v = s.substring(colIdx + 1).trim();
            if (k.includes('style')) data.style.push(v);
            else if (k.includes('pace') || k.includes('speed')) data.pace.push(v);
            else if (k.includes('accent')) data.accent.push(v);
            else if (k.includes('voice')) data.voice.push(v);
          }
        }
        continue;
      }

      let clean = line.replace(/^[-*+]\s+/, '').trim();
      clean = clean.replace(/^\*{1,2}|\*{1,2}$/g, '').trim();

      // Check if line matches a new section heading
      let matchedSection: string | null = null;
      let remainingContent = '';

      for (const [secName, secRegex] of HEADING_PATTERNS) {
        const colIdx = clean.indexOf(':');
        if (colIdx !== -1) {
          const headPrefix = clean.substring(0, colIdx + 1).trim();
          if (secRegex.test(headPrefix)) {
            matchedSection = secName;
            remainingContent = clean.substring(colIdx + 1).trim().replace(/^["']|["']$/g, '');
            break;
          }
        } else if (secRegex.test(clean)) {
          matchedSection = secName;
          remainingContent = '';
          break;
        }
      }

      if (matchedSection) {
        currentSection = matchedSection;
        if (remainingContent) {
          data[currentSection].push(remainingContent);
        }
      } else if (currentSection) {
        // Strip outer quotes if any
        let contentLine = line;
        if (contentLine.startsWith('>') && currentSection === 'script') {
          contentLine = contentLine.substring(1).trim();
        }
        data[currentSection].push(contentLine);
      }
    }

    const cleanField = (arr: string[]) => {
      let text = arr.join('\n').trim();
      // Remove leading/trailing stray quote marks if wrapping entire block
      if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
        text = text.substring(1, text.length - 1).trim();
      }
      return text;
    };

    const transcript = cleanField(data.script) || block;

    return {
      paragraph_number: pNum,
      part_number: partLabel,
      scene: cleanField(data.scene) || undefined,
      sample_context: cleanField(data.sample_context) || undefined,
      audio_profile: cleanField(data.audio_profile) || undefined,
      speaker: cleanField(data.speaker) || undefined,
      style: cleanField(data.style) || 'Newscaster',
      pace: cleanField(data.pace) || 'Natural',
      accent: cleanField(data.accent) || 'Neutral',
      voice: cleanField(data.voice) || defaultVoice || 'Algenib',
      voice_over_alignment: cleanField(data.voice_over_alignment) || undefined,
      on_screen_text: cleanField(data.on_screen_text) || undefined,
      video_prompt: cleanField(data.video_prompt) || undefined,
      scene_progression: cleanField(data.scene_progression) || undefined,
      overall_mood: cleanField(data.overall_mood) || undefined,
      sound_effects: cleanField(data.sound_effects) || undefined,
      background_music: cleanField(data.background_music) || undefined,
      transcript,
      raw_reference: block,
    };
  }

  private static extractField(text: string, callback: (key: string, val: string) => void): void {
    const cleaned = text.replace(/^[-*+]\s+/, '').replace(/\*\*/g, '').trim();
    const match = cleaned.match(/^([A-Za-z0-9\s\-–—()]+)[:=]\s*["']?(.*?)["']?$/);
    if (!match) return;

    const rawKey = match[1].trim().toLowerCase();
    const val = match[2].trim().replace(/^["']|["']$/g, '');

    if (rawKey.includes('screen') && rawKey.includes('text')) callback('on_screen_text', val);
    else if (rawKey.includes('video') && (rawKey.includes('prompt') || rawKey.includes('flow'))) callback('video_prompt', val);
    else if (rawKey.includes('progression')) callback('scene_progression', val);
    else if (rawKey.includes('mood') || rawKey.includes('modd')) callback('overall_mood', val);
    else if (rawKey.includes('sound') || rawKey.includes('sfx')) callback('sound_effects', val);
    else if (rawKey.includes('music') || rawKey.includes('bgm')) callback('background_music', val);
    else if (rawKey.includes('alignment') || rawKey.includes('alingment') || rawKey.includes('voice-over') || rawKey.includes('subtitle')) callback('voice_over_alignment', val);
    else if (rawKey.includes('scene') || rawKey.includes('visual')) callback('scene', val);
    else if (rawKey.includes('context')) callback('context', val);
    else if (rawKey.includes('audio') || rawKey.includes('profile')) callback('audio', val);
    else if (rawKey.includes('speaker') || rawKey.includes('narrator')) callback('speaker', val);
    else if (rawKey.includes('style') || rawKey.includes('tone')) callback('style', val);
    else if (rawKey.includes('pace') || rawKey.includes('speed') || rawKey.includes('pacing')) callback('pace', val);
    else if (rawKey.includes('accent')) callback('accent', val);
    else if (rawKey.includes('voice')) callback('voice', val);
  }

  public static buildPrompt(data: Partial<ParsedParagraphData>): string {
    const instructions: string[] = [];
    if (data.scene) instructions.push(`Scene: ${data.scene}`);
    if (data.sample_context) instructions.push(`Context: ${data.sample_context}`);
    if (data.audio_profile) instructions.push(`Audio Profile: ${data.audio_profile}`);
    if (data.speaker) instructions.push(`Speaker: ${data.speaker}`);
    if (data.style) instructions.push(`Style: ${data.style}`);
    if (data.pace) instructions.push(`Pacing: ${data.pace}`);
    if (data.accent) instructions.push(`Accent: ${data.accent}`);

    const header = instructions.length > 0
      ? `Director Guidance:\n${instructions.map((i) => `- ${i}`).join('\n')}\n\n`
      : '';

    return `${header}Spoken Transcript:\n${data.transcript || ''}`.trim();
  }
}
