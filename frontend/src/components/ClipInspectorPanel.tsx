import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Scissors, Image as ImageIcon, Video as VideoIcon, 
  Type, Check, RefreshCw, FolderOpen, Sliders, Play
} from 'lucide-react';
import { Paragraph } from '../types';
import { api } from '../api';

interface ClipInspectorPanelProps {
  batchId: number;
  paragraph: Paragraph | null;
  globalPhotoMotion: string;
  globalPhotoTransition: string;
  onUpdateParagraph: (updated: Paragraph) => void;
  onPreviewShot: (p: Paragraph) => void;
  onBatchUpdated?: () => void;
}

export const ClipInspectorPanel: React.FC<ClipInspectorPanelProps> = ({
  batchId,
  paragraph,
  globalPhotoMotion,
  globalPhotoTransition,
  onUpdateParagraph,
  onPreviewShot,
  onBatchUpdated,
}) => {
  if (!paragraph) {
    return (
      <div className="bg-[#0b1220] border border-slate-800/80 rounded-2xl p-6 text-center text-slate-500 text-xs font-mono">
        Click any shot in the timeline above to open the Clip Inspector & edit its properties live.
      </div>
    );
  }

  const [textInput, setTextInput] = useState<string>(paragraph.on_screen_text || '');
  const [isSavingText, setIsSavingText] = useState<boolean>(false);
  const [editingPath, setEditingPath] = useState<boolean>(false);
  const [pathInput, setPathInput] = useState<string>(paragraph.media_path || '');
  const [isApplyingMotionToAll, setIsApplyingMotionToAll] = useState<boolean>(false);
  const [isApplyingTransitionToAll, setIsApplyingTransitionToAll] = useState<boolean>(false);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  useEffect(() => {
    setTextInput(paragraph.on_screen_text || '');
    setPathInput(paragraph.media_path || '');
    setEditingPath(false);
  }, [paragraph.id, paragraph.on_screen_text, paragraph.media_path]);

  const currentMotion = paragraph.photo_motion || globalPhotoMotion || 'zoom_in';
  const currentTransition = paragraph.photo_transition || globalPhotoTransition || 'fade_in_out';
  const isImage = !paragraph.media_path || paragraph.media_type === 'image' || /\.(jpe?g|png|webp|bmp)$/i.test(paragraph.media_path || '');

  const handleSetMotion = async (motion: string) => {
    try {
      const updated = await api.updateParagraph(paragraph.id, { photo_motion: motion });
      onUpdateParagraph(updated);
    } catch (e) {
      console.error('Failed to update photo motion', e);
    }
  };

  const handleApplyMotionToAll = async (motionToApply?: string) => {
    const motion = motionToApply || currentMotion;
    setIsApplyingMotionToAll(true);
    try {
      await api.applyMotionTransitionToAll(batchId, { photo_motion: motion });
      setAppliedMessage(`Applied motion "${motion.replace('_', ' ')}" to all shots!`);
      setTimeout(() => setAppliedMessage(null), 3500);
      onBatchUpdated?.();
    } catch (e) {
      console.error('Failed to apply motion to all', e);
    } finally {
      setIsApplyingMotionToAll(false);
    }
  };

  const handleSetTransition = async (transition: string) => {
    try {
      const updated = await api.updateParagraph(paragraph.id, { photo_transition: transition });
      onUpdateParagraph(updated);
    } catch (e) {
      console.error('Failed to update photo transition', e);
    }
  };

  const handleApplyTransitionToAll = async (transitionToApply?: string) => {
    const transition = transitionToApply || currentTransition;
    setIsApplyingTransitionToAll(true);
    try {
      await api.applyMotionTransitionToAll(batchId, { photo_transition: transition });
      setAppliedMessage(`Applied cut transition "${transition.replace('_', ' ')}" to all shots!`);
      setTimeout(() => setAppliedMessage(null), 3500);
      onBatchUpdated?.();
    } catch (e) {
      console.error('Failed to apply transition to all', e);
    } finally {
      setIsApplyingTransitionToAll(false);
    }
  };

  const handleSaveText = async () => {
    setIsSavingText(true);
    try {
      const updated = await api.updateParagraph(paragraph.id, { on_screen_text: textInput.trim() });
      onUpdateParagraph(updated);
    } catch (e) {
      console.error('Failed to update text', e);
    } finally {
      setIsSavingText(false);
    }
  };

  const handleSavePath = async () => {
    if (!pathInput.trim()) return;
    try {
      const updated = await api.assignMedia(batchId, paragraph.id, pathInput.trim());
      onUpdateParagraph(updated);
      setEditingPath(false);
    } catch (e) {
      console.error('Failed to assign media', e);
    }
  };

  return (
    <div className="bg-[#0b1220] border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
      {/* Left: Shot Identification & Thumbnail */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="relative w-14 h-11 rounded-xl bg-black overflow-hidden border border-slate-700 shrink-0 shadow">
          <img
            src={api.getParagraphThumbnailUrl(paragraph.id)}
            alt="Thumb"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <button
            type="button"
            onClick={() => onPreviewShot(paragraph)}
            className="absolute inset-0 m-auto w-6 h-6 rounded-full bg-blue-600/80 hover:bg-blue-600 text-white flex items-center justify-center shadow transition-all cursor-pointer"
            title="Preview isolated clip"
          >
            <Play className="w-3 h-3 fill-current ml-0.5" />
          </button>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center space-x-1.5">
            <span className="px-1.5 py-0.5 rounded bg-blue-600/30 text-cyan-300 font-bold font-mono text-[11px] border border-blue-500/30">
              SHOT #{paragraph.paragraph_number}
            </span>
            <span className="font-bold text-white text-xs truncate max-w-[140px]">
              {paragraph.part_number || `Part ${paragraph.paragraph_number}`}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
            {paragraph.media_path ? paragraph.media_path.split(/[/\\]/).pop() : 'No media assigned'}
          </div>
        </div>
      </div>

      {/* Center: Live Photo Motion & Transition Controls for Images, or Video Info for Videos */}
      <div className="flex flex-wrap items-center gap-4 flex-1">
        {isImage ? (
          <>
            {/* Photo Motion Selector */}
            <div className="space-y-1">
              <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-1 text-[11px] text-pink-400 font-bold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>Photo Motion (Images Only):</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyMotionToAll()}
                  disabled={isApplyingMotionToAll}
                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/40 text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                  title={`Bulk apply "${currentMotion.replace('_', ' ')}" to ALL photo shots in this video`}
                >
                  <span>{isApplyingMotionToAll ? 'APPLYING...' : '⚡ Apply to All Photos'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center bg-slate-900 border border-slate-700/80 p-0.5 rounded-xl gap-0.5 text-[11px]">
                {[
                  { id: 'zoom_in', label: '🔍 Zoom In', tip: 'Cinematic push in (1.0x ➔ 1.20x)' },
                  { id: 'zoom_out', label: '🔎 Zoom Out', tip: 'Cinematic reveal out (1.20x ➔ 1.0x)' },
                  { id: 'pan_left', label: '⬅️ Pan Left', tip: 'Smooth horizontal glide right to left' },
                  { id: 'pan_right', label: '➡️ Pan Right', tip: 'Smooth horizontal glide left to right' },
                  { id: 'zoom_pan', label: '↗️ Zoom+Pan', tip: 'Dynamic diagonal drift' },
                  { id: 'none', label: '⏹️ Static', tip: 'Hold frame' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSetMotion(m.id)}
                    className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      currentMotion === m.id
                        ? 'bg-pink-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={m.tip}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* In/Out Transition Selector */}
            <div className="space-y-1">
              <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-1 text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                  <Scissors className="w-3 h-3" />
                  <span>Photo Cut (Images Only):</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyTransitionToAll()}
                  disabled={isApplyingTransitionToAll}
                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                  title={`Bulk apply "${currentTransition.replace('_', ' ')}" transition to ALL photo shots in this video`}
                >
                  <span>{isApplyingTransitionToAll ? 'APPLYING...' : '⚡ Apply to All Photos'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center bg-slate-900 border border-slate-700/80 p-0.5 rounded-xl gap-0.5 text-[11px]">
                {[
                  { id: 'fade_in_out', label: '🌓 Fade In/Out' },
                  { id: 'fade_in', label: '🌘 Fade In' },
                  { id: 'fade_out', label: '🌒 Fade Out' },
                  { id: 'zoom_pop', label: '💥 Pop' },
                  { id: 'none', label: '✂️ Cut' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSetTransition(t.id)}
                    className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      currentTransition === t.id
                        ? 'bg-cyan-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Video Clip: Clear badge explaining natural playback & no synthetic photo motion */
          <div className="flex items-center space-x-3 bg-slate-900/90 border border-blue-500/30 px-3.5 py-2 rounded-xl text-[11px]">
            <div className="flex items-center space-x-1.5 text-blue-400 font-bold">
              <VideoIcon className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Native Video Clip</span>
            </div>
            <span className="text-slate-400 border-l border-slate-700 pl-3">
              Real video playback active • Synthetic photo motion animation is bypassed for video files
            </span>
            {paragraph.original_media_duration && (
              <span className="text-cyan-300 font-mono bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                Duration: {paragraph.original_media_duration.toFixed(1)}s
              </span>
            )}
          </div>
        )}

        {appliedMessage && (
          <div className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold animate-fadeIn">
            ✓ {appliedMessage}
          </div>
        )}
      </div>


      {/* Right: Quick On-Screen Text Editor */}
      <div className="flex items-center space-x-2 w-full lg:w-auto shrink-0">
        <div className="relative flex-1 lg:w-64">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveText();
            }}
            placeholder="On-screen title text..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 pr-16"
          />
          {textInput !== (paragraph.on_screen_text || '') && (
            <button
              type="button"
              onClick={handleSaveText}
              disabled={isSavingText}
              className="absolute right-1.5 top-1.5 px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] cursor-pointer"
            >
              {isSavingText ? 'SAVING' : 'APPLY'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
