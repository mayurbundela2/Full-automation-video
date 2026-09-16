import React, { useRef, useMemo, useState, useEffect } from 'react';
import { 
  Scissors, Sparkles, Image as ImageIcon, Video as VideoIcon, 
  Layers, Volume2, Type, ZoomIn, ZoomOut, MoveLeft, MoveRight
} from 'lucide-react';
import { Batch, Paragraph } from '../types';
import { api } from '../api';

interface InteractiveTimelineTrackProps {
  batch: Batch;
  paragraphs: Paragraph[];
  audioSource: 'master' | 'tight';
  currentTime: number;
  onSeek: (time: number) => void;
  selectedParagraphId: number | null;
  onSelectParagraph: (id: number) => void;
  photoMotion: string;
  photoTransition: string;
}

export const InteractiveTimelineTrack: React.FC<InteractiveTimelineTrackProps> = ({
  batch,
  paragraphs,
  audioSource,
  currentTime,
  onSeek,
  selectedParagraphId,
  onSelectParagraph,
  photoMotion,
  photoTransition,
}) => {
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.5); // 1.0 to 4.0
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState<boolean>(false);

  // Base pixels per second
  const pixelsPerSecond = 70 * zoomLevel;

  // Build schedule of all shots
  const schedule = useMemo(() => {
    let accumulated = 0;
    return paragraphs.map((p) => {
      const duration = audioSource === 'tight'
        ? (p.latest_generation?.tight_duration || p.latest_generation?.duration || 2.5)
        : (p.latest_generation?.duration || 2.5);
      const start = accumulated;
      accumulated += duration;
      return {
        paragraph: p,
        start,
        duration,
        end: accumulated,
      };
    });
  }, [paragraphs, audioSource]);

  const totalDuration = useMemo(() => {
    if (schedule.length === 0) return 0;
    return schedule[schedule.length - 1].end;
  }, [schedule]);

  const totalTimelineWidth = Math.max(800, totalDuration * pixelsPerSecond + 150);

  // Generate ruler tick marks
  const rulerTicks = useMemo(() => {
    if (totalDuration <= 0) return [];
    const ticks = [];
    const step = zoomLevel >= 2.5 ? 1 : zoomLevel >= 1.5 ? 2 : 5; // seconds per major tick
    for (let t = 0; t <= Math.ceil(totalDuration) + 1; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [totalDuration, zoomLevel]);

  // Convert clientX coordinate to timeline time
  const getTimeFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!timelineScrollRef.current) return 0;
    const rect = timelineScrollRef.current.getBoundingClientRect();
    const scrollLeft = timelineScrollRef.current.scrollLeft;
    const offsetX = e.clientX - rect.left + scrollLeft - 120; // 120px track header width
    const calculatedTime = Math.max(0, Math.min(totalDuration, offsetX / pixelsPerSecond));
    return calculatedTime;
  };

  const handleMouseDownRuler = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingPlayhead(true);
    const newTime = getTimeFromEvent(e);
    onSeek(newTime);
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newTime = getTimeFromEvent(e);
      onSeek(newTime);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, pixelsPerSecond, totalDuration]);

  // Playhead needle position
  const playheadLeftPos = 120 + currentTime * pixelsPerSecond;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#0b101c] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col select-none">
      {/* Timeline Header Bar */}
      <div className="px-4 py-2 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white tracking-wider uppercase">Interactive Video Editor Timeline</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {paragraphs.length} Clips &bull; {totalDuration.toFixed(1)}s
          </span>
        </div>

        {/* Timeline Zoom Controls */}
        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-slate-400 font-mono">Zoom:</span>
          <button
            type="button"
            onClick={() => setZoomLevel(Math.max(0.75, zoomLevel - 0.25))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Zoom out timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-cyan-300 font-bold w-9 text-center">
            {zoomLevel.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={() => setZoomLevel(Math.min(3.5, zoomLevel + 0.25))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Zoom in timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Scrollable Multi-Track Area */}
      <div 
        ref={timelineScrollRef}
        className="relative overflow-x-auto overflow-y-hidden timeline-scrollbar"
        style={{ height: '240px' }}
      >
        <div 
          className="relative min-h-full"
          style={{ width: `${totalTimelineWidth}px` }}
        >
          {/* 1. Time Ruler Header */}
          <div 
            onMouseDown={handleMouseDownRuler}
            className="h-7 bg-[#0d1424] border-b border-slate-800/80 flex items-center relative cursor-ew-resize pl-[120px]"
          >
            {rulerTicks.map((tickSec) => {
              const tickLeft = 120 + tickSec * pixelsPerSecond;
              return (
                <div
                  key={`tick-${tickSec}`}
                  className="absolute bottom-0 flex flex-col items-center pointer-events-none"
                  style={{ left: `${tickLeft}px` }}
                >
                  <span className="text-[9px] font-mono text-slate-400 -translate-x-1/2">
                    {formatSeconds(tickSec)}
                  </span>
                  <div className="w-[1px] h-2 bg-slate-700 mt-0.5" />
                </div>
              );
            })}
          </div>

          {/* 2. Track 1: Media Clips (Video & Photos) */}
          <div className="flex h-24 border-b border-slate-800/60 bg-[#080d1a]/80">
            {/* Track Label Header */}
            <div className="w-[120px] shrink-0 p-2.5 bg-[#0e1628] border-r border-slate-800 flex flex-col justify-center space-y-0.5 sticky left-0 z-20 shadow-md">
              <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-[11px]">
                <VideoIcon className="w-3.5 h-3.5" />
                <span>Media Track</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono">Video & Photos</span>
            </div>

            {/* Sequential Clip Blocks */}
            <div className="relative flex items-center h-full flex-1">
              {schedule.map((item, idx) => {
                const isSelected = selectedParagraphId === item.paragraph.id;
                const clipWidth = Math.max(65, item.duration * pixelsPerSecond);
                const isImage = !item.paragraph.media_path || item.paragraph.media_type === 'image' || /\.(jpe?g|png|webp|bmp)$/i.test(item.paragraph.media_path || '');
                const motion = item.paragraph.photo_motion || photoMotion || 'zoom_in';
                const transition = item.paragraph.photo_transition || photoTransition || 'fade_in_out';

                return (
                  <div
                    key={`clip-${item.paragraph.id}`}
                    onClick={() => {
                      onSelectParagraph(item.paragraph.id);
                      onSeek(item.start);
                    }}
                    style={{ width: `${clipWidth}px` }}
                    className={`h-[82px] mx-0.5 my-auto rounded-xl p-1.5 flex flex-col justify-between cursor-pointer transition-all border relative overflow-hidden group shadow-md shrink-0 ${
                      isSelected
                        ? 'bg-gradient-to-b from-blue-900/60 to-indigo-950/80 border-cyan-400 ring-2 ring-cyan-400/40'
                        : 'bg-[#10192e] hover:bg-[#14203a] border-slate-700/80'
                    }`}
                  >
                    {/* Top Row: Shot Badge & Transition Icon */}
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center space-x-1">
                        <span className="font-black text-cyan-300 bg-cyan-950/80 px-1 rounded border border-cyan-500/30">
                          #{item.paragraph.paragraph_number}
                        </span>
                        <span className="text-slate-300 font-bold truncate max-w-[60px]">
                          {item.paragraph.part_number || `Shot ${item.paragraph.paragraph_number}`}
                        </span>
                      </div>

                      {/* Transition Icon between clips */}
                      <span 
                        className="text-[9px] font-mono px-1 rounded bg-slate-900/90 text-cyan-300 border border-slate-700" 
                        title={`Transition: ${transition}`}
                      >
                        {transition === 'fade_in_out' ? '🌓 Fade' : transition === 'none' ? '✂️ Cut' : transition}
                      </span>
                    </div>

                    {/* Center Row: Thumbnail preview & Motion tag */}
                    <div className="flex items-center space-x-2 my-auto">
                      <div className="w-10 h-8 rounded bg-black/60 overflow-hidden shrink-0 border border-slate-700 relative">
                        <img
                          src={api.getParagraphThumbnailUrl(item.paragraph.id)}
                          alt="Thumb"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="flex flex-col truncate min-w-0">
                        {isImage ? (
                          <span className="text-[9px] font-mono text-pink-300 font-bold truncate flex items-center space-x-0.5">
                            <Sparkles className="w-2.5 h-2.5 shrink-0 text-pink-400" />
                            <span className="truncate">{motion.replace('_', ' ').toUpperCase()}</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-blue-300 font-bold truncate flex items-center space-x-0.5">
                            <VideoIcon className="w-2.5 h-2.5 shrink-0 text-blue-400" />
                            <span>VIDEO</span>
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-slate-400 truncate">
                          {item.duration.toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {/* Bottom Progress Fill during playback */}
                    {currentTime >= item.start && currentTime <= item.end && (
                      <div 
                        className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, ((currentTime - item.start) / item.duration) * 100))}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Track 2: Voiceover Narration Track */}
          <div className="flex h-12 border-b border-slate-800/60 bg-[#070b16]/90">
            <div className="w-[120px] shrink-0 p-2 bg-[#0e1628] border-r border-slate-800 flex items-center space-x-1.5 text-purple-400 font-bold text-[11px] sticky left-0 z-20 shadow-md">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Voice Track</span>
            </div>

            <div className="relative flex items-center h-full flex-1">
              {schedule.map((item) => {
                const clipWidth = Math.max(65, item.duration * pixelsPerSecond);
                const hasVoice = !!(item.paragraph.audio_path || item.paragraph.latest_generation);

                return (
                  <div
                    key={`audio-${item.paragraph.id}`}
                    style={{ width: `${clipWidth}px` }}
                    className="h-8 mx-0.5 my-auto rounded-lg bg-purple-950/30 border border-purple-800/30 px-2 flex items-center justify-between text-[9px] font-mono shrink-0 overflow-hidden"
                  >
                    {hasVoice ? (
                      <>
                        <span className="text-purple-300 font-bold truncate">
                          🎙️ {item.paragraph.speaker || 'Narrator'}
                        </span>
                        <div className="flex items-center space-x-0.5 opacity-60">
                          {[3, 7, 5, 8, 4, 9, 6, 4].map((bar, i) => (
                            <div 
                              key={i} 
                              className="w-0.5 bg-purple-400 rounded-full" 
                              style={{ height: `${bar * 2}px` }}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-500 italic">No audio yet</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Track 3: Animated Subtitles & Titles Track */}
          <div className="flex h-11 bg-[#060912]/95">
            <div className="w-[120px] shrink-0 p-2 bg-[#0e1628] border-r border-slate-800 flex items-center space-x-1.5 text-amber-400 font-bold text-[11px] sticky left-0 z-20 shadow-md">
              <Type className="w-3.5 h-3.5" />
              <span>Text Titles</span>
            </div>

            <div className="relative flex items-center h-full flex-1">
              {schedule.map((item) => {
                const clipWidth = Math.max(65, item.duration * pixelsPerSecond);
                const text = item.paragraph.on_screen_text?.trim();

                return (
                  <div
                    key={`text-${item.paragraph.id}`}
                    style={{ width: `${clipWidth}px` }}
                    className={`h-7 mx-0.5 my-auto rounded-lg px-2 flex items-center text-[9px] font-mono shrink-0 overflow-hidden border ${
                      text 
                        ? 'bg-amber-950/40 border-amber-600/40 text-amber-300' 
                        : 'border-transparent text-slate-600'
                    }`}
                  >
                    {text ? (
                      <span className="truncate font-semibold" title={text}>
                        "{text}"
                      </span>
                    ) : (
                      <span className="text-slate-700 italic">None</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Scrubbable Vertical Playhead Needle */}
          <div 
            className="absolute top-0 bottom-0 pointer-events-none z-40 transition-transform duration-75"
            style={{ 
              transform: `translateX(${playheadLeftPos}px)`,
              left: 0,
            }}
          >
            {/* Playhead Cap */}
            <div className="w-3.5 h-3.5 bg-red-500 rounded-sm transform -translate-x-1/2 rotate-45 shadow-[0_0_8px_rgba(239,68,68,0.8)] -mt-1" />
            {/* Playhead Line */}
            <div className="w-[2px] h-full bg-red-500 transform -translate-x-1/2 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
          </div>
        </div>
      </div>
    </div>
  );
};
