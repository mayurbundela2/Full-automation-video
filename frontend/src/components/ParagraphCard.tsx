import React, { useState } from 'react';
import { 
  Mic, Play, RefreshCw, Scissors, Sparkles, Merge, 
  Trash2, ChevronDown, ChevronUp, AlertCircle, FileText, CheckCircle2, Type 
} from 'lucide-react';
import { Paragraph, VoiceItem } from '../types';
import { LimitIndicator } from './LimitIndicator';
import { AudioPlayer } from './AudioPlayer';
import { PromptPreview } from './PromptPreview';
import { SplitModal } from './SplitModal';
import { api } from '../api';

interface ParagraphCardProps {
  paragraph: Paragraph;
  voices: VoiceItem[];
  onUpdated: () => void;
  onDeleted: () => void;
}

export const ParagraphCard: React.FC<ParagraphCardProps> = ({
  paragraph,
  voices,
  onUpdated,
  onDeleted,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);
  
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Field edits
  const handleFieldChange = async (field: keyof Paragraph, value: any) => {
    try {
      await api.updateParagraph(paragraph.id, { [field]: value });
      onUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreviewPrompt = async () => {
    try {
      const res = await api.previewPrompt(paragraph.id);
      setPromptText(res.prompt);
      setIsCustomPrompt(res.is_custom);
      setShowPromptPreview(true);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to preview prompt');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);
    try {
      await api.generateParagraph(paragraph.id);
      onUpdated();
    } catch (e: any) {
      setErrorMsg(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleMerge = async () => {
    try {
      await api.mergeParagraph(paragraph.id);
      onUpdated();
    } catch (e: any) {
      setErrorMsg(e.message || 'Merge failed');
    }
  };

  const isOverLimit = paragraph.limit_status === 'OVER_LIMIT';
  const isCompleted = paragraph.status === 'COMPLETED';

  return (
    <div className={`bg-[#0F172A] border rounded-2xl overflow-hidden shadow-xl transition-all duration-200 ${
      isOverLimit ? 'border-rose-500/40 ring-1 ring-rose-500/20' : 'border-studio-cardBorder hover:border-slate-700'
    }`}>
      {/* Card Header Bar */}
      <div className="px-4 sm:px-5 py-3 bg-[#141F36] border-b border-studio-cardBorder flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600/20 text-blue-400 font-mono font-extrabold text-xs flex-shrink-0 flex items-center justify-center border border-blue-500/30">
            {paragraph.paragraph_number < 10 ? `0${paragraph.paragraph_number}` : paragraph.paragraph_number}
          </span>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 flex-wrap">
              <h3 className="font-bold text-xs sm:text-sm text-white tracking-wide flex-shrink-0">
                PARAGRAPH {paragraph.paragraph_number}
              </h3>
              {paragraph.part_number && (
                <span className="text-[11px] text-blue-300 font-semibold px-2 py-0.5 bg-blue-500/15 rounded-md border border-blue-500/30 truncate max-w-[140px] sm:max-w-xs">
                  {paragraph.part_number}
                </span>
              )}
            </div>
            {paragraph.speaker && (
              <span className="text-[10px] sm:text-[11px] text-studio-textMuted block truncate">Speaker: {paragraph.speaker}</span>
            )}
          </div>
        </div>

        {/* Right Header: Limit Gauges & Quick Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          <LimitIndicator
            metrics={paragraph.limit_metrics}
            words={paragraph.word_count}
            characters={paragraph.character_count}
          />

          <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-700">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-studio-textMuted hover:text-white hover:bg-slate-800 transition-colors"
              title={isExpanded ? 'Collapse card' : 'Expand card'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <button
              onClick={onDeleted}
              className="p-1.5 rounded-lg text-studio-textMuted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete paragraph"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Card Body */}
      {isExpanded && (
        <div className="p-5 space-y-4">
          {/* Over Limit Warning Banner */}
          {isOverLimit && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3.5 rounded-xl flex items-center justify-between animate-fadeIn">
              <div className="flex items-center space-x-2.5">
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                <div className="text-xs">
                  <strong className="font-bold text-white block">Paragraph is too long for a single TTS request.</strong>
                  <span>Split this paragraph into sequential parts before generating.</span>
                </div>
              </div>

              <button
                onClick={() => setShowSplitModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow transition-all flex items-center space-x-1.5"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>SPLIT PARAGRAPH</span>
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-white">Generation Error:</span>
                <p className="whitespace-pre-wrap font-mono text-[11px]">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* AI Studio Style Voice Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#0B1220]/70 p-3.5 rounded-xl border border-slate-800/80">
            {/* Voice Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-studio-textMuted uppercase tracking-wider block">
                Voice
              </label>
              <select
                value={paragraph.voice || 'Algenib'}
                onChange={(e) => handleFieldChange('voice', e.target.value)}
                className="w-full bg-[#131E33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
            </div>

            {/* Style */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-studio-textMuted uppercase tracking-wider block">
                Style
              </label>
              <input
                type="text"
                value={paragraph.style || ''}
                onChange={(e) => handleFieldChange('style', e.target.value)}
                placeholder="e.g. Newscaster, Cinematic"
                className="w-full bg-[#131E33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Pace */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-studio-textMuted uppercase tracking-wider block">
                Pace
              </label>
              <input
                type="text"
                value={paragraph.pace || ''}
                onChange={(e) => handleFieldChange('pace', e.target.value)}
                placeholder="e.g. Natural, Slow, Fast"
                className="w-full bg-[#131E33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Accent */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-studio-textMuted uppercase tracking-wider block">
                Accent
              </label>
              <input
                type="text"
                value={paragraph.accent || ''}
                onChange={(e) => handleFieldChange('accent', e.target.value)}
                placeholder="e.g. Neutral, Indian, British"
                className="w-full bg-[#131E33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Scene */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-studio-textMuted uppercase tracking-wider block">
                Scene Description (Direction Context)
              </label>
              <input
                type="text"
                value={paragraph.scene || ''}
                onChange={(e) => handleFieldChange('scene', e.target.value)}
                placeholder="Visual background / setting context..."
                className="w-full bg-[#131E33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 truncate"
              />
            </div>

            {/* Sample Context */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-studio-textMuted uppercase tracking-wider block">
                Sample Context / Emotion
              </label>
              <input
                type="text"
                value={paragraph.sample_context || ''}
                onChange={(e) => handleFieldChange('sample_context', e.target.value)}
                placeholder="Emotional delivery context..."
                className="w-full bg-[#131E33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 truncate"
              />
            </div>

            {/* On-Screen Text (Video Animation Caption) */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Type className="w-3.5 h-3.5 text-amber-400" />
                <span>On-Screen Text (Video Animation Caption)</span>
              </label>
              <input
                type="text"
                value={paragraph.on_screen_text || ''}
                onChange={(e) => handleFieldChange('on_screen_text', e.target.value)}
                placeholder="e.g. AAJ TUMNE KYA KHAYA? (Smoothly animated at video bottom center)"
                className="w-full bg-[#131E33] border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-xs text-amber-200 focus:outline-none focus:border-amber-500 font-mono placeholder:text-amber-500/40"
              />
            </div>
          </div>

          {/* Spoken Transcript Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>SPOKEN TRANSCRIPT</span>
                <span className="text-[11px] text-studio-textMuted font-normal">
                  (Only this text is spoken aloud. Inline emotion tags like <code className="text-amber-300 font-mono">[serious]</code> are preserved)
                </span>
              </label>
            </div>

            <textarea
              value={paragraph.transcript}
              onChange={(e) => handleFieldChange('transcript', e.target.value)}
              rows={4}
              className="w-full bg-[#0B101B] border border-slate-700 focus:border-blue-500 rounded-xl p-3.5 text-xs font-mono text-slate-100 focus:outline-none resize-none leading-relaxed"
              placeholder="Enter spoken narration script..."
            />
          </div>

          {/* Embedded Audio Player if generated */}
          {paragraph.latest_generation && paragraph.latest_generation.status === 'COMPLETED' && (
            <div className="pt-1">
              <AudioPlayer generation={paragraph.latest_generation} />
            </div>
          )}

          {/* Card Bottom Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviewPrompt}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>PREVIEW PROMPT</span>
              </button>

              <button
                onClick={() => setShowSplitModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
              >
                <Scissors className="w-3.5 h-3.5 text-slate-400" />
                <span>SPLIT...</span>
              </button>

              {paragraph.parent_paragraph_id && (
                <button
                  onClick={handleMerge}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                  title="Merge split parts back into single paragraph"
                >
                  <Merge className="w-3.5 h-3.5 text-indigo-400" />
                  <span>MERGE BACK</span>
                </button>
              )}
            </div>

            {/* Main Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={generating || isOverLimit}
              className={`flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${
                isOverLimit
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : isCompleted
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-emerald-700/20'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20 active:scale-95'
              }`}
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>GENERATING...</span>
                </>
              ) : isCompleted ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>REGENERATE</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>GENERATE</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Prompt Preview Modal */}
      {showPromptPreview && (
        <PromptPreview
          paragraphId={paragraph.id}
          prompt={promptText}
          isCustom={isCustomPrompt}
          onClose={() => setShowPromptPreview(false)}
          onPromptUpdated={() => {
            setShowPromptPreview(false);
            onUpdated();
          }}
        />
      )}

      {/* Split Modal */}
      {showSplitModal && (
        <SplitModal
          paragraph={paragraph}
          onClose={() => setShowSplitModal(false)}
          onSplitSuccess={onUpdated}
        />
      )}
    </div>
  );
};
