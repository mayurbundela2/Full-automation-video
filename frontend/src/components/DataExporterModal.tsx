import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, Copy, Check, Download, Sparkles, X, 
  Mic, Clapperboard, Type, Volume2, Music, Film, AlignLeft, 
  Eye, RefreshCw, Layers, SlidersHorizontal, CheckSquare, Square,
  Zap, Minimize2
} from 'lucide-react';
import { ClientReferenceParser, ParsedParagraphData } from '../services/clientReferenceParser';

interface DataExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScript?: string;
}

export type HeadingKey = 
  | 'script'
  | 'video_prompt'
  | 'on_screen_text'
  | 'scene'
  | 'sample_context'
  | 'audio_profile'
  | 'style'
  | 'voice_over_alignment'
  | 'scene_progression'
  | 'overall_mood'
  | 'sound_effects'
  | 'background_music';

interface HeadingOption {
  key: HeadingKey;
  label: string;
  exactPromptTag: string;
  section: 'audio' | 'video';
  icon: any;
  color: string;
  activeColor: string;
}

const HEADING_OPTIONS: HeadingOption[] = [
  // Audio Generation Section
  {
    key: 'script',
    label: 'Formatted Script to Copy-paste',
    exactPromptTag: 'Formatted Script to Copy-paste',
    section: 'audio',
    icon: Mic,
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20',
    activeColor: 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/50',
  },
  {
    key: 'scene',
    label: 'Scene :',
    exactPromptTag: 'Playground setup: Scene :',
    section: 'audio',
    icon: AlignLeft,
    color: 'text-blue-300 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20',
    activeColor: 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/50',
  },
  {
    key: 'sample_context',
    label: 'sample context:',
    exactPromptTag: 'Playground setup: sample context:',
    section: 'audio',
    icon: AlignLeft,
    color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20',
    activeColor: 'bg-cyan-600 text-white border-cyan-400 shadow-lg shadow-cyan-600/30 ring-2 ring-cyan-400/50',
  },
  {
    key: 'audio_profile',
    label: 'Audio profile:',
    exactPromptTag: 'Playground setup: Audio profile:',
    section: 'audio',
    icon: Mic,
    color: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20',
    activeColor: 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/50',
  },
  {
    key: 'style',
    label: 'Style:',
    exactPromptTag: 'Playground setup: Style:',
    section: 'audio',
    icon: SlidersHorizontal,
    color: 'text-violet-300 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20',
    activeColor: 'bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-600/30 ring-2 ring-violet-400/50',
  },

  // Video Production Section
  {
    key: 'video_prompt',
    label: 'Video-prompt (google flow - 10 second silent videos, visual only):',
    exactPromptTag: 'Video-prompt(google flow - 10 second silent videos, visula only ):',
    section: 'video',
    icon: Clapperboard,
    color: 'text-purple-300 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20',
    activeColor: 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30 ring-2 ring-purple-400/50',
  },
  {
    key: 'on_screen_text',
    label: 'on screen text :',
    exactPromptTag: 'on screen text :',
    section: 'video',
    icon: Type,
    color: 'text-amber-300 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
    activeColor: 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-600/30 ring-2 ring-amber-400/50',
  },
  {
    key: 'voice_over_alignment',
    label: 'voice-over & subtitle alingment:',
    exactPromptTag: 'voice-over & subtitle alingment:',
    section: 'video',
    icon: Film,
    color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20',
    activeColor: 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/50',
  },
  {
    key: 'scene_progression',
    label: 'scene progression:',
    exactPromptTag: 'scene progression:',
    section: 'video',
    icon: Film,
    color: 'text-sky-300 border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20',
    activeColor: 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30 ring-2 ring-sky-400/50',
  },
  {
    key: 'overall_mood',
    label: 'overall modd:',
    exactPromptTag: 'overall modd:',
    section: 'video',
    icon: Eye,
    color: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/20',
    activeColor: 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-lg shadow-fuchsia-600/30 ring-2 ring-fuchsia-400/50',
  },
  {
    key: 'sound_effects',
    label: 'sound effects s(SFX-add in the editor):',
    exactPromptTag: 'sound effects s(SFX-add in the editor):',
    section: 'video',
    icon: Volume2,
    color: 'text-teal-300 border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20',
    activeColor: 'bg-teal-600 text-white border-teal-400 shadow-lg shadow-teal-600/30 ring-2 ring-teal-400/50',
  },
  {
    key: 'background_music',
    label: 'background music(add in editor):',
    exactPromptTag: 'background music(add in editor):',
    section: 'video',
    icon: Music,
    color: 'text-pink-300 border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20',
    activeColor: 'bg-pink-600 text-white border-pink-400 shadow-lg shadow-pink-600/30 ring-2 ring-pink-400/50',
  },
];

const DEFAULT_SAMPLE_SCRIPT = `Part 1: COLD OPEN — Aaj Tumne Kya Khaya? (Paragraph 1)
Playground Setup:
Scene: "Narrator engaging viewer directly with relatable food questions."
Sample Context: "Hook the viewer with familiar comfort food references."
Audio Profile: "Conversational, casual, inviting."
Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib
Formatted Script to Copy-Paste:
[conversational] [reflective]
Aaj tumne kya khaya? Maggie? Pizza?
[conversational]
Ghar ka dal chawal? Ya raat ke do baje wala Kurkure?
VIDEO SHOT 1 — [0:00–0:10] (10 seconds) — THE MIDNIGHT MEAL
Voice-over & Subtitle Alignment (SRT: 0:00–0:10):
0:00–0:05: "[conversational] [reflective] Aaj tumne kya khaya? Maggie? Pizza?"
0:05–0:10: "[conversational] Ghar ka dal chawal? Ya raat ke do baje wala Kurkure?"
On-screen text (add in editor):
AAJ TUMNE KYA KHAYA?
Video prompt (Google Flow — 10 second silent video, visuals only):
"Flat 2D vector cartoon animation, 10 seconds, hand-drawn cartoon aesthetic with soft crayon shading and warm painterly background, NO photorealism, NO 3D, NO text, NO captions, silent visual only.
Character throughout: Flat 2D vector cartoon character, round white spherical head, black dot eyes, single-line mouth (closed, motionless), no nose, spiky black hair on top, wearing a simple grey hoodie and dark pants.
Scene progression:
0-3 seconds: Character sits alone at a wooden table in a dimly lit kitchen at night, looking down at an empty blue plate.
3-6 seconds: A bowl of steaming noodles and a slice of pizza smoothly slide onto the table from opposite sides.
6-8 seconds: A traditional steel plate of dal chawal and a bright snack packet pop onto the tabletop around the character.
8-10 seconds: Character rests chin in palm, staring down at the feast with a contemplative gaze.
Overall mood: Introspective late-night vibe. Minimalist children's book illustration style with soft crayon-like shading."
Sound effects (SFX — add in editor):
Scene Progression 0–3s (Kitchen stillness): Faint hum of refrigerator ambient at 15%
Scene Progression 3–6s (Plates sliding): Gentle ceramic slide and subtle steam hiss at 25%
Scene Progression 6–8s (Metal plate & packet): Soft metallic clink and crinkling foil at 30%
Scene Progression 8–10s (Character settling): Quiet elbow thud on wooden table at 20%
Background music (add in editor):
Light, curious lo-fi acoustic guitar with subtle felt piano, thoughtful and warm, ducked at -18dB.
Part 2: COLD OPEN — Common Factor (Paragraph 2)
Playground Setup:
Scene: "Emphasizing the hidden commonality behind all cooked meals."
Sample Context: "Make the audience pause and realize an invisible reality."
Audio Profile: "Reflective, steady, intriguing."
Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib
Formatted Script to Copy-Paste:
[reflective] [intimate]
Chahe kuch bhi khaya ho... ek cheez common thi.
[deep]
Wo pakaya hua tha... Aur ye baat itni normal lagti hai ki tumne kabhi socha bhi nahi hoga.
VIDEO SHOT 2 — [0:10–0:20] (10 seconds) — THE STEAMING COMMONALITY
Voice-over & Subtitle Alignment (SRT: 0:10–0:20):
0:10–0:15: "[reflective] [intimate] Chahe kuch bhi khaya ho... ek cheez common thi."
0:15–0:20: "[deep] Wo pakaya hua tha... Aur ye baat itni normal lagti hai ki tumne kabhi socha bhi nahi hoga."
On-screen text (add in editor):
SAB KUCH PAKAYA HUA THA
Video prompt (Google Flow — 10 second silent video, visuals only):
"Flat 2D vector cartoon animation, 10 seconds, hand-drawn cartoon aesthetic with soft crayon shading and warm painterly background, NO photorealism, NO 3D, NO text, NO captions, silent visual only.
Character throughout: Flat 2D vector cartoon character, round white spherical head, black dot eyes, single-line mouth (closed, motionless), no nose, spiky black hair on top, wearing a simple grey hoodie and dark pants.
Scene progression:
0-3 seconds: Camera pushes in close toward the food on the table, showing soft vapor curls rising into the warm ambient light.
3-6 seconds: The food items dissolve into warm golden glowing outlines, highlighting heat and cooking energy.
6-8 seconds: Camera shifts slightly up to show the character's face, staring straight ahead with wide black dot eyes in realization.
8-10 seconds: The character slowly blinks once, background darkening slightly to put focus on their thoughtful posture.
Overall mood: Sudden subtle revelation. Minimalist children's book illustration style with soft crayon-like shading."
Sound effects (SFX — add in editor):
Scene Progression 0–3s (Steam rising): Soft, airy heat sizzle/steam simmer at 20%
Scene Progression 3–6s (Golden outline glow): Warm low frequency sine swell at 25%
Scene Progression 6–8s (Camera pull up): Gentle subtle whoosh at 15%
Scene Progression 8–10s (Blink & stillness): Clean, hollow wood block tap at 15%
Background music (add in editor):
Pensive ambient keys and gentle suspended cello note, ducked at -20dB.
Part 3: COLD OPEN — Animal Kingdom Raw Reality (Paragraph 3)
Playground Setup:
Scene: "Contrasting humans with wild animal feeding habits."
Sample Context: "Deliver a factual and grounded reality check about nature."
Audio Profile: "Informative, objective, dramatic shift."
Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib
Formatted Script to Copy-Paste:
[conversational] [somber]
Lekin ruk... Duniya mein millions of animal species hain.
[conversational]
Har ek janwar, har ek pakshi, har ek machhli... sab kachha khaana khaate hain.
VIDEO SHOT 3 — [0:20–0:30] (10 seconds) — THE WILD RAW WORLD
Voice-over & Subtitle Alignment (SRT: 0:20–0:30):
0:20–0:25: "[conversational] [somber] Lekin ruk... Duniya mein millions of animal species hain."
0:25–0:30: "[conversational] Har ek janwar, har ek pakshi, har ek machhli... sab kachha khaana khaate hain."
On-screen text (add in editor):
LAKHON SPECIES — SAB KACHHA
Video prompt (Google Flow — 10 second silent video, visuals only):
"Flat 2D vector cartoon animation, 10 seconds, hand-drawn cartoon aesthetic with soft crayon shading and warm painterly background, NO photorealism, NO 3D, NO text, NO captions, silent visual only.
Character throughout: Flat 2D vector cartoon character, round white spherical head, black dot eyes, single-line mouth (closed, motionless), no nose, spiky black hair on top, wearing a simple grey hoodie and dark pants.
Scene progression:
0-3 seconds: The domestic kitchen backdrop fades away, replaced by an expansive emerald green savannah and forest clearing.
3-6 seconds: Character stands at the edge of frame watching stylized flat cartoon animals: a bird catching a raw worm, a deer grazing raw shrubs.
6-8 seconds: A fish leaps from a turquoise stream snapping a tiny raw fly in mid-air.
8-10 seconds: Character remains standing still on the forest edge, observing the untouched wild landscape quietly.
Overall mood: Untamed natural ecosystem. Minimalist children's book illustration style with soft crayon-like shading."
Sound effects (SFX — add in editor):
Scene Progression 0–3s (Transition to nature): Rustling dry savannah wind and distance bird call at 25%
Scene Progression 3–6s (Animals grazing): Light crunch of raw twigs and foliage rustle at 25%
Scene Progression 6–8s (Fish splash): Crisp water droplet splash at 30%
Scene Progression 8–10s (Nature ambience): Gentle sustained jungle breeze at 20%
Background music (add in editor):
Rhythmic muted acoustic percussion with earthy upright bass, curious and rhythmic, ducked at -18dB.
Part 4: COLD OPEN — Predators vs Primates (Paragraph 4)
Playground Setup:
Scene: "Showing immediate raw consumption in predators and primates."
Sample Context: "Illustrate the direct nature of raw food in the animal kingdom."
Audio Profile: "Punchy, clear, descriptive."
Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib
Formatted Script to Copy-Paste:
[conversational]
Sher shikaar karke turant khaata hai...
[conversational] [reflective]
Bandar phal todkar seedha muh mein daalta hai.
VIDEO SHOT 4 — [0:30–0:40] (10 seconds) — NATURE'S INSTANT DIET
Voice-over & Subtitle Alignment (SRT: 0:30–0:40):
0:30–0:35: "[conversational] Sher shikaar karke turant khaata hai..."
0:35–0:40: "[conversational] [reflective] Bandar phal todkar seedha muh mein daalta hai."
On-screen text (add in editor):
KACHHA SHIKAAR, DIRECT CONSUMPTION
Video prompt (Google Flow — 10 second silent video, visuals only):
"Flat 2D vector cartoon animation, 10 seconds, hand-drawn cartoon aesthetic with soft crayon shading and warm painterly background, NO photorealism, NO 3D, NO text, NO captions, silent visual only.
Character throughout: Flat 2D vector cartoon character, round white spherical head, black dot eyes, single-line mouth (closed, motionless), no nose, spiky black hair on top, wearing a simple grey hoodie and dark pants.
Scene progression:
0-3 seconds: Split panel view; on the left, a stylized flat 2D cartoon lion stands over fresh raw prey under an amber sky.
3-6 seconds: On the right panel, a flat cartoon monkey sits on a jungle branch, plucking an unripe green berry straight from a twig.
6-8 seconds: The monkey brings the berry instantly toward its mouth without hesitation.
8-10 seconds: Panels merge back to the full frame where our grey-hoodie character stands watching both in thoughtful silence.
Overall mood: Raw wild authenticity. Minimalist children's book illustration style with soft crayon-like shading."
Sound effects (SFX — add in editor):
Scene Progression 0–3s (Lion presence): Low animal growl rumble and grass rustle at 25%
Scene Progression 3–6s (Branch snapping): Crisp twig snap and leaf shake at 30%
Scene Progression 6–8s (Berry pluck): Clean organic 'pop' and wet crunch at 25%
Scene Progression 8–10s (Split merge): Soft swoosh transitioning to ambient breeze at 20%
Background music (add in editor):
Tribal-inspired muted marimba and warm bass pulse, ducked at -19dB.`;

export const DataExporterModal: React.FC<DataExporterModalProps> = ({
  isOpen,
  onClose,
  initialScript = '',
}) => {
  const [rawText, setRawText] = useState<string>(initialScript || DEFAULT_SAMPLE_SCRIPT);
  const [parsedShots, setParsedShots] = useState<ParsedParagraphData[]>(() => {
    return ClientReferenceParser.parseBatch(initialScript || DEFAULT_SAMPLE_SCRIPT);
  });
  
  // MULTI-SELECTION STATE: User can select multiple headings at once
  const [selectedHeadings, setSelectedHeadings] = useState<HeadingKey[]>(['script']);
  const [showHeadingLabels, setShowHeadingLabels] = useState<boolean>(true);
  const [isNoSpaceMode, setIsNoSpaceMode] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showScriptInput, setShowScriptInput] = useState<boolean>(!initialScript.trim());
  const [viewFormat, setViewFormat] = useState<'numbered_list' | 'cards'>('numbered_list');

  const handleParse = (text?: string) => {
    const textToParse = text !== undefined ? text : rawText;
    if (!textToParse.trim()) return;
    const parsed = ClientReferenceParser.parseBatch(textToParse);
    setParsedShots(parsed);
    setShowScriptInput(false);
  };

  const handleLoadSample = () => {
    setRawText(DEFAULT_SAMPLE_SCRIPT);
    handleParse(DEFAULT_SAMPLE_SCRIPT);
  };

  // Toggle heading selection
  const toggleHeading = (key: HeadingKey) => {
    setSelectedHeadings((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  // Quick Preset Handlers
  const selectOnlyScript = () => {
    setSelectedHeadings(['script']);
    setIsNoSpaceMode(false);
  };
  const selectOnlyVideoPrompts = () => {
    setSelectedHeadings(['video_prompt']);
    setIsNoSpaceMode(false);
  };
  const selectScriptAndVideoPrompts = () => {
    setSelectedHeadings(['script', 'video_prompt']);
    setIsNoSpaceMode(false);
  };
  const selectScriptPromptsAndText = () => {
    setSelectedHeadings(['script', 'video_prompt', 'on_screen_text']);
    setIsNoSpaceMode(false);
  };
  const selectFlowVideoCompact = () => {
    setSelectedHeadings(['video_prompt', 'scene_progression', 'sound_effects', 'overall_mood']);
    setIsNoSpaceMode(true);
    setShowHeadingLabels(true);
  };
  const selectAll = () => setSelectedHeadings(HEADING_OPTIONS.map((h) => h.key));
  const selectAllAudio = () => setSelectedHeadings(HEADING_OPTIONS.filter((h) => h.section === 'audio').map((h) => h.key));
  const selectAllVideo = () => setSelectedHeadings(HEADING_OPTIONS.filter((h) => h.section === 'video').map((h) => h.key));

  // Extracts data for any specific heading from a shot
  const getShotValue = (shot: ParsedParagraphData, key: HeadingKey): string => {
    switch (key) {
      case 'script':
        return shot.transcript || '';
      case 'video_prompt':
        return shot.video_prompt || '';
      case 'on_screen_text':
        return shot.on_screen_text || '';
      case 'scene':
        return shot.scene || '';
      case 'sample_context':
        return shot.sample_context || '';
      case 'audio_profile':
        return shot.audio_profile || '';
      case 'style':
        return shot.style || '';
      case 'voice_over_alignment':
        return shot.voice_over_alignment || '';
      case 'scene_progression':
        return shot.scene_progression || '';
      case 'overall_mood':
        return shot.overall_mood || '';
      case 'sound_effects':
        return shot.sound_effects || '';
      case 'background_music':
        return shot.background_music || '';
      default:
        return '';
    }
  };

  // Compact field helper: strips newlines, ensuring punctuation between lines so words don't run together
  const compactFieldText = (raw: string): string => {
    if (!raw) return '';
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const resLines = lines.map((l) => {
      // If line does not end with sentence punctuation or quotes, add a period
      if (!/[.!?:"']$/.test(l)) {
        return l + '.';
      }
      return l;
    });
    return resLines.join('');
  };

  // Formats a single shot based on isNoSpace mode
  const formatSingleShot = (shot: ParsedParagraphData, idx: number, noSpace: boolean): string => {
    const itemNumber = shot.paragraph_number || (idx + 1);

    if (noSpace) {
      // NO-SPACE / COMPACT MODE: continuous, zero blank lines
      if (selectedHeadings.length === 1) {
        const rawVal = getShotValue(shot, selectedHeadings[0]);
        const val = compactFieldText(rawVal);
        return `${itemNumber}${val}`;
      }

      let shotContent = '';
      selectedHeadings.forEach((headingKey, hIdx) => {
        const opt = HEADING_OPTIONS.find((h) => h.key === headingKey);
        const rawVal = getShotValue(shot, headingKey);
        if (!rawVal || !rawVal.trim()) return;

        const val = compactFieldText(rawVal);

        // If video_prompt or script is the very first field, it begins directly after the number without bracket label
        // Subsequent fields include their tag (e.g. [scene progression:], [sound effects...:], [overall modd:])
        if (hIdx === 0 && (headingKey === 'video_prompt' || headingKey === 'script')) {
          shotContent += val;
        } else if (showHeadingLabels) {
          const label = `[${opt?.label || headingKey}]`;
          shotContent += `${label}${val}`;
        } else {
          shotContent += val;
        }
      });

      return `${itemNumber}${shotContent}`;
    }

    // NORMAL SPACED MODE
    if (selectedHeadings.length === 1) {
      const val = getShotValue(shot, selectedHeadings[0]);
      return `${itemNumber}\n${val.trim()}`;
    }

    const fieldBlocks: string[] = [];
    for (const headingKey of selectedHeadings) {
      const opt = HEADING_OPTIONS.find((h) => h.key === headingKey);
      const val = getShotValue(shot, headingKey);
      if (val && val.trim()) {
        if (showHeadingLabels) {
          fieldBlocks.push(`[${opt?.label || headingKey}]\n${val.trim()}`);
        } else {
          fieldBlocks.push(val.trim());
        }
      }
    }

    return `${itemNumber}\n${fieldBlocks.join('\n\n')}`;
  };

  // Compile formatted text for all shots
  const formattedOutputText = useMemo(() => {
    if (parsedShots.length === 0 || selectedHeadings.length === 0) return '';
    return parsedShots
      .map((shot, idx) => formatSingleShot(shot, idx, isNoSpaceMode))
      .join('\n\n');
  }, [parsedShots, selectedHeadings, showHeadingLabels, isNoSpaceMode]);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleDownloadTxt = () => {
    const element = document.createElement('a');
    const file = new Blob([formattedOutputText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `extracted_headings_${isNoSpaceMode ? 'nospace_' : ''}${selectedHeadings.join('_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0b1220] border border-blue-500/40 rounded-3xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#0e172a] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-extrabold text-base text-white tracking-wide">
                  DATA EXPORTER & MULTI-HEADING EXTRACTOR
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                  {parsedShots.length} Shots Parsed
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono border border-blue-500/30">
                  {selectedHeadings.length} Selected
                </span>
                {isNoSpaceMode && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 animate-pulse">
                    ⚡ No-Space Mode Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Select one or <strong className="text-blue-300">multiple headings</strong>. Use <strong className="text-amber-300">No-Space Mode</strong> to collapse all line breaks into a single continuous AI prompt.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowScriptInput(!showScriptInput)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
            >
              {showScriptInput ? 'Hide Input Script' : 'Paste Different Script'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Script Input */}
        {showScriptInput && (
          <div className="p-4 bg-[#090f1c] border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 font-mono">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Paste Full Script Breakdown (Audio & Video SHOTs):</span>
              </span>
              <button
                onClick={handleLoadSample}
                className="text-xs text-blue-400 hover:text-blue-300 underline font-medium flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Reload Provided 4-Part Script</span>
              </button>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={7}
              placeholder="Paste your full script breakdown here..."
              className="w-full bg-[#0d1424] border border-slate-700 focus:border-blue-500 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none resize-none leading-relaxed"
            />

            <div className="flex justify-end">
              <button
                onClick={() => handleParse()}
                disabled={!rawText.trim()}
                className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>EXTRACT HEADINGS ({parsedShots.length} Detected)</span>
              </button>
            </div>
          </div>
        )}

        {/* Multi-Select Heading Pills & Presets */}
        <div className="p-4 bg-[#0d1527] border-b border-slate-800 space-y-3">
          
          {/* Quick Presets Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-800/60">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                CHOOSE SELECTIONS:
              </span>
              <span className="text-[11px] text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded-md border border-blue-800 font-mono">
                {selectedHeadings.length} Active
              </span>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-mono">Presets:</span>
              <button
                onClick={selectOnlyScript}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  selectedHeadings.length === 1 && selectedHeadings[0] === 'script' && !isNoSpaceMode
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                Only Script
              </button>
              <button
                onClick={selectOnlyVideoPrompts}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  selectedHeadings.length === 1 && selectedHeadings[0] === 'video_prompt' && !isNoSpaceMode
                    ? 'bg-purple-600 text-white border-purple-400 shadow'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                Only Prompts
              </button>
              <button
                onClick={selectScriptAndVideoPrompts}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all"
              >
                Script + Prompts
              </button>
              <button
                onClick={selectScriptPromptsAndText}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all"
              >
                Script + Prompts + Text
              </button>
              {/* Flow Video Prompt Compact Preset */}
              <button
                onClick={selectFlowVideoCompact}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gradient-to-r from-amber-950/80 via-purple-950/80 to-indigo-950/80 text-amber-300 border border-amber-500/50 hover:border-amber-400 transition-all flex items-center space-x-1 shadow"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Flow Video (No Spaces)</span>
              </button>
              <button
                onClick={selectAllAudio}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900/60 transition-all"
              >
                All Audio
              </button>
              <button
                onClick={selectAllVideo}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-800/80 hover:bg-purple-900/60 transition-all"
              >
                All Video
              </button>
              <button
                onClick={selectAll}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-950/60 text-blue-300 border border-blue-800/80 hover:bg-blue-900/60 transition-all"
              >
                Select All (12)
              </button>
            </div>
          </div>

          {/* Heading Pills Grid */}
          <div className="space-y-2">
            {/* 1. Audio Generation Headings */}
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5 font-mono">
                1. 🎙️ Audio Generation Headings:
              </span>
              <div className="flex flex-wrap gap-2">
                {HEADING_OPTIONS.filter((h) => h.section === 'audio').map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedHeadings.includes(option.key);

                  return (
                    <button
                      key={option.key}
                      onClick={() => toggleHeading(option.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer ${
                        isSelected ? option.activeColor : option.color
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Square className="w-3.5 h-3.5 opacity-50" />
                      )}
                      <Icon className="w-3.5 h-3.5" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Video Production Headings */}
            <div className="pt-1">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1.5 font-mono">
                2. 🎬 Video Production Headings:
              </span>
              <div className="flex flex-wrap gap-2">
                {HEADING_OPTIONS.filter((h) => h.section === 'video').map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedHeadings.includes(option.key);

                  return (
                    <button
                      key={option.key}
                      onClick={() => toggleHeading(option.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer ${
                        isSelected ? option.activeColor : option.color
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Square className="w-3.5 h-3.5 opacity-50" />
                      )}
                      <Icon className="w-3.5 h-3.5" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar for the Selected Heading(s) */}
        <div className="px-6 py-3 bg-[#0a101f] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                {selectedHeadings.length === 1 ? (
                  HEADING_OPTIONS.find((h) => h.key === selectedHeadings[0])?.label
                ) : (
                  `${selectedHeadings.length} Headings Selected`
                )}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-mono border border-slate-700">
                {parsedShots.length} Shots
              </span>
            </div>

            {/* No-Space Mode Toggle Button */}
            <button
              onClick={() => setIsNoSpaceMode(!isNoSpaceMode)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
                isNoSpaceMode
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-300 shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Toggle No-Space / Compact Mode: Removes all blank lines and spaces between tags"
            >
              <Zap className={`w-3.5 h-3.5 ${isNoSpaceMode ? 'text-white animate-pulse' : 'text-amber-400'}`} />
              <span>{isNoSpaceMode ? '⚡ No-Space Mode: ON' : 'No-Space Mode: OFF'}</span>
            </button>

            {/* Label formatting toggle for multi-select */}
            {selectedHeadings.length > 1 && (
              <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeadingLabels}
                  onChange={(e) => setShowHeadingLabels(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-[11px] font-mono">Include Section Labels</span>
              </label>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* View format toggle */}
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
              <button
                onClick={() => setViewFormat('numbered_list')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  viewFormat === 'numbered_list' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                1 by 1 Raw List
              </button>
              <button
                onClick={() => setViewFormat('cards')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  viewFormat === 'cards' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Numbered Cards
              </button>
            </div>

            {/* Download TXT button */}
            <button
              onClick={handleDownloadTxt}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all text-xs"
              title="Download as .txt file"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Big prominent COPY ALL Button */}
            <button
              onClick={() => handleCopy(formattedOutputText, 'copy_all')}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95 ${
                copiedKey === 'copy_all'
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30'
              }`}
            >
              {copiedKey === 'copy_all' ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>COPIED ALL {parsedShots.length} SHOTS!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>
                    COPY ALL (
                    {selectedHeadings.length === 1
                      ? selectedHeadings[0].replace(/_/g, ' ').toUpperCase()
                      : `${selectedHeadings.length} HEADINGS`}
                    {isNoSpaceMode ? ' • NO SPACES' : ''}
                    )
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Display: 1 by 1 Data */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-[#080d18]">
          {parsedShots.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-xs text-slate-400 font-mono">No parsed script available. Please paste a script above.</p>
              <button
                onClick={handleLoadSample}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                Load Sample Script
              </button>
            </div>
          ) : selectedHeadings.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-xs text-amber-400 font-mono">No headings selected. Please select at least one heading above.</p>
              <button
                onClick={selectOnlyScript}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                Select Formatted Script
              </button>
            </div>
          ) : viewFormat === 'numbered_list' ? (
            /* 1 by 1 Clean Plain Text Box (Exact format requested by user) */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                <span className="flex items-center space-x-1.5">
                  {isNoSpaceMode && <span className="text-amber-400 font-bold">⚡ [No Space Compact]</span>}
                  <span>
                    Sequential format (
                    {selectedHeadings.map((k) => HEADING_OPTIONS.find((h) => h.key === k)?.label).join(' + ')}
                    ):
                  </span>
                </span>
                <span>Click inside to select all, or click "COPY ALL" button above</span>
              </div>
              <div className="relative group">
                <textarea
                  readOnly
                  value={formattedOutputText}
                  rows={18}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className={`w-full bg-[#0d1525] border rounded-2xl p-5 text-xs font-mono text-slate-100 focus:outline-none leading-relaxed shadow-inner select-all ${
                    isNoSpaceMode ? 'border-amber-500/50 focus:border-amber-400' : 'border-slate-700/80 focus:border-blue-500'
                  }`}
                />
                <button
                  onClick={() => handleCopy(formattedOutputText, 'copy_textarea')}
                  className="absolute top-4 right-4 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold shadow-lg border border-slate-600 backdrop-blur-sm transition-all"
                >
                  {copiedKey === 'copy_textarea' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-blue-400" />
                      <span>Copy Output</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Cards View with Individual Numbered Badges & Individual Copy Buttons */
            <div className="space-y-4">
              {parsedShots.map((shot, idx) => {
                const itemNumber = shot.paragraph_number || (idx + 1);
                const shotCopyText = formatSingleShot(shot, idx, isNoSpaceMode);

                const copyShotKey = `shot_${itemNumber}`;
                const isShotCopied = copiedKey === copyShotKey;

                return (
                  <div
                    key={itemNumber}
                    className={`bg-[#0e1627] border rounded-2xl p-4 space-y-3 shadow-lg transition-all ${
                      isNoSpaceMode ? 'border-amber-500/40 hover:border-amber-500/70' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center space-x-2">
                        <span className={`w-7 h-7 rounded-xl text-white font-mono text-xs font-bold flex items-center justify-center shadow-md ${
                          isNoSpaceMode ? 'bg-amber-600 shadow-amber-600/30' : 'bg-blue-600 shadow-blue-600/30'
                        }`}>
                          {itemNumber}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {shot.part_number || `Shot ${itemNumber}`}
                        </span>
                        {isNoSpaceMode && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            No-Space Mode
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleCopy(shotCopyText, copyShotKey)}
                        className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                          isShotCopied
                            ? 'bg-emerald-600 text-white shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {isShotCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>COPIED SHOT #{itemNumber}!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-blue-400" />
                            <span>COPY SHOT #{itemNumber}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isNoSpaceMode ? (
                      /* Compact No-Space Unified Block */
                      <div className="p-3 bg-[#080d18] rounded-xl border border-amber-500/30 font-mono text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                        <div className="text-[10px] font-bold text-amber-400 font-mono mb-1 flex items-center space-x-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>CONTINUOUS COMPACT PROMPT (NO SPACES):</span>
                        </div>
                        {shotCopyText}
                      </div>
                    ) : (
                      /* Detailed Sub-field Cards */
                      <div className="space-y-2.5">
                        {selectedHeadings.map((headingKey) => {
                          const opt = HEADING_OPTIONS.find((h) => h.key === headingKey);
                          const val = getShotValue(shot, headingKey);
                          const itemCopyKey = `field_${itemNumber}_${headingKey}`;
                          const isFieldCopied = copiedKey === itemCopyKey;

                          return (
                            <div
                              key={headingKey}
                              className="p-3 bg-[#080d18] rounded-xl border border-slate-800 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono flex items-center space-x-1">
                                  <span>{opt?.label || headingKey}</span>
                                </span>
                                <button
                                  onClick={() => handleCopy(val, itemCopyKey)}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 font-mono flex items-center space-x-1"
                                >
                                  {isFieldCopied ? (
                                    <span className="text-emerald-400 font-bold">Copied!</span>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="font-mono text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                                {val || <span className="text-slate-500 italic">No data available for this field.</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-[#0e172a] flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            Selected: <strong className="text-blue-300">{selectedHeadings.length} Headings</strong> ({parsedShots.length} shots)
            {isNoSpaceMode && <span className="text-amber-300 ml-2 font-bold">• ⚡ No-Space Mode ON</span>}
          </span>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
