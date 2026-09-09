import React, { useState } from 'react';
import { FileDown, Sparkles, Check, X, AlertTriangle, ArrowRight, Eye, Lightbulb, Copy, FolderOpen, Film } from 'lucide-react';
import { api } from '../api';
import { PromptHelpModal, AI_DIRECTOR_PROMPT } from './PromptHelpModal';

interface ReferenceImporterProps {
  batchId: number;
  defaultVoice?: string;
  onImportSuccess: () => void;
  onClose: () => void;
}

export const ReferenceImporter: React.FC<ReferenceImporterProps> = ({
  batchId,
  defaultVoice = 'Algenib',
  onImportSuccess,
  onClose,
}) => {
  const [step, setStep] = useState<'paste' | 'preview'>('paste');
  const [rawText, setRawText] = useState('');
  const [mediaFolder, setMediaFolder] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPromptHelp, setShowPromptHelp] = useState(false);

  const handleBrowseFolder = async () => {
    setIsBrowsing(true);
    try {
      const res = await api.selectFolder('Select Media Assets Folder');
      if (res.status === 'ok' && res.folder_path) {
        setMediaFolder(res.folder_path);
      }
    } catch (e) {
      console.warn('Folder browse failed:', e);
    } finally {
      setIsBrowsing(false);
    }
  };

  const sampleReference = `Part 1: HOOK [0:00–0:11]
Playground Setup:
- Scene: "A dramatic silhouette of Lord Shiva in meditation with rising smoke, shattering common myths."
- Sample Context: "The narrator asks a bold, provocative question to instantly stop the viewer from scrolling."
- Audio Profile: "Deep, bold, and mysterious Indian documentary YouTuber."
- Style: Newscaster | Pace: Rapid Fire | Accent: Neutral | Voice: Algenib

Video SHOT 1
voice-over & subtitle alingment:
on screen text : Kya Shiva ne sach mein bhang piya tha?
Video-prompt(google flow - 10 second silent videos, visula only ): Cinematic slow motion camera pan around Lord Shiva in meditative stance with Himalayan mist and subtle embers
scene progression: Intro hook shattering misconception
overall modd: Mysterious, majestic, intriguing
sound effects s(SFX-add in the editor): Deep bass drop, wind whisper
background music(add in editor): Ambient mystical Indian drone

Formatted Script to Copy-Paste:
[serious] [probing]
Kya Shiva ne... sach mein bhang piya tha?

[authoritative] [mysterious]
Sirf ek myth nahi hai... iske peechhe ek teen hazaar saal purani... real kahani hai!

Part 2: SETUP & CONTEXT [0:11–0:26]
Playground Setup:
- Scene: "Ancient Ayurvedic texts and mountain herbs glowing with mystical light."
- Sample Context: "Explaining the mythological context with authoritative depth."
- Audio Profile: "Deep, bold, and mysterious Indian documentary YouTuber."
- Style: Serious | Pace: Natural | Accent: Neutral | Voice: Algenib

Video SHOT 2
voice-over & subtitle alingment:
on screen text : Samudra Manthan & Halahala Vish
Video-prompt(google flow - 10 second silent videos, visula only ): Ancient parchment scrolls unrolling in ethereal golden light showing cosmic churning
scene progression: Establishing ancient mythological context
overall modd: Epic, intense, sacred
sound effects s(SFX-add in the editor): Thunder rumble, parchment roll
background music(add in editor): Rising Sanskrit battle chant

Formatted Script to Copy-Paste:
[authoritative] [epic]
Puranon ke anusaar... jab Samudra Manthan ke dauraan Halahala vish nikla...

[intense] [dramatic]
Toh sansaar ko bachane ke liye... Lord Shiva ne use apne gale mein dharan kar liya!`;

  const handleParse = async () => {
    if (!rawText.trim()) {
      setError('Please paste your script breakdown reference first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.parseReference(batchId, rawText, defaultVoice, mediaFolder.trim() || undefined);
      setParsedData(res.paragraphs);
      setStep('preview');
    } catch (e: any) {
      setError(e.message || 'Failed to parse reference.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.importReference(batchId, rawText, defaultVoice, mediaFolder.trim() || undefined);
      onImportSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => {
    setRawText(sampleReference);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-[#101827] border border-[#20304C] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-studio-cardBorder flex items-center justify-between bg-[#152037]">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <FileDown className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">IMPORT AI STUDIO REFERENCE</h3>
                <p className="text-xs text-studio-textMuted">
                  {step === 'paste' ? 'Step 1: Paste markdown or structured script' : 'Step 2: Inspect parsed paragraphs before importing'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowPromptHelp(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all"
              >
                <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
                <span>AI DIRECTOR PROMPT</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-studio-textMuted hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {step === 'paste' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-studio-textLight">
                    Paste Batch Reference / Breakdown:
                  </span>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowPromptHelp(true)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium flex items-center space-x-1"
                    >
                      <span>How to generate script?</span>
                    </button>
                    <button
                      type="button"
                      onClick={loadSample}
                      className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                    >
                      Load Shiva Reference Sample
                    </button>
                  </div>
                </div>

                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={12}
                  className="w-full bg-[#0B101B] border border-studio-cardBorder focus:border-blue-500 rounded-xl p-4 text-xs font-mono text-slate-200 focus:outline-none resize-none leading-relaxed"
                  placeholder="Paste AI Studio breakdown here (Scene, Sample Context, Audio Profile, Style, Pace, Voice, Formatted Script to Copy-Paste)..."
                />

                {/* Media Assets Folder Field */}
                <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center space-x-2">
                    <FolderOpen className="w-4 h-4 text-blue-400" />
                    <label className="text-xs font-semibold text-slate-200">
                      Media Assets Folder (Optional):
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      (Auto-matches 1.mp4, 2.jpg... to paragraph numbers)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={mediaFolder}
                      onChange={(e) => setMediaFolder(e.target.value)}
                      placeholder="e.g. C:/Videos/Assets or /Users/name/Movies/Assets"
                      className="flex-1 bg-[#111726] border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      disabled={isBrowsing}
                      className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition-all whitespace-nowrap shadow cursor-pointer active:scale-95"
                      title="Click to open your computer's folder selection dialog"
                    >
                      <FolderOpen className={`w-3.5 h-3.5 ${isBrowsing ? 'animate-spin' : ''}`} />
                      <span>{isBrowsing ? 'Opening...' : 'Browse Folder'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl text-xs text-blue-300">
                <span className="font-semibold">
                  Detected {parsedData.length} Paragraph(s) ready for import
                  {mediaFolder && <span className="ml-2 text-emerald-400 font-mono">(&bull; Folder: {mediaFolder})</span>}
                </span>
                <button
                  onClick={() => setStep('paste')}
                  className="text-blue-400 hover:text-blue-200 font-medium underline"
                >
                  &larr; Back to Paste
                </button>
              </div>

              {/* Parsed Preview Table */}
              <div className="space-y-3">
                {parsedData.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0B101B] border border-studio-cardBorder rounded-xl p-4 space-y-2.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 font-mono text-xs font-bold">
                          {item.part_number || `Part ${item.paragraph_number}`}
                        </span>
                        <span className="text-xs font-semibold text-white">
                          Voice: <span className="text-blue-300">{item.voice}</span>
                        </span>
                        <span className="text-xs text-studio-textMuted font-mono">
                          ({item.style} &bull; {item.pace})
                        </span>
                      </div>

                      <div className="text-xs font-mono text-studio-textMuted">
                        {item.word_count} words | {item.character_count} chars
                      </div>
                    </div>

                    {item.scene && (
                      <p className="text-[11px] text-studio-textMuted truncate">
                        <strong className="text-slate-400 font-medium">Scene:</strong> {item.scene}
                      </p>
                    )}

                    {item.on_screen_text && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-xs font-mono text-amber-300">
                        <strong className="text-amber-400">On-Screen Text: </strong> "{item.on_screen_text}"
                      </div>
                    )}

                    {item.video_prompt && (
                      <p className="text-[11px] text-slate-300 font-sans">
                        <strong className="text-indigo-300">Video Prompt: </strong> {item.video_prompt}
                      </p>
                    )}

                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 line-clamp-3">
                      {item.transcript}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-studio-cardBorder bg-[#152037] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>

          {step === 'paste' ? (
            <button
              onClick={handleParse}
              disabled={loading || !rawText.trim()}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
            >
              <span>{loading ? 'Parsing...' : 'PARSE REFERENCE'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleConfirmImport}
              disabled={loading}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Importing...' : 'CONFIRM & IMPORT INTO BATCH'}</span>
            </button>
          )}
        </div>
      </div>
    </div>

    {/* AI Director Prompt Guide Modal */}
    <PromptHelpModal isOpen={showPromptHelp} onClose={() => setShowPromptHelp(false)} />
    </>
  );
};
