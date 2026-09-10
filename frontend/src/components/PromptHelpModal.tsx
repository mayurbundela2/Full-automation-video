import React, { useState } from 'react';
import { Sparkles, Copy, Check, X, HelpCircle, BookOpen, ExternalLink, ArrowRight, Lightbulb } from 'lucide-react';

export const AI_DIRECTOR_PROMPT = `# MISSION
You are an elite Audio Director and Voiceover Engineer specializing in cinematic documentary storytelling. 

Your task is to take my raw script and break it down into a clean, micro-paragraph Text-to-Speech (TTS) blueprint for Google AI Studio (Gemini Flash TTS).

---

# STRICT VISUAL LAYOUT & SPACING RULES (CRITICAL)

The output must NOT look cramped or clustered. You must maintain strict whitespace and layout hygiene:

1. SECTION DIVIDER:
   - Every single part MUST be separated from the next part by a horizontal divider line (\`---\`) followed by an empty line.

2. PLAYGROUND SETUP SPACING:
   - Write "Part [X]: [SECTION] — [Title] (Paragraph [X])" as a clean plain-text line.
   - Leave 1 blank line before "Playground Setup:".
   - Under "Playground Setup:", list each item on a new line with a single clean bullet (*).
   - Leave 1 blank line before "Formatted Script to Copy-Paste:".

3. SCRIPT BEAT SPACING:
   - Under "Formatted Script to Copy-Paste:", do NOT clump tags together.
   - Leave 1 blank line between different emotion-tagged dialogue blocks.
   - Put the double emotion tag on its own line, followed immediately on the next line by the dialogue text.

4. SCRIPT RULES:
   - Micro-paragraphs: Maximum 1 to 3 short sentences per part.
   - Continuous numbering: Part 1, Part 2, Part 3... with NO batch grouping.
   - No word changes: Keep original script words intact.
   - Spelled-out numbers: Convert all numerals to phonetic Hinglish (e.g., "teen lakh", "do baje", "saat baje").
   - STRICT BAN: Never use \`[whisper]\`. Use \`[reflective]\`, \`[intimate]\`, \`[deep]\`, or \`[somber]\`.
   - Timing: Use ellipses (\`...\`) for 0.5s–1.0s dramatic pauses.

---

# EXACT OUTPUT TEMPLATE TO REPLICATE:

---

Part 1: COLD OPEN — The Late Night Reality (Paragraph 1)

Playground Setup:
* Scene: "A dark room illuminated only by the cold blue glow of a smartphone screen reflecting in someone's tired eyes."
* Sample Context: "The narrator directly confronts the Gen-Z listener with their own exact late-night habits."
* Audio Profile: "Direct, relatable, and thought-provoking Indian documentary narrator."
* Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib

Formatted Script to Copy-Paste:

[conversational] [direct]
Kal raat tum kitne baje soye?

[probing] [serious]
Baarah baje? Ek baje? Do baje? Yeah, main jaanta hoon.

---

Part 2: COLD OPEN — The Normalization of Sleep Loss (Paragraph 2)

Playground Setup:
* Scene: "A montage of exhausted young people drinking coffee and staring blankly in daylight."
* Sample Context: "The narrator highlights how an entire generation has normalized sleep deprivation."
* Audio Profile: "Serious, observational, and blunt Indian documentary host."
* Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib

Formatted Script to Copy-Paste:

[serious] [blunt]
Tumhari generation late sote hain. Aur tumne ise normal maan liya hai.

[reflective] [cautious]
Ek bas ek aur reel wala moment... phir raat ke do baj gaye. Uthne ka time subah saat baje.

---

# SCRIPT TO FORMAT:

[Script to paste]`;

interface PromptHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseTemplate?: (prompt: string) => void;
}

export const PromptHelpModal: React.FC<PromptHelpModalProps> = ({ isOpen, onClose, onUseTemplate }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(AI_DIRECTOR_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0D1527] border border-[#233554] rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#131D33] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-white tracking-wide flex items-center space-x-2">
                <span>AI STUDIO DIRECTOR PROMPT GUIDE</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                  Cinematic Documentary TTS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Use this master prompt in Gemini, ChatGPT, or Claude to format any script into micro-paragraph voiceovers.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25 active:scale-95'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'COPIED TO CLIPBOARD!' : 'COPY MASTER PROMPT'}</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans">
          {/* Quick 3-Step Workflow Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#0B1120] p-4 rounded-2xl border border-slate-800">
            <div className="flex items-start space-x-3 p-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Copy Prompt</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click "Copy Master Prompt" and paste into Gemini, ChatGPT, or Claude.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Paste Raw Script</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Add your raw script at the bottom. The AI will output structured micro-paragraphs.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Import & Generate</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Paste the generated breakdown into "Import Script Reference" to auto-populate cards!
                </p>
              </div>
            </div>
          </div>

          {/* Master Prompt Code Block */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center space-x-1.5 text-blue-400 font-semibold">
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Master Voiceover Director Prompt (Ready to Copy)</span>
              </span>
              <span>Markdown Prompt Template</span>
            </div>

            <div className="relative group">
              <pre className="bg-[#080D1A] border border-[#1E293B] rounded-2xl p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed whitespace-pre-wrap selection:bg-blue-600 selection:text-white max-h-[380px]">
                {AI_DIRECTOR_PROMPT}
              </pre>

              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 shadow-lg backdrop-blur-sm transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#131D33] flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Tip: You can customize the voice persona, accents, and pacing inside each paragraph card after importing.
          </p>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
