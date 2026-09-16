import React, { useRef, useEffect, useMemo, useState } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, 
  Sparkles, Scissors, Image as ImageIcon, Video as VideoIcon, 
  ChevronLeft, ChevronRight, Sliders
} from 'lucide-react';
import { Batch, Paragraph } from '../types';
import { api } from '../api';

interface LiveEditorPlayerProps {
  batch: Batch;
  paragraphs: Paragraph[];
  audioSource: 'master' | 'tight';
  aspectRatio: string;
  fitMode: string;
  photoMotion: string;
  photoTransition: string;
  showOnScreenText: boolean;
  textPosition: 'top' | 'bottom';
  textAnimationStyle: string;
  fontFamily: string;
  fontColor: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  selectedParagraphId: number | null;
  onSelectParagraph: (id: number) => void;
  videoVolume?: number;
  narrationVolume?: number;
  logoUrl?: string | null;
  logoEnabled?: boolean;
  logoPosition?: string;
  logoScale?: number;
  logoOpacity?: number;
}

export const LiveEditorPlayer: React.FC<LiveEditorPlayerProps> = ({
  batch,
  paragraphs,
  audioSource,
  aspectRatio,
  fitMode,
  photoMotion,
  photoTransition,
  showOnScreenText,
  textPosition,
  textAnimationStyle,
  fontFamily,
  fontColor,
  currentTime,
  isPlaying,
  onTimeUpdate,
  onTogglePlay,
  onSeek,
  selectedParagraphId,
  onSelectParagraph,
  videoVolume = 1.0,
  narrationVolume = 1.0,
  logoUrl,
  logoEnabled = false,
  logoPosition = 'top_right',
  logoScale = 12.0,
  logoOpacity = 0.85,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Calculate timeline start offsets and durations for each shot
  const timelineSchedule = useMemo(() => {
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
    if (timelineSchedule.length === 0) return 0;
    return timelineSchedule[timelineSchedule.length - 1].end;
  }, [timelineSchedule]);

  // Find currently active shot based on currentTime
  const activeShotInfo = useMemo(() => {
    if (timelineSchedule.length === 0) return null;
    const clampedTime = Math.max(0, Math.min(currentTime, totalDuration));
    for (const item of timelineSchedule) {
      if (clampedTime >= item.start && clampedTime < item.end) {
        return item;
      }
    }
    return timelineSchedule[timelineSchedule.length - 1];
  }, [timelineSchedule, currentTime, totalDuration]);

  // Sync selected paragraph when scrubbing/playing
  useEffect(() => {
    if (activeShotInfo && activeShotInfo.paragraph.id !== selectedParagraphId) {
      onSelectParagraph(activeShotInfo.paragraph.id);
    }
  }, [activeShotInfo?.paragraph.id]);

  // Active shot metrics for real-time motion & transitions
  const activeProgress = useMemo(() => {
    if (!activeShotInfo) return { progress: 0, tInShot: 0, duration: 2.5 };
    const tInShot = Math.max(0, currentTime - activeShotInfo.start);
    const progress = Math.min(1, Math.max(0, tInShot / Math.max(0.1, activeShotInfo.duration)));
    return { progress, tInShot, duration: activeShotInfo.duration };
  }, [activeShotInfo, currentTime]);

  const activePara = activeShotInfo?.paragraph || null;
  const isImageMedia = !activePara?.media_path || activePara.media_type === 'image' || /\.(jpe?g|png|webp|bmp)$/i.test(activePara.media_path || '');
  const hasVideoSource = !!(activePara?.media_path && !isImageMedia);

  // Audio source URL
  const audioUrl = useMemo(() => {
    if (audioSource === 'tight' && batch.tight_audio?.wav_path) {
      return api.getBatchTightAudioUrl(batch.id);
    }
    if (batch.combined_audio?.wav_path) {
      return api.getBatchAudioUrl(batch.id);
    }
    return null;
  }, [batch.id, audioSource, batch.tight_audio, batch.combined_audio]);

  // Real-time animation loop when playing
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      return;
    }

    let lastTimestamp = performance.now();
    let currentPlaybackTime = currentTime;

    // Start audio if available
    if (audioRef.current) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.volume = isMuted ? 0 : Math.min(1, narrationVolume);
      audioRef.current.play().catch(() => {});
    }

    // Start video clip if present
    if (videoRef.current && hasVideoSource) {
      videoRef.current.currentTime = activeProgress.tInShot;
      videoRef.current.volume = isMuted ? 0 : Math.min(1, videoVolume);
      videoRef.current.play().catch(() => {});
    }

    const tick = (now: number) => {
      const delta = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      // Continuous time advance
      currentPlaybackTime += delta;

      // Smoothly sync from audio element if active and healthy
      if (audioRef.current && !audioRef.current.paused && audioRef.current.readyState >= 2) {
        const audioTime = audioRef.current.currentTime;
        if (Math.abs(audioTime - currentPlaybackTime) > 0.08) {
          currentPlaybackTime = audioTime;
        }
      }

      if (currentPlaybackTime >= totalDuration) {
        onSeek(0);
        onTogglePlay(); // Pause at end
        return;
      }

      onTimeUpdate(currentPlaybackTime);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, totalDuration]);

  // Seek audio & video when currentTime changes externally
  useEffect(() => {
    if (!isPlaying) {
      if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.2) {
        audioRef.current.currentTime = currentTime;
      }
      if (videoRef.current && hasVideoSource) {
        videoRef.current.currentTime = activeProgress.tInShot;
      }
    }
  }, [currentTime, isPlaying, hasVideoSource, activeProgress.tInShot]);

  // Calculate Real-Time Ken Burns Keyframing Transform Style
  const photoMotionStyle = useMemo(() => {
    if (!isImageMedia) return {};

    const motion = activePara?.photo_motion || photoMotion || 'zoom_in';
    const transition = activePara?.photo_transition || photoTransition || 'fade_in_out';
    const { progress, tInShot, duration } = activeProgress;

    let scale = 1.0;
    let translateX = 0;
    let translateY = 0;

    switch (motion) {
      case 'zoom_out':
        scale = 1.20 - (0.20 * progress);
        break;
      case 'pan_left':
        scale = 1.20;
        translateX = (0.5 - progress) * 12; // in percentage
        break;
      case 'pan_right':
        scale = 1.20;
        translateX = (progress - 0.5) * 12; // in percentage
        break;
      case 'zoom_pan':
        scale = 1.0 + (0.20 * progress);
        translateX = (progress - 0.5) * 8;
        break;
      case 'none':
        scale = 1.0;
        break;
      case 'zoom_in':
      default:
        scale = 1.0 + (0.20 * progress);
        break;
    }

    // In / Out Transition Curve Calculation (subtle edge transition so image stays 100% visible until audio finishes)
    const fadeDuration = Math.min(0.12, Math.max(0.06, duration * 0.05));
    const entranceProgress = Math.min(1, Math.max(0, tInShot / fadeDuration));
    const timeUntilEnd = Math.max(0, duration - tInShot);
    const exitProgress = Math.min(1, Math.max(0, timeUntilEnd / fadeDuration));


    let opacity = 1.0;

    switch (transition) {
      case 'fade_in':
        opacity = entranceProgress;
        break;
      case 'fade_out':
        opacity = exitProgress;
        break;
      case 'zoom_pop':
        if (tInShot < fadeDuration) {
          const popFactor = 1.15 - (0.15 * entranceProgress);
          scale *= popFactor;
        }
        opacity = entranceProgress;
        break;
      case 'none':
        opacity = 1.0;
        break;
      case 'fade_in_out':
      default:
        opacity = Math.min(entranceProgress, exitProgress);
        break;
    }

    return {
      transform: `scale(${scale.toFixed(4)}) translate3d(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%, 0)`,
      opacity: Math.max(0, Math.min(1, opacity)),
      transition: isPlaying ? 'none' : 'transform 0.15s ease-out, opacity 0.15s ease-out',
      willChange: 'transform, opacity',
    };
  }, [isImageMedia, activePara?.photo_motion, photoMotion, activePara?.photo_transition, photoTransition, activeProgress, isPlaying]);

  // Real-time animated text slice
  const targetText = useMemo(() => {
    if (!activePara) return '';
    if (activePara.on_screen_text && activePara.on_screen_text.trim()) {
      return activePara.on_screen_text.trim();
    }
    // Fallback to spoken transcript without bracketed stage notes
    return (activePara.transcript || '').replace(/\[.*?\]/g, '').trim();
  }, [activePara?.on_screen_text, activePara?.transcript]);

  const displayedText = useMemo(() => {
    if (!targetText) return '';
    if (textAnimationStyle !== 'typewriter') return targetText;

    const typingDuration = Math.min(1.8, activeProgress.duration * 0.65);
    const textProgress = Math.min(1, Math.max(0, activeProgress.tInShot / typingDuration));
    const charsToShow = Math.max(1, Math.ceil(textProgress * targetText.length));
    return targetText.slice(0, charsToShow);
  }, [targetText, textAnimationStyle, activeProgress]);

  // Aspect ratio styling & dimensions
  const containerAspectStyle = useMemo<React.CSSProperties>(() => {
    switch (aspectRatio) {
      case '9:16':
        return { aspectRatio: '9 / 16', maxWidth: '340px', maxHeight: '580px', width: '100%' };
      case '1:1':
        return { aspectRatio: '1 / 1', maxWidth: '480px', maxHeight: '480px', width: '100%' };
      case '4:5':
        return { aspectRatio: '4 / 5', maxWidth: '416px', maxHeight: '520px', width: '100%' };
      case '4:3':
        return { aspectRatio: '4 / 3', maxWidth: '640px', maxHeight: '480px', width: '100%' };
      case '21:9':
        return { aspectRatio: '21 / 9', maxWidth: '940px', maxHeight: '380px', width: '100%' };
      case '16:9':
      default:
        return { aspectRatio: '16 / 9', maxWidth: '854px', maxHeight: '480px', width: '100%' };
    }
  }, [aspectRatio]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTimecode = (seconds: number) => {
    const s = Math.max(0, seconds);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const tenths = Math.floor((s % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Step prev / next shot
  const handleStepShot = (direction: 'prev' | 'next') => {
    if (!activeShotInfo || timelineSchedule.length === 0) return;
    const currentIndex = timelineSchedule.findIndex(s => s.paragraph.id === activeShotInfo.paragraph.id);
    if (direction === 'prev') {
      const prevIdx = Math.max(0, currentIndex - 1);
      onSeek(timelineSchedule[prevIdx].start);
    } else {
      const nextIdx = Math.min(timelineSchedule.length - 1, currentIndex + 1);
      onSeek(timelineSchedule[nextIdx].start);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col items-center justify-center bg-[#070b14] rounded-2xl overflow-hidden border border-slate-800/90 shadow-2xl group select-none"
    >
      {/* Hidden narration audio element synchronized to timeline */}
      {audioUrl && (
        <audio 
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onEnded={() => {
            if (isPlaying) onTogglePlay();
          }}
        />
      )}

      {/* Centered Studio Stage Area */}
      <div className="w-full flex items-center justify-center p-2 sm:p-4 bg-gradient-to-b from-[#050811] to-[#0a101d] overflow-hidden min-h-[360px]">
        {/* Main Viewport Container */}
        <div 
          style={containerAspectStyle}
          className="relative bg-black flex items-center justify-center overflow-hidden shadow-2xl rounded-xl border border-slate-800/80 transition-all duration-300"
        >
          {activePara ? (
            <>
              {/* Background Blur replica for blur_pad mode */}
              {fitMode === 'blur_pad' && activePara.media_path && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none filter blur-2xl scale-125 opacity-50">
                  {isImageMedia ? (
                    <img
                      src={api.getParagraphThumbnailUrl(activePara.id)}
                      alt="Blur background"
                      className="w-full h-full object-cover"
                    />

                ) : (
                  <video
                    src={api.getParagraphVideoUrl(activePara.id)}
                    className="w-full h-full object-cover"
                    muted
                  />
                )}
              </div>
            )}

            {/* Foreground Live Media Element */}
            {isImageMedia ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <img
                  key={`media-img-${activePara.id}`}
                  src={api.getParagraphThumbnailUrl(activePara.id)}
                  alt={`Shot ${activePara.paragraph_number}`}
                  style={photoMotionStyle}
                  className={`w-full h-full ${
                    fitMode === 'fit' ? 'object-contain' : 'object-cover'
                  }`}
                  onError={(e) => {
                    // Fallback placeholder if file not reachable
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <video
                  key={`media-vid-${activePara.id}`}
                  ref={videoRef}
                  src={api.getParagraphVideoUrl(activePara.id)}
                  muted={isMuted}
                  playsInline
                  className={`w-full h-full ${
                    fitMode === 'fit' ? 'object-contain' : 'object-cover'
                  }`}
                />
              </div>
            )}

            {/* Live Animated On-Screen Text Title Overlay */}
            {showOnScreenText && Boolean(targetText) && (
              <div 
                key={`txt-${activePara?.id}-${textPosition}-${textAnimationStyle}`}
                className={`absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none w-11/12 max-w-2xl text-center transition-all duration-200 ${
                  textPosition === 'top' ? 'top-3 sm:top-5' : 'bottom-5 sm:bottom-7'
                }`}
              >
                <div className={`inline-block px-3 py-1 bg-transparent transform ${
                  textAnimationStyle === 'slide_left' ? 'anim-slide-left' :
                  textAnimationStyle === 'slide_right' ? 'anim-slide-right' :
                  textAnimationStyle === 'slide_down' ? 'anim-slide-down' :
                  textAnimationStyle === 'slide_up' ? 'anim-slide-up' :
                  textAnimationStyle === 'fade' ? 'anim-fade' : ''
                }`}>
                  <p 
                    className={`text-base sm:text-xl md:text-2xl lg:text-3xl uppercase tracking-wider select-none ${
                      fontFamily === 'Anton' 
                        ? "font-['Anton',_sans-serif]" 
                        : fontFamily === 'Montserrat' 
                          ? "font-['Montserrat',_sans-serif] font-black" 
                          : "font-['Impact',_'Anton',_sans-serif]"
                    } ${
                      fontColor === 'white' 
                        ? 'text-white' 
                        : fontColor === 'cyan' 
                          ? 'text-cyan-300' 
                          : 'text-[#FFE800]'
                    }`}
                    style={{
                      WebkitTextStroke: '2.5px #000000',
                      paintOrder: 'stroke fill',
                      filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,1))'
                    }}
                  >
                    {displayedText}
                    {textAnimationStyle === 'typewriter' && displayedText.length < targetText.length && (
                      <span 
                        className="inline-block w-2 h-5 sm:h-6 ml-1 align-middle animate-pulse"
                        style={{
                          backgroundColor: fontColor === 'white' ? '#FFFFFF' : fontColor === 'cyan' ? '#00F5FF' : '#FFE800',
                          boxShadow: '0 0 6px #000000'
                        }} 
                      />
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Live Watermark Logo Overlay */}
            {logoEnabled && (logoUrl || batch.logo_url) && (
              <div 
                className={`absolute pointer-events-none z-30 transition-all duration-150 ${
                  logoPosition === 'top_left' ? 'top-3 left-3 sm:top-5 sm:left-5' :
                  logoPosition === 'bottom_left' ? 'bottom-3 left-3 sm:bottom-5 sm:left-5' :
                  logoPosition === 'bottom_right' ? 'bottom-3 right-3 sm:bottom-5 sm:right-5' :
                  logoPosition === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
                  'top-3 right-3 sm:top-5 sm:right-5'
                }`}
                style={{
                  width: `${logoScale}%`,
                  maxWidth: '45%',
                  minWidth: '40px',
                  opacity: logoOpacity,
                }}
              >
                <img
                  src={logoUrl || batch.logo_url}
                  alt="Watermark Logo"
                  className="w-full h-auto object-contain drop-shadow-lg select-none"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* Live HUD Badge Overlays in Top Corners */}
            <div className="absolute top-3 left-3 z-30 flex items-center space-x-2 pointer-events-none">
              <span className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-black bg-black/75 backdrop-blur-md text-white border border-white/20 shadow-lg">
                <span className="text-cyan-400">SHOT {activePara.paragraph_number}</span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{paragraphs.length}</span>
              </span>

              {isImageMedia ? (
                <span className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-pink-950/80 text-pink-300 border border-pink-500/40 backdrop-blur-md shadow">
                  <Sparkles className="w-3 h-3 text-pink-400" />
                  <span className="uppercase">{(activePara.photo_motion || photoMotion || 'zoom_in').replace('_', ' ')}</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-500/40 backdrop-blur-md shadow">
                  <VideoIcon className="w-3 h-3 text-blue-400" />
                  <span>VIDEO CLIP</span>
                </span>
              )}

              {isImageMedia && (
                <span className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 backdrop-blur-md shadow">
                  <Scissors className="w-3 h-3 text-cyan-400" />
                  <span className="uppercase">{(activePara.photo_transition || photoTransition || 'fade_in_out').replace('_', ' ')}</span>
                </span>
              )}
            </div>

            <div className="absolute top-3 right-3 z-30 flex items-center space-x-2 pointer-events-none">
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-black/75 text-emerald-300 border border-emerald-500/30 backdrop-blur-md shadow">
                🔴 LIVE PREVIEW &bull; {aspectRatio}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center p-6 space-y-2 text-slate-500">
            <ImageIcon className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-xs font-mono">No media shots loaded yet</p>
          </div>
        )}
        </div>
      </div>

      {/* Modern Player Controls Bar */}
      <div className="w-full px-4 py-2.5 bg-[#0b1220] border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Transport Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Rewind to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleStepShot('prev')}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Previous shot"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
            title={isPlaying ? "Pause (Space)" : "Play Live Preview (Space)"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleStepShot('next')}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Next shot"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Timecode Readout */}
          <div className="flex items-center space-x-1.5 font-mono text-xs pl-2">
            <span className="text-cyan-400 font-bold">{formatTimecode(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
          </div>
        </div>

        {/* Center: Live Editor Indicator */}
        <div className="hidden sm:flex items-center space-x-2 text-[11px] font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>REAL-TIME EDIT ENGINE: Instant visual preview without re-rendering</span>
        </div>

        {/* Right: Audio Volume & Fullscreen */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title={isMuted ? "Unmute audio" : "Mute audio"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Toggle fullscreen preview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
