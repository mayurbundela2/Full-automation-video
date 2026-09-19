import React, { useRef, useEffect, useMemo, useState } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, 
  Sparkles, Scissors, Image as ImageIcon, Video as VideoIcon, 
  ChevronLeft, ChevronRight, Sliders, Film,
  Move, Pencil, Check, X, GripHorizontal
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
  masterVideoPath?: string | null;
  videoTimestamp?: number;
  textX?: number;
  textY?: number;
  textScale?: number;
  onUpdateTextPosition?: (x: number, y: number, scale?: number) => void;
  onUpdateParagraphText?: (paragraphId: number, text: string) => void;
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
  masterVideoPath,
  videoTimestamp,
  textX,
  textY,
  textScale,
  onUpdateTextPosition,
  onUpdateParagraphText,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const masterVideoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  const hasMasterVideo = Boolean(masterVideoPath);
  const [previewMode, setPreviewMode] = useState<'composition' | 'rendered'>('composition');

  const masterVideoUrl = useMemo(() => {
    if (!hasMasterVideo) return null;
    return api.getMasterVideoUrl(batch.id, audioSource, videoTimestamp);
  }, [batch.id, audioSource, videoTimestamp, hasMasterVideo]);

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

  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Position & scale state
  const [localTextX, setLocalTextX] = useState<number>(
    activePara?.text_x ?? textX ?? batch.text_x ?? 50
  );
  const [localTextY, setLocalTextY] = useState<number>(
    activePara?.text_y ?? textY ?? batch.text_y ?? (textPosition === 'bottom' ? 88 : 10)
  );
  const [localTextScale, setLocalTextScale] = useState<number>(
    activePara?.text_scale ?? textScale ?? batch.text_scale ?? 100
  );

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isSnappedX, setIsSnappedX] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [editTextValue, setEditTextValue] = useState<string>('');

  useEffect(() => {
    if (!isDragging && !isResizing) {
      if (activePara?.text_x !== undefined) setLocalTextX(activePara.text_x);
      else if (textX !== undefined) setLocalTextX(textX);
      else if (batch.text_x !== undefined) setLocalTextX(batch.text_x);
      else setLocalTextX(50);

      if (activePara?.text_y !== undefined) setLocalTextY(activePara.text_y);
      else if (textY !== undefined) setLocalTextY(textY);
      else if (batch.text_y !== undefined) setLocalTextY(batch.text_y);
      else setLocalTextY(textPosition === 'bottom' ? 88 : 10);

      if (activePara?.text_scale !== undefined) setLocalTextScale(activePara.text_scale);
      else if (textScale !== undefined) setLocalTextScale(textScale);
      else if (batch.text_scale !== undefined) setLocalTextScale(batch.text_scale);
      else setLocalTextScale(100);
    }
  }, [activePara?.id, activePara?.text_x, activePara?.text_y, activePara?.text_scale, textX, textY, textScale, textPosition, batch.text_x, batch.text_y, batch.text_scale]);

  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const resizeStartRef = useRef<{ startX: number; startY: number; initScale: number } | null>(null);

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (isEditingText || previewMode === 'rendered') return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: localTextX,
      initY: localTextY,
    };
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    if (previewMode === 'rendered') return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initScale: localTextScale,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragStartRef.current && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const dxPct = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100;
        const dyPct = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100;

        let newX = Math.round((dragStartRef.current.initX + dxPct) * 10) / 10;
        let newY = Math.round((dragStartRef.current.initY + dyPct) * 10) / 10;

        newX = Math.max(5, Math.min(95, newX));
        newY = Math.max(5, Math.min(95, newY));

        if (Math.abs(newX - 50) < 2.5) {
          newX = 50;
          setIsSnappedX(true);
        } else {
          setIsSnappedX(false);
        }

        setLocalTextX(newX);
        setLocalTextY(newY);
      } else if (isResizing && resizeStartRef.current && viewportRef.current) {
        const dx = e.clientX - resizeStartRef.current.startX;
        const dy = e.clientY - resizeStartRef.current.startY;
        const delta = (dx + dy) * 0.4;
        let newScale = Math.round(resizeStartRef.current.initScale + delta);
        newScale = Math.max(50, Math.min(250, newScale));
        setLocalTextScale(newScale);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setIsSnappedX(false);
        dragStartRef.current = null;
        onUpdateTextPosition?.(localTextX, localTextY, localTextScale);
      }
      if (isResizing) {
        setIsResizing(false);
        resizeStartRef.current = null;
        onUpdateTextPosition?.(localTextX, localTextY, localTextScale);
      }
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, localTextX, localTextY, localTextScale, onUpdateTextPosition]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (previewMode === 'rendered') return;
    e.stopPropagation();
    setIsEditingText(true);
    setEditTextValue(targetText);
  };

  const handleCommitEdit = () => {
    if (activePara) {
      onUpdateParagraphText?.(activePara.id, editTextValue.trim());
    }
    setIsEditingText(false);
  };

  // Audio source URL for composition mode
  const audioUrl = useMemo(() => {
    if (audioSource === 'tight' && batch.tight_audio?.wav_path) {
      return api.getBatchTightAudioUrl(batch.id);
    }
    if (batch.combined_audio?.wav_path) {
      return api.getBatchAudioUrl(batch.id);
    }
    return null;
  }, [batch.id, audioSource, batch.tight_audio, batch.combined_audio]);

  // Dynamic volume synchronization
  useEffect(() => {
    const vVol = isMuted ? 0 : Math.min(1, Math.max(0, videoVolume));
    const nVol = isMuted ? 0 : Math.min(1, Math.max(0, narrationVolume));
    if (audioRef.current) {
      audioRef.current.volume = nVol;
    }
    if (videoRef.current) {
      videoRef.current.volume = vVol;
    }
    if (masterVideoRef.current) {
      masterVideoRef.current.volume = vVol;
    }
  }, [isMuted, videoVolume, narrationVolume]);

  // Seamless video clip playback on shot boundary transitions
  useEffect(() => {
    if (previewMode !== 'composition' || !hasVideoSource || !videoRef.current) return;
    const vid = videoRef.current;
    vid.volume = isMuted ? 0 : Math.min(1, Math.max(0, videoVolume));

    const syncAndPlay = () => {
      try {
        if (Math.abs(vid.currentTime - activeProgress.tInShot) > 0.12) {
          vid.currentTime = Math.max(0, activeProgress.tInShot);
        }
        if (isPlaying) {
          const p = vid.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        } else {
          vid.pause();
        }
      } catch (e) {
        // Ignore transient seek errors during media mounting
      }
    };

    if (vid.readyState >= 1) {
      syncAndPlay();
    } else {
      vid.addEventListener('loadedmetadata', syncAndPlay, { once: true });
      return () => {
        vid.removeEventListener('loadedmetadata', syncAndPlay);
      };
    }
  }, [activePara?.id, isPlaying, hasVideoSource, previewMode]);

  // Master video playback synchronization when in Rendered mode
  useEffect(() => {
    if (previewMode !== 'rendered' || !masterVideoRef.current) return;
    const mVid = masterVideoRef.current;
    mVid.volume = isMuted ? 0 : Math.min(1, Math.max(0, videoVolume));

    const syncAndPlay = () => {
      try {
        if (Math.abs(mVid.currentTime - currentTime) > 0.15) {
          mVid.currentTime = Math.max(0, Math.min(totalDuration, currentTime));
        }
        if (isPlaying) {
          const p = mVid.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        } else {
          mVid.pause();
        }
      } catch (e) {}
    };

    if (mVid.readyState >= 1) {
      syncAndPlay();
    } else {
      mVid.addEventListener('loadedmetadata', syncAndPlay, { once: true });
      return () => {
        mVid.removeEventListener('loadedmetadata', syncAndPlay);
      };
    }
  }, [previewMode, isPlaying]);

  // Main real-time playback animation frame loop
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
      if (masterVideoRef.current && !masterVideoRef.current.paused) {
        masterVideoRef.current.pause();
      }
      return;
    }

    let lastTimestamp = performance.now();
    let currentPlaybackTime = currentTime;

    if (previewMode === 'rendered') {
      if (masterVideoRef.current) {
        if (Math.abs(masterVideoRef.current.currentTime - currentTime) > 0.15) {
          masterVideoRef.current.currentTime = currentTime;
        }
        masterVideoRef.current.volume = isMuted ? 0 : Math.min(1, Math.max(0, videoVolume));
        masterVideoRef.current.play().catch(() => {});
      }
    } else {
      // Start narration audio if available
      if (audioRef.current) {
        audioRef.current.currentTime = currentTime;
        audioRef.current.volume = isMuted ? 0 : Math.min(1, narrationVolume);
        audioRef.current.play().catch(() => {});
      }

      // Start current shot video clip if present
      if (videoRef.current && hasVideoSource) {
        videoRef.current.currentTime = activeProgress.tInShot;
        videoRef.current.volume = isMuted ? 0 : Math.min(1, videoVolume);
        videoRef.current.play().catch(() => {});
      }
    }

    const tick = (now: number) => {
      const delta = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      // Continuous time advance
      currentPlaybackTime += delta;

      if (previewMode === 'rendered') {
        if (masterVideoRef.current && !masterVideoRef.current.paused && masterVideoRef.current.readyState >= 2) {
          const mTime = masterVideoRef.current.currentTime;
          if (Math.abs(mTime - currentPlaybackTime) > 0.08) {
            currentPlaybackTime = mTime;
          }
        }
      } else {
        // Smoothly sync from audio element if active and healthy
        if (audioRef.current && !audioRef.current.paused && audioRef.current.readyState >= 2) {
          const audioTime = audioRef.current.currentTime;
          if (Math.abs(audioTime - currentPlaybackTime) > 0.08) {
            currentPlaybackTime = audioTime;
          }
        }

        // Keep active shot video tightly in sync with voiceover timeline
        if (videoRef.current && hasVideoSource && !videoRef.current.paused && videoRef.current.readyState >= 2) {
          const expectedT = Math.max(0, currentPlaybackTime - (activeShotInfo?.start || 0));
          if (Math.abs(videoRef.current.currentTime - expectedT) > 0.2) {
            videoRef.current.currentTime = expectedT;
          }
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
  }, [isPlaying, totalDuration, previewMode]);

  // Seek audio & video when currentTime changes externally
  useEffect(() => {
    if (!isPlaying) {
      if (previewMode === 'rendered') {
        if (masterVideoRef.current && Math.abs(masterVideoRef.current.currentTime - currentTime) > 0.15) {
          masterVideoRef.current.currentTime = currentTime;
        }
      } else {
        if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.2) {
          audioRef.current.currentTime = currentTime;
        }
        if (videoRef.current && hasVideoSource) {
          videoRef.current.currentTime = activeProgress.tInShot;
        }
      }
    }
  }, [currentTime, isPlaying, hasVideoSource, activeProgress.tInShot, previewMode]);

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

    // In / Out Transition Curve Calculation
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
      className="relative flex flex-col items-center justify-center bg-[#070b14] rounded-2xl overflow-hidden border border-slate-800/90 shadow-2xl group select-none w-full"
    >
      {/* Hidden narration audio element synchronized to timeline (used in Composition mode) */}
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
          ref={viewportRef}
          style={containerAspectStyle}
          className="relative bg-black flex items-center justify-center overflow-hidden shadow-2xl rounded-xl border border-slate-800/80 transition-all duration-300"
        >
          {previewMode === 'rendered' && masterVideoUrl ? (
            /* Rendered Master Video Player View */
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              <video
                ref={masterVideoRef}
                src={masterVideoUrl}
                playsInline
                preload="auto"
                muted={isMuted}
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  vid.volume = isMuted ? 0 : Math.min(1, Math.max(0, videoVolume));
                  if (Math.abs(vid.currentTime - currentTime) > 0.15) {
                    vid.currentTime = Math.max(0, Math.min(totalDuration, currentTime));
                  }
                  if (isPlaying) {
                    vid.play().catch(() => {});
                  }
                }}
                className={`w-full h-full ${
                  fitMode === 'fit' ? 'object-contain' : 'object-cover'
                }`}
              />
              <div className="absolute top-3 left-3 z-30 flex items-center space-x-2 pointer-events-none">
                <span className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-black bg-emerald-950/85 text-emerald-300 border border-emerald-500/40 backdrop-blur-md shadow-lg">
                  <Film className="w-3 h-3 text-emerald-400" />
                  <span>RENDERED MASTER MP4</span>
                </span>
              </div>
              <div className="absolute top-3 right-3 z-30 flex items-center space-x-2 pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-black/75 text-emerald-300 border border-emerald-500/30 backdrop-blur-md shadow">
                  🎬 FULL TIMELINE &bull; {aspectRatio}
                </span>
              </div>
            </div>
          ) : activePara ? (
            /* Live Composition View */
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
                      playsInline
                      autoPlay={isPlaying}
                      loop
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
                    preload="auto"
                    onLoadedMetadata={(e) => {
                      const vid = e.currentTarget;
                      vid.volume = isMuted ? 0 : Math.min(1, Math.max(0, videoVolume));
                      if (Math.abs(vid.currentTime - activeProgress.tInShot) > 0.1) {
                        vid.currentTime = Math.max(0, activeProgress.tInShot);
                      }
                      if (isPlaying) {
                        vid.play().catch(() => {});
                      }
                    }}
                    onCanPlay={(e) => {
                      const vid = e.currentTarget;
                      if (isPlaying && vid.paused) {
                        vid.play().catch(() => {});
                      }
                    }}
                    className={`w-full h-full ${
                      fitMode === 'fit' ? 'object-contain' : 'object-cover'
                    }`}
                  />
                </div>
              )}

              {/* Center Snapping Visual Guide Line */}
              {isSnappedX && isDragging && (
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-amber-400/80 pointer-events-none z-25 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              )}

              {/* Interactive On-Screen Text Title Overlay */}
              {showOnScreenText && Boolean(targetText) && (
                <div 
                  key={`txt-box-${activePara?.id}`}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => { if (!isDragging && !isResizing) setIsHovered(false); }}
                  onDoubleClick={handleDoubleClick}
                  className={`absolute z-20 select-none ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  style={{
                    left: `${localTextX}%`,
                    top: `${localTextY}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 'max-content',
                    maxWidth: '92%',
                    touchAction: 'none'
                  }}
                >
                  {/* Floating Action / Coordinate Pill Toolbar on hover/drag */}
                  {(isHovered || isDragging || isResizing) && !isEditingText && previewMode !== 'rendered' && (
                    <div 
                      className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center space-x-1 bg-black/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-amber-500/50 shadow-2xl text-[10px] font-mono text-amber-200 pointer-events-auto z-40 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="flex items-center space-x-0.5 text-amber-400 font-bold">
                        <Move className="w-2.5 h-2.5" />
                        <span>{Math.round(localTextX)}%, {Math.round(localTextY)}%</span>
                      </span>
                      <span className="text-slate-600">&bull;</span>
                      <button 
                        type="button"
                        title="Decrease size"
                        onClick={() => {
                          const s = Math.max(50, localTextScale - 10);
                          setLocalTextScale(s);
                          onUpdateTextPosition?.(localTextX, localTextY, s);
                        }}
                        className="px-1 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-bold cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-bold text-cyan-300">{localTextScale}%</span>
                      <button 
                        type="button"
                        title="Increase size"
                        onClick={() => {
                          const s = Math.min(250, localTextScale + 10);
                          setLocalTextScale(s);
                          onUpdateTextPosition?.(localTextX, localTextY, s);
                        }}
                        className="px-1 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-bold cursor-pointer"
                      >
                        +
                      </button>
                      <span className="text-slate-600">&bull;</span>
                      <button
                        type="button"
                        title="Edit text in place (double-click also works)"
                        onClick={() => {
                          setIsEditingText(true);
                          setEditTextValue(targetText);
                        }}
                        className="p-1 rounded hover:bg-amber-500/20 text-amber-300 flex items-center cursor-pointer"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        title="Reset to center"
                        onClick={() => {
                          setLocalTextX(50);
                          setLocalTextY(textPosition === 'bottom' ? 88 : 10);
                          setLocalTextScale(100);
                          onUpdateTextPosition?.(50, textPosition === 'bottom' ? 88 : 10, 100);
                        }}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}

                  {/* Inline Text Editor Mode */}
                  {isEditingText ? (
                    <div 
                      className="flex flex-col items-center gap-1.5 p-2 bg-black/95 border-2 border-amber-400 rounded-xl shadow-2xl z-30 pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <textarea
                        autoFocus
                        rows={2}
                        value={editTextValue}
                        onChange={(e) => setEditTextValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleCommitEdit();
                          } else if (e.key === 'Escape') {
                            setIsEditingText(false);
                          }
                        }}
                        className="w-72 sm:w-96 text-center uppercase tracking-wider bg-transparent text-amber-300 font-bold focus:outline-none resize-none text-base sm:text-lg border-b border-amber-500/40 pb-1"
                        placeholder="Type on-screen text..."
                      />
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={handleCommitEdit}
                          className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1 cursor-pointer shadow"
                        >
                          <Check className="w-3 h-3" />
                          <span>Apply</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingText(false)}
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Displayed Draggable Text Container */
                    <div 
                      onMouseDown={handleMouseDownDrag}
                      className={`relative px-4 py-2 rounded-xl transition-all ${
                        (isHovered || isDragging || isResizing) && previewMode !== 'rendered'
                          ? 'ring-2 ring-amber-400/80 ring-dashed bg-black/25 backdrop-blur-[1px]'
                          : 'bg-transparent'
                      }`}
                    >
                      <div className={`inline-block bg-transparent transform ${
                        textAnimationStyle === 'slide_left' ? 'anim-slide-left' :
                        textAnimationStyle === 'slide_right' ? 'anim-slide-right' :
                        textAnimationStyle === 'slide_down' ? 'anim-slide-down' :
                        textAnimationStyle === 'slide_up' ? 'anim-slide-up' :
                        textAnimationStyle === 'fade' ? 'anim-fade' : ''
                      }`}>
                        <p 
                          className={`uppercase tracking-wider select-none text-center ${
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
                            fontSize: `calc(clamp(15px, 2.2vw, 28px) * (${localTextScale} / 100))`,
                            lineHeight: 1.15,
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

                      {/* Corner Resize Handle */}
                      {(isHovered || isDragging || isResizing) && previewMode !== 'rendered' && (
                        <div 
                          onMouseDown={handleMouseDownResize}
                          title="Drag to scale font size"
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-amber-400 hover:bg-amber-300 rounded-full border-2 border-black shadow-lg cursor-nwse-resize z-30 flex items-center justify-center transition-transform hover:scale-125"
                        />
                      )}
                    </div>
                  )}
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

        {/* Center: Live Editor Mode Selector / Indicator */}
        <div className="flex items-center space-x-2 text-[11px] font-mono">
          {hasMasterVideo ? (
            <div className="flex items-center bg-slate-900/90 border border-slate-700/80 p-0.5 rounded-lg shadow-sm">
              <button
                type="button"
                onClick={() => setPreviewMode('composition')}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'composition'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Live Multi-Shot Composition: Real-time text styles, Ken Burns photo motion, instant preview without rendering"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Live Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('rendered')}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'rendered'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
                title="Rendered Master Video: Play the stitched & burned full MP4 directly"
              >
                <Film className="w-3 h-3 text-emerald-400" />
                <span>Master MP4</span>
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center space-x-2 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>REAL-TIME EDIT ENGINE: Instant visual preview without re-rendering</span>
            </div>
          )}
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
