import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Film, Video, Play, Pause, RefreshCw, Download, FolderOpen, 
  CheckCircle2, AlertCircle, Sparkles, Clock, Gauge, Image, FileVideo, 
  ChevronDown, ChevronUp, Layers, Scissors, Music, Volume2, Maximize2, Upload,
  Smartphone, Monitor, Square, Sliders, Type, ListOrdered
} from 'lucide-react';
import { Batch, Paragraph, ScanMediaResponse } from '../types';
import { api } from '../api';
import { BulkTextBySerialModal } from './BulkTextBySerialModal';

interface VideoTimelineEditorProps {
  batch: Batch;
  onUpdated: () => void;
}

export const VideoTimelineEditor: React.FC<VideoTimelineEditorProps> = ({ batch, onUpdated }) => {
  const [mediaFolder, setMediaFolder] = useState<string>(batch.media_folder || '');
  const [aspectRatio, setAspectRatio] = useState<string>(batch.aspect_ratio || '16:9');
  const [fitMode, setFitMode] = useState<string>(batch.fit_mode || 'crop');
  const [showOnScreenText, setShowOnScreenText] = useState<boolean>(true);
  const [textPosition, setTextPosition] = useState<'top' | 'bottom'>('top');
  const [textAnimationStyle, setTextAnimationStyle] = useState<'slide_down' | 'slide_left' | 'slide_right' | 'typewriter' | 'fade' | 'slide_up'>('slide_down');
  const [showBulkTextModal, setShowBulkTextModal] = useState<boolean>(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<number>(0);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanMediaResponse | null>(null);
  const [rendering, setRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [previewShot, setPreviewShot] = useState<Paragraph | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<number | null>(null);
  const [editingPathId, setEditingPathId] = useState<number | null>(null);
  const [customPathInput, setCustomPathInput] = useState<string>('');
  const [videoTimestamp, setVideoTimestamp] = useState<number>(Date.now());
  const [videoVolume, setVideoVolume] = useState<number>(1.0);
  const [narrationVolume, setNarrationVolume] = useState<number>(1.0);
  const [audioSource, setAudioSource] = useState<'master' | 'tight'>(
    (batch.tight_mp4_path || batch.tight_audio?.duration) ? 'tight' : 'master'
  );

  useEffect(() => {
    if (batch.aspect_ratio && batch.aspect_ratio !== aspectRatio) {
      setAspectRatio(batch.aspect_ratio);
    }
    if (batch.fit_mode && batch.fit_mode !== fitMode) {
      setFitMode(batch.fit_mode);
    }
  }, [batch.aspect_ratio, batch.fit_mode]);

  const handleUpdateConfig = async (newRatio?: string, newFit?: string) => {
    const targetRatio = newRatio || aspectRatio;
    const targetFit = newFit || fitMode;
    if (newRatio) setAspectRatio(newRatio);
    if (newFit) setFitMode(newFit);

    setVideoTimestamp(Date.now());

    try {
      await api.updateBatchVideoConfig(batch.id, {
        aspect_ratio: targetRatio,
        fit_mode: targetFit,
      });
      onUpdated();
    } catch (e) {
      console.error('Failed to update batch video config', e);
    }
  };
  const [renderProgress, setRenderProgress] = useState<{
    status: string;
    percentage: number;
    current_shot: number;
    total_shots: number;
    current_step: string;
    elapsed_seconds: number;
  }>({
    status: 'IDLE',
    percentage: 0,
    current_shot: 0,
    total_shots: 0,
    current_step: '',
    elapsed_seconds: 0
  });

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);

  const paragraphs = batch.paragraphs || [];
  const hasAudio = paragraphs.some(p => p.audio_path || p.latest_generation);
  const matchedMediaCount = paragraphs.filter(p => p.media_path).length;
  const syncedVideoCount = paragraphs.filter(p => p.synced_video_path).length;

  const hasTightAudio = !!(
    batch.tight_audio?.duration || 
    paragraphs.some(p => p.latest_generation?.tight_duration)
  );

  // Find currently active paragraph's on-screen text & elapsed time within shot
  const activeShotDetails = useMemo(() => {
    if (!paragraphs.length) return null;
    let accumulated = 0;
    for (const p of paragraphs) {
      const shotDur = audioSource === 'tight'
        ? (p.latest_generation?.tight_duration || p.latest_generation?.duration || 2.5)
        : (p.latest_generation?.duration || 2.5);
      if (currentPlaybackTime >= accumulated && currentPlaybackTime < accumulated + shotDur) {
        return {
          text: p.on_screen_text?.trim() || null,
          shotElapsed: currentPlaybackTime - accumulated,
          shotDur
        };
      }
      accumulated += shotDur;
    }
    return null;
  }, [paragraphs, currentPlaybackTime, audioSource]);

  const activeShotOnScreenText = activeShotDetails?.text || null;

  // Real-time typewriter progress calculation
  const displayedOnScreenText = useMemo(() => {
    if (!activeShotDetails?.text) return '';
    if (textAnimationStyle !== 'typewriter') return activeShotDetails.text;

    const full = activeShotDetails.text;
    const typingDur = Math.min(1.8, activeShotDetails.shotDur * 0.65);
    const progress = Math.min(1, Math.max(0, activeShotDetails.shotElapsed / typingDur));
    const charsToShow = Math.max(1, Math.ceil(progress * full.length));
    return full.slice(0, charsToShow);
  }, [activeShotDetails, textAnimationStyle]);

  const activeVideoPath = audioSource === 'tight'
    ? batch.tight_mp4_path
    : batch.master_video_path;

  const activeVideoDuration = audioSource === 'tight'
    ? (batch.tight_video_duration || batch.tight_audio?.duration)
    : batch.master_video_duration;

  const handleBrowseFolder = async () => {
    setIsBrowsing(true);
    setRenderError(null);
    try {
      const res = await api.selectFolder('Select Video / Media Folder');
      if (res.status === 'ok' && res.folder_path) {
        setMediaFolder(res.folder_path);
        // Automatically trigger scan & match
        setScanning(true);
        try {
          const scanRes = await api.scanMedia(batch.id, res.folder_path);
          setScanResult(scanRes);
          onUpdated();
        } catch (scanErr: any) {
          setRenderError(scanErr.message || 'Failed to scan selected folder');
        } finally {
          setScanning(false);
        }
      } else if (res.status === 'NOT_SUPPORTED') {
        // Fallback to browser directory picker
        if (folderInputRef.current) {
          folderInputRef.current.click();
        }
      }
    } catch (e: any) {
      if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleBrowserFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setScanning(true);
    setRenderError(null);
    try {
      const fileList = Array.from(files);
      const res = await api.uploadMediaFiles(batch.id, fileList);
      setMediaFolder(res.media_folder);
      setScanResult(res);
      onUpdated();
    } catch (err: any) {
      setRenderError(err.message || 'Failed to upload and match media files');
    } finally {
      setScanning(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleScanMedia = async () => {
    if (!mediaFolder.trim()) {
      setRenderError('Please enter or select an assets folder first (e.g. C:/Videos/Assets)');
      return;
    }
    setScanning(true);
    setRenderError(null);
    try {
      const res = await api.scanMedia(batch.id, mediaFolder.trim());
      setScanResult(res);
      onUpdated();
    } catch (e: any) {
      setRenderError(e.message || 'Failed to scan media assets folder');
    } finally {
      setScanning(false);
    }
  };

  const handleManualAssign = async (paragraphId: number) => {
    if (!customPathInput.trim()) return;
    try {
      await api.assignMedia(batch.id, paragraphId, customPathInput.trim());
      setEditingPathId(null);
      setCustomPathInput('');
      onUpdated();
    } catch (e: any) {
      setRenderError(e.message || 'Failed to assign media to shot');
    }
  };

  const handleRenderMasterVideo = async () => {
    setRendering(true);
    setRenderError(null);
    setRenderProgress({
      status: 'RENDERING',
      percentage: 5,
      current_shot: 0,
      total_shots: paragraphs.length,
      current_step: `Preparing video assets for ${audioSource === 'tight' ? 'Tight / Trimmed' : 'Master'} timeline...`,
      elapsed_seconds: 0
    });

    const interval = setInterval(async () => {
      try {
        const prog = await api.getBatchRenderStatus(batch.id);
        if (prog && prog.status !== 'IDLE') {
          setRenderProgress(prog);
        }
      } catch {}
    }, 350);

    try {
      await api.renderBatchVideo(batch.id, { 
        videoVolume, 
        narrationVolume, 
        audioSource,
        aspectRatio,
        fitMode,
        burnOnScreenText: showOnScreenText,
        textAnimationStyle,
        textPosition
      });
      setRenderProgress({
        status: 'COMPLETED',
        percentage: 100,
        current_shot: paragraphs.length,
        total_shots: paragraphs.length,
        current_step: `${audioSource === 'tight' ? 'Tight' : 'Master'} timeline video rendered and ready!`,
        elapsed_seconds: 0
      });
      setVideoTimestamp(Date.now());
      onUpdated();
    } catch (e: any) {
      setRenderError(e.message || `Failed to render ${audioSource} video timeline`);
    } finally {
      clearInterval(interval);
      setRendering(false);
    }
  };

  const getPlayerContainerClass = (ratio: string) => {
    switch (ratio) {
      case '9:16':
        return 'w-full max-w-[340px] aspect-[9/16] max-h-[560px]';
      case '1:1':
        return 'w-full max-w-[460px] aspect-square';
      case '4:5':
        return 'w-full max-w-[400px] aspect-[4/5] max-h-[520px]';
      case '4:3':
        return 'w-full max-w-[560px] aspect-[4/3]';
      case '21:9':
        return 'w-full max-w-5xl aspect-[21/9]';
      case '16:9':
      default:
        return 'w-full max-w-4xl aspect-video';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0.0s';
    return `${seconds.toFixed(1)}s`;
  };

  const formatSpeedBadge = (factor?: number) => {
    if (!factor || Math.abs(factor - 1.0) < 0.02) {
      return { label: '1.00x Normal', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
    if (factor < 1.0) {
      const slowPct = Math.round((1.0 - factor) * 100);
      return { 
        label: `${factor.toFixed(2)}x Slowed (-${slowPct}%)`, 
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
      };
    }
    const speedPct = Math.round((factor - 1.0) * 100);
    return { 
      label: `${factor.toFixed(2)}x Sped (+${speedPct}%)`, 
      color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
    };
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner: Media Folder Connection & Controls */}
      <div className="bg-gradient-to-r from-[#0d1627] to-[#142340] border border-blue-500/30 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                <Film className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-white tracking-wide">
                VIDEO STUDIO & TIMELINE
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                1080p Full HD
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Select media folder to auto-match files (<code className="text-blue-300">1.mp4</code>, <code className="text-blue-300">2.jpg</code>...) to paragraph numbers. Speeds adjust losslessly to match audio durations.
            </p>
          </div>

          {/* Hidden Inputs for Browser Directory & File Picker */}
          <input
            type="file"
            // @ts-ignore
            webkitdirectory=""
            directory=""
            multiple
            ref={folderInputRef}
            onChange={handleBrowserFolderUpload}
            className="hidden"
          />
          <input
            type="file"
            multiple
            accept="video/*,image/*"
            ref={fileInputRef}
            onChange={handleBrowserFolderUpload}
            className="hidden"
          />

          {/* Folder Scanning & Selection Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative min-w-[260px]">
              <input
                type="text"
                value={mediaFolder}
                onChange={(e) => setMediaFolder(e.target.value)}
                placeholder="Media Folder path (e.g. C:/Videos/Assets)"
                className="w-full bg-[#090e1a] border border-slate-700 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none placeholder-slate-500"
              />
            </div>

            {/* Browse Desktop Folder Button */}
            <button
              type="button"
              onClick={handleBrowseFolder}
              disabled={scanning || isBrowsing}
              className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
              title="Click to open your computer's folder selection dialog"
            >
              <FolderOpen className={`w-3.5 h-3.5 ${isBrowsing ? 'animate-spin' : ''}`} />
              <span>{isBrowsing ? 'OPENING...' : 'BROWSE FOLDER'}</span>
            </button>

            {/* Upload / Pick Files from Browser or Mobile */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all active:scale-95 whitespace-nowrap cursor-pointer"
              title="Select video/image files (1.mp4, 2.jpg) from your device"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>SELECT FILES</span>
            </button>

            {/* Scan & Match Button */}
            <button
              onClick={handleScanMedia}
              disabled={scanning || !mediaFolder.trim()}
              className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'SCANNING...' : 'SCAN & MATCH'}</span>
            </button>
          </div>
        </div>

        {/* Scan Status Summary */}
        <div className="mt-4 pt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2 font-mono">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <span className="text-slate-400">Matched Media:</span>
              <strong className="text-emerald-400">{matchedMediaCount} / {paragraphs.length} shots</strong>
            </span>
            <span className="flex items-center space-x-1">
              <span className="text-slate-400">Synced Clips:</span>
              <strong className="text-cyan-400">{syncedVideoCount} / {paragraphs.length}</strong>
            </span>
            {batch.master_video_duration && (
              <span className="flex items-center space-x-1">
                <span className="text-slate-400">Master Duration:</span>
                <strong className="text-purple-400">{formatDuration(batch.master_video_duration)}</strong>
              </span>
            )}
            {batch.tight_audio?.duration && (
              <span className="flex items-center space-x-1">
                <span className="text-slate-400">Tight Duration:</span>
                <strong className="text-amber-400">{formatDuration(batch.tight_audio.duration)}</strong>
              </span>
            )}
          </div>

          {scanResult && (
            <div className="text-[11px] text-emerald-300 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/30">
              Scanned: {scanResult.total_files_found} files found in folder &bull; {scanResult.matches.length} matched
            </div>
          )}
        </div>
      </div>

      {renderError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{renderError}</span>
        </div>
      )}

      {/* Master Video Player & Render Bar */}
      <div className="bg-[#0c121e] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-[#101827]">
          {/* Left: Title & Audio Source Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${activeVideoPath ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-xs font-bold text-white tracking-wider uppercase">
                {audioSource === 'tight' ? '⚡ Tight Video Timeline' : '🌿 Master Video Timeline'}
              </span>
              {activeVideoPath && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                  READY ({formatDuration(activeVideoDuration)})
                </span>
              )}
            </div>

            {/* AUDIO SOURCE SELECTOR (Full Master vs Tight / Silence-Trimmed) */}
            <div className="flex items-center bg-slate-900/95 border border-slate-700/80 p-1 rounded-xl shadow-inner text-xs">
              <button
                type="button"
                onClick={() => setAudioSource('master')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  audioSource === 'master'
                    ? 'bg-blue-600 text-white font-bold shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Synchronize video using full narration audio"
              >
                <span>🌿 Full Narration</span>
                {batch.master_video_duration && (
                  <span className="text-[10px] font-mono opacity-80">({formatDuration(batch.master_video_duration)})</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setAudioSource('tight')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  audioSource === 'tight'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/60'
                }`}
                title="Synchronize video using tight silence-trimmed audio (Zero Dead-Air)"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>⚡ Tight / Trimmed</span>
                {batch.tight_audio?.duration ? (
                  <span className="text-[10px] font-mono opacity-90 font-bold">
                    ({formatDuration(batch.tight_audio.duration)})
                  </span>
                ) : hasTightAudio ? (
                  <span className="text-[9px] px-1 rounded bg-amber-400/20 text-amber-300 border border-amber-500/30">
                    READY
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Audio Mix Controls */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-[11px] shadow-sm">
              <div className="flex items-center space-x-1.5" title="Volume of source video clip's original soundtrack/effects">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-300 font-medium">Video Sound:</span>
                <select
                  value={videoVolume}
                  onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                  className="bg-slate-800 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-slate-600 outline-none text-[11px]"
                >
                  <option value="1.0">100% (Default)</option>
                  <option value="0.9">90%</option>
                  <option value="0.8">80%</option>
                  <option value="0.7">70%</option>
                  <option value="0.6">60%</option>
                  <option value="0.5">50%</option>
                  <option value="0.4">40%</option>
                  <option value="0.3">30%</option>
                  <option value="0.2">20%</option>
                  <option value="0.1">10%</option>
                  <option value="0.0">0% (Mute)</option>
                  <option value="1.2">120% (Boost)</option>
                  <option value="1.5">150% (Max)</option>
                </select>

                {/* Quick 10% - 100% Percentage Selector Pills */}
                <div className="hidden lg:flex items-center space-x-0.5 pl-1 border-l border-slate-700/80">
                  {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((vol) => (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => setVideoVolume(vol)}
                      className={`px-1 py-0.5 rounded text-[9px] font-mono transition-all ${
                        Math.abs(videoVolume - vol) < 0.02
                          ? 'bg-cyan-500 text-slate-950 font-black shadow-sm scale-105'
                          : 'bg-slate-800/80 text-slate-400 hover:text-cyan-300 hover:bg-slate-700'
                      }`}
                      title={`Set video sound volume to ${Math.round(vol * 100)}%`}
                    >
                      {Math.round(vol * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-slate-600">|</span>

              <div className="flex items-center space-x-1" title="Volume of voiceover narration">
                <Music className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-slate-300 font-medium">Voice:</span>
                <select
                  value={narrationVolume}
                  onChange={(e) => setNarrationVolume(parseFloat(e.target.value))}
                  className="bg-slate-800 text-purple-300 font-bold px-1.5 py-0.5 rounded border border-slate-600 outline-none text-[11px]"
                >
                  <option value="1.0">100% (Full)</option>
                  <option value="0.8">80%</option>
                  <option value="1.2">120%</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleRenderMasterVideo}
              disabled={rendering || matchedMediaCount === 0}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${
                audioSource === 'tight'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/20'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/20'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${rendering ? 'animate-spin text-amber-300' : ''}`} />
              <span>
                {rendering
                  ? `RENDERING ${audioSource.toUpperCase()}... ${renderProgress.percentage}%`
                  : `SYNC & STITCH ${audioSource === 'tight' ? 'TIGHT' : 'FULL'} VIDEO`}
              </span>
            </button>

            {activeVideoPath && (
              <a
                href={api.getMasterVideoUrl(batch.id, audioSource, aspectRatio, fitMode, undefined, true)}
                download={`batch_${batch.id}_${audioSource}_${aspectRatio.replace(':', 'x')}.mp4`}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all active:scale-95 cursor-pointer"
                title={`Export ${aspectRatio} (${audioSource === 'tight' ? 'Tight / Trimmed' : 'Master'}) Video MP4`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>EXPORT {aspectRatio} {audioSource.toUpperCase()} MP4</span>
              </a>
            )}
          </div>
        </div>

        {/* Aspect Ratio & Video Framing Toolbar */}
        <div className="px-4 py-2.5 bg-[#0e1626] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Aspect Ratio Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1 mr-1">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Aspect Ratio:</span>
            </span>

            {[
              { id: '16:9', label: '16:9 Landscape', res: '1920×1080', icon: Monitor },
              { id: '9:16', label: '9:16 Shorts/Reels', res: '1080×1920', icon: Smartphone },
              { id: '1:1', label: '1:1 Square', res: '1080×1080', icon: Square },
              { id: '4:5', label: '4:5 Portrait', res: '1080×1350', icon: Smartphone },
              { id: '4:3', label: '4:3 Classic', res: '1440×1080', icon: Monitor },
              { id: '21:9', label: '21:9 Ultrawide', res: '2560×1080', icon: Monitor },
            ].map((ratio) => {
              const Icon = ratio.icon;
              const isSelected = aspectRatio === ratio.id;
              return (
                <button
                  key={ratio.id}
                  type="button"
                  onClick={() => handleUpdateConfig(ratio.id, undefined)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 scale-105 font-bold'
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                  }`}
                  title={`${ratio.label} (${ratio.res})`}
                >
                  <Icon className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                  <span>{ratio.label}</span>
                </button>
              );
            })}
          </div>

          {/* Framing / Fit Mode */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400 font-medium">Fit Mode:</span>
            <div className="flex items-center bg-slate-900 border border-slate-700/80 p-0.5 rounded-lg text-[11px]">
              {[
                { id: 'crop', label: 'Fill & Crop', tip: 'Crops edges to fill frame completely' },
                { id: 'fit', label: 'Fit (Letterbox)', tip: 'Shows 100% of media with black bars' },
                { id: 'blur_pad', label: '✨ Studio Blur', tip: 'Fills background with blurred replica of media' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleUpdateConfig(undefined, m.id)}
                  className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                    fitMode === m.id
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={m.tip}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* On-Screen Text Animation Controls: Toggle, Style, Position, & Bulk Paste */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOnScreenText(!showOnScreenText)}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border shadow-sm ${
                showOnScreenText
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                  : 'bg-slate-900/80 text-slate-500 border-slate-800 hover:text-slate-300'
              }`}
              title={showOnScreenText ? "On-Screen Text animation is enabled" : "On-Screen Text animation is disabled"}
            >
              <Type className={`w-3.5 h-3.5 ${showOnScreenText ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>TEXT ANIMATION: {showOnScreenText ? 'ON' : 'OFF'}</span>
            </button>

            {showOnScreenText && (
              <>
                {/* Animation Style Selector */}
                <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs">
                  <span className="text-[10px] text-slate-400 px-1.5 font-mono uppercase">Style:</span>
                  <select
                    value={textAnimationStyle}
                    onChange={(e: any) => setTextAnimationStyle(e.target.value)}
                    className="bg-transparent text-amber-300 font-bold text-xs focus:outline-none cursor-pointer pr-2 py-0.5"
                  >
                    <option value="slide_down" className="bg-slate-900 text-slate-200">Slide Down (Top)</option>
                    <option value="slide_left" className="bg-slate-900 text-slate-200">Slide Left ➔ Center</option>
                    <option value="slide_right" className="bg-slate-900 text-slate-200">Slide Right ➔ Center</option>
                    <option value="typewriter" className="bg-slate-900 text-slate-200">Typewriter ⌨️</option>
                    <option value="fade" className="bg-slate-900 text-slate-200">Cinematic Fade</option>
                    <option value="slide_up" className="bg-slate-900 text-slate-200">Slide Up</option>
                  </select>
                </div>

                {/* Position Selector */}
                <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs">
                  <span className="text-[10px] text-slate-400 px-1.5 font-mono uppercase">Pos:</span>
                  <button
                    type="button"
                    onClick={() => setTextPosition('top')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                      textPosition === 'top'
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    TOP
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextPosition('bottom')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                      textPosition === 'bottom'
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    BOTTOM
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowBulkTextModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border shadow-sm bg-slate-900/80 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50"
              title="Bulk extract and assign on-screen text by serial number (e.g. 1. text, 2. text)"
            >
              <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
              <span>PASTE BY SERIAL NO</span>
            </button>
          </div>
        </div>

        {/* Real-time Render Progress Loading Bar */}
        {rendering && (
          <div className="p-4 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border-b border-indigo-500/30 space-y-2.5 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                </span>
                <span className="font-bold text-white tracking-wide">
                  RENDERING TIMELINE ({audioSource.toUpperCase()} &bull; {aspectRatio}):
                </span>
                <span className="text-cyan-300 font-mono text-[11px] bg-slate-900/90 px-2.5 py-0.5 rounded border border-slate-700">
                  {renderProgress.current_step || 'Synchronizing video clips to narration...'}
                </span>
              </div>

              <div className="flex items-center space-x-3 font-mono text-xs">
                {renderProgress.total_shots > 0 && (
                  <span className="text-slate-400">
                    Shot <strong className="text-purple-300">{renderProgress.current_shot}</strong> / {renderProgress.total_shots}
                  </span>
                )}
                {renderProgress.elapsed_seconds > 0 && (
                  <span className="text-slate-400">
                    Time: <strong className="text-slate-200">{renderProgress.elapsed_seconds.toFixed(1)}s</strong>
                  </span>
                )}
                <span className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400">
                  {renderProgress.percentage}%
                </span>
              </div>
            </div>

            {/* Glowing Animated Progress Bar */}
            <div className="w-full bg-slate-950/90 rounded-full h-3 overflow-hidden p-0.5 border border-indigo-500/40 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                style={{ width: `${Math.max(4, Math.min(100, renderProgress.percentage))}%` }}
              />
            </div>
          </div>
        )}

        {/* Video Canvas or Empty State */}
        <div className="p-4 flex flex-col items-center justify-center bg-black/40 min-h-[320px]">
          {activeVideoPath ? (
            <div className={`${getPlayerContainerClass(aspectRatio)} bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 relative transition-all duration-300`}>
              <video
                key={`${audioSource}-${aspectRatio}-${videoTimestamp}`}
                ref={videoPlayerRef}
                controls
                onTimeUpdate={(e) => setCurrentPlaybackTime(e.currentTarget.currentTime)}
                className="w-full h-full object-contain"
                src={api.getMasterVideoUrl(batch.id, audioSource, aspectRatio, fitMode, videoTimestamp)}
              />

              {/* Real-time Animated On-Screen Text Overlay in Center Top / Bottom */}
              {showOnScreenText && activeShotOnScreenText && (
                <div 
                  key={`${activeShotOnScreenText}-${textPosition}-${textAnimationStyle}`}
                  className={`absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none w-11/12 max-w-lg text-center transition-all duration-300 ${
                    textPosition === 'top' ? 'top-6 sm:top-10' : 'bottom-6 sm:bottom-12'
                  }`}
                >
                  <div className={`inline-block px-4 py-2 sm:px-5 sm:py-2.5 bg-black/85 backdrop-blur-md rounded-xl border border-amber-500/40 shadow-2xl shadow-black/90 transform ${
                    textAnimationStyle === 'slide_left' ? 'anim-slide-left' :
                    textAnimationStyle === 'slide_right' ? 'anim-slide-right' :
                    textAnimationStyle === 'slide_down' ? 'anim-slide-down' :
                    textAnimationStyle === 'slide_up' ? 'anim-slide-up' :
                    textAnimationStyle === 'fade' ? 'anim-fade' : ''
                  }`}>
                    <p className="text-xs sm:text-sm md:text-base font-black text-amber-300 tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] font-mono">
                      {displayedOnScreenText}
                      {textAnimationStyle === 'typewriter' && displayedOnScreenText.length < (activeShotOnScreenText?.length || 0) && (
                        <span className="inline-block w-1.5 h-3.5 sm:h-4 bg-amber-400 ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 px-4 space-y-4 max-w-md">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 mx-auto flex items-center justify-center">
                <Video className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">
                  {audioSource === 'tight' ? 'Tight / Trimmed Video Not Yet Rendered' : 'Master Video Not Yet Rendered'}
                </h3>
                <p className="text-xs text-slate-400">
                  {matchedMediaCount === 0 
                    ? 'Enter your media assets folder above and click "Scan & Match Assets" to link your clips.'
                    : `All ${matchedMediaCount} media assets are matched! Click "Sync & Stitch ${audioSource === 'tight' ? 'Tight' : 'Full'} Video" to compile.`
                  }
                </p>
              </div>
              {matchedMediaCount > 0 && (
                <button
                  onClick={handleRenderMasterVideo}
                  disabled={rendering}
                  className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg transition-all cursor-pointer ${
                    audioSource === 'tight'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/20'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/20'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate {audioSource === 'tight' ? 'Tight' : 'Full'} Video Timeline Now</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sequential Shot Timeline Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              SHOT TIMELINE & MEDIA ASSETS ({paragraphs.length} SHOTS)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Sequential auto-sync: audio duration locks video speed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paragraphs.map((para) => {
            const hasMedia = !!para.media_path;
            const isImage = para.media_type === 'image' || (para.media_path && /\.(jpe?g|png|webp)$/i.test(para.media_path));
            
            // Effective audio duration based on selected audio source
            const shotAudioDuration = audioSource === 'tight'
              ? (para.latest_generation?.tight_duration || para.latest_generation?.duration || (para.audio_path ? 10 : undefined))
              : (para.latest_generation?.duration || (para.audio_path ? 10 : undefined));

            // Calculate effective speed factor
            let effectiveSpeedFactor = para.speed_factor;
            if (audioSource === 'tight' && para.original_media_duration && shotAudioDuration && shotAudioDuration > 0) {
              effectiveSpeedFactor = para.original_media_duration / shotAudioDuration;
            }

            const speedInfo = formatSpeedBadge(effectiveSpeedFactor);
            const isExpanded = expandedShotId === para.id;

            return (
              <div
                key={para.id}
                className={`bg-[#0d1422] border rounded-2xl overflow-hidden transition-all flex flex-col justify-between ${
                  hasMedia ? 'border-slate-800 hover:border-slate-700' : 'border-dashed border-slate-800/80 opacity-80'
                }`}
              >
                {/* Shot Header */}
                <div className="p-3 bg-[#111a2c] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-600/30 text-blue-400 font-mono text-xs font-bold flex items-center justify-center border border-blue-500/30">
                      {para.paragraph_number}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {para.part_number || `Shot ${para.paragraph_number}`}
                    </span>
                  </div>

                  {/* Media Type Badge */}
                  {hasMedia ? (
                    <div className="flex items-center space-x-1.5">
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        {isImage ? <Image className="w-3 h-3 text-pink-400" /> : <FileVideo className="w-3 h-3 text-blue-400" />}
                        <span>{isImage ? 'IMAGE' : 'VIDEO'}</span>
                      </span>
                      {!isImage && (
                        <span className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-500/30" title="Source video sound is preserved & mixed with voice narration">
                          <Volume2 className="w-2.5 h-2.5 text-cyan-400" />
                          <span>SOUND ON</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] font-mono text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                      NO ASSET ({para.paragraph_number}.mp4)
                    </span>
                  )}
                </div>

                {/* Media Preview / Thumbnail Area */}
                <div className="relative aspect-video bg-black/60 flex items-center justify-center overflow-hidden group">
                  {hasMedia ? (
                    <>
                      <img
                        src={api.getParagraphThumbnailUrl(para.id)}
                        alt={`Shot ${para.paragraph_number} preview`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          // fallback if thumbnail route returns 404
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      {/* Play Preview Button Overlay */}
                      <button
                        onClick={() => setPreviewShot(para)}
                        className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-blue-600/80 hover:bg-blue-600 text-white flex items-center justify-center shadow-lg backdrop-blur-sm opacity-90 group-hover:opacity-100 transition-all active:scale-95"
                        title="Preview synchronized shot"
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center p-3 space-y-1">
                      <Film className="w-7 h-7 text-slate-600 mx-auto" />
                      <p className="text-[11px] text-slate-500 font-mono">
                        Expecting: {para.paragraph_number}.mp4 or {para.paragraph_number}.jpg
                      </p>
                    </div>
                  )}

                  {/* Speed Badge pill over video */}
                  {hasMedia && (
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border backdrop-blur-md shadow ${speedInfo.color}`}>
                        {speedInfo.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Timing & Durations Strip */}
                <div className="px-3 py-2 bg-[#090e18] border-y border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center space-x-1.5 text-slate-400">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span>Audio:</span>
                    <strong className="text-white">{formatDuration(shotAudioDuration)}</strong>
                    {audioSource === 'tight' && para.latest_generation?.tight_duration && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        ⚡ TIGHT
                      </span>
                    )}
                  </div>
                  {para.original_media_duration && (
                    <div className="flex items-center space-x-1 text-slate-400">
                      <Gauge className="w-3 h-3 text-indigo-400" />
                      <span>Orig Video:</span>
                      <strong className="text-slate-300">{formatDuration(para.original_media_duration)}</strong>
                    </div>
                  )}
                </div>

                {/* Shot Details (On-screen text, prompt, etc.) */}
                <div className="p-3 space-y-2 flex-1">
                  {/* Media File Name */}
                  <div className="text-[11px] text-slate-400 font-mono truncate flex items-center justify-between">
                    <span className="truncate" title={para.media_path || 'No media'}>
                      📁 {para.media_path ? para.media_path.split(/[/\\]/).pop() : 'Not linked'}
                    </span>
                    <button
                      onClick={() => {
                        setEditingPathId(editingPathId === para.id ? null : para.id);
                        setCustomPathInput(para.media_path || '');
                      }}
                      className="text-[10px] text-blue-400 hover:underline ml-2"
                    >
                      {editingPathId === para.id ? 'Cancel' : 'Change'}
                    </button>
                  </div>

                  {/* Manual file path input */}
                  {editingPathId === para.id && (
                    <div className="flex items-center space-x-1 pt-1">
                      <input
                        type="text"
                        value={customPathInput}
                        onChange={(e) => setCustomPathInput(e.target.value)}
                        placeholder="Path to .mp4 or .jpg"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleManualAssign(para.id)}
                        className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold"
                      >
                        Set
                      </button>
                    </div>
                  )}

                  {/* On-screen text cue & live editor */}
                  <div className="bg-slate-900/90 border border-slate-800/80 rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                        <Type className="w-3 h-3 text-amber-400" />
                        <span>On-Screen Text:</span>
                      </span>
                    </div>
                    <input
                      type="text"
                      defaultValue={para.on_screen_text || ''}
                      onBlur={async (e) => {
                        const val = e.target.value;
                        if (val !== (para.on_screen_text || '')) {
                          para.on_screen_text = val;
                          try {
                            await api.updateParagraph(para.id, { on_screen_text: val });
                            onUpdated();
                          } catch (err) {
                            console.error('Failed to update on_screen_text:', err);
                          }
                        }
                      }}
                      placeholder="Add on-screen text to animate..."
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-500 rounded px-2 py-1 text-[11px] text-amber-200 font-mono focus:outline-none placeholder:text-slate-600 transition-colors"
                    />
                  </div>

                  {/* Video Prompt */}
                  {para.video_prompt && (
                    <div className="text-[11px] text-slate-300">
                      <strong className="text-slate-400">Prompt: </strong>
                      <span className="line-clamp-2 text-slate-400 font-sans">{para.video_prompt}</span>
                    </div>
                  )}

                  {/* Transcript snippet */}
                  <div className="bg-slate-950/60 p-2 rounded-lg text-[11px] text-slate-300 font-sans line-clamp-2 border border-slate-800/60">
                    <span className="text-[10px] text-blue-400 font-mono block font-bold">Narration:</span>
                    {para.transcript}
                  </div>
                </div>

                {/* Collapsible Details */}
                <div className="p-3 pt-0">
                  <button
                    onClick={() => setExpandedShotId(isExpanded ? null : para.id)}
                    className="w-full flex items-center justify-center space-x-1 py-1 text-[10px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900/40 rounded border border-slate-800/40 transition-colors"
                  >
                    <span>{isExpanded ? 'Hide Details' : 'View Scene / SFX Notes'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono">
                      {para.scene_progression && (
                        <div>
                          <span className="text-blue-400 font-bold">Progression: </span>
                          <span className="text-slate-300">{para.scene_progression}</span>
                        </div>
                      )}
                      {para.overall_mood && (
                        <div>
                          <span className="text-purple-400 font-bold">Mood: </span>
                          <span className="text-slate-300">{para.overall_mood}</span>
                        </div>
                      )}
                      {para.sound_effects && (
                        <div>
                          <span className="text-emerald-400 font-bold">SFX: </span>
                          <span className="text-slate-300">{para.sound_effects}</span>
                        </div>
                      )}
                      {para.background_music && (
                        <div>
                          <span className="text-amber-400 font-bold">BGM: </span>
                          <span className="text-slate-300">{para.background_music}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Shot Video Preview Modal */}
      {previewShot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#101827] border border-blue-500/40 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-[#152037]">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-blue-600/30 text-blue-400 font-mono text-xs font-bold border border-blue-500/30">
                  Shot #{previewShot.paragraph_number}
                </span>
                <h3 className="font-bold text-sm text-white">
                  Synchronized Shot Preview
                </h3>
              </div>
              <button
                onClick={() => setPreviewShot(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-black flex items-center justify-center aspect-video">
              <video
                controls
                autoPlay
                className="w-full h-full object-contain"
                src={api.getParagraphVideoUrl(previewShot.id)}
              />
            </div>

            <div className="p-4 bg-[#0c121e] border-t border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-mono">
                <span>Speed Factor: <strong className="text-cyan-400">{previewShot.speed_factor?.toFixed(2) || '1.00'}x</strong></span>
                <span>File: <strong className="text-slate-300">{previewShot.media_path?.split(/[/\\]/).pop()}</strong></span>
              </div>
              <div className="flex items-center space-x-2 text-cyan-300 font-mono text-[11px] bg-cyan-950/30 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span>Audio Track: Video native sound and narration voiceover are synchronized and mixed together.</span>
              </div>
              {previewShot.on_screen_text && (
                <div className="text-amber-300 font-mono">
                  <strong>On-Screen Text: </strong> "{previewShot.on_screen_text}"
                </div>
              )}
              <div className="text-slate-300 font-sans">
                <strong>Narration: </strong> {previewShot.transcript}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Paste On-Screen Text by Serial Number Modal */}
      <BulkTextBySerialModal
        batchId={batch.id}
        paragraphs={paragraphs}
        isOpen={showBulkTextModal}
        onClose={() => setShowBulkTextModal(false)}
        onSuccess={() => onUpdated()}
      />
    </div>
  );
};
