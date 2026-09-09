import React, { useState, useRef } from 'react';
import { 
  Film, Video, Play, Pause, RefreshCw, Download, FolderOpen, 
  CheckCircle2, AlertCircle, Sparkles, Clock, Gauge, Image, FileVideo, 
  ChevronDown, ChevronUp, Layers, Scissors, Music, Volume2, Maximize2, Upload
} from 'lucide-react';
import { Batch, Paragraph, ScanMediaResponse } from '../types';
import { api } from '../api';

interface VideoTimelineEditorProps {
  batch: Batch;
  onUpdated: () => void;
}

export const VideoTimelineEditor: React.FC<VideoTimelineEditorProps> = ({ batch, onUpdated }) => {
  const [mediaFolder, setMediaFolder] = useState<string>(batch.media_folder || '');
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

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);

  const paragraphs = batch.paragraphs || [];
  const hasAudio = paragraphs.some(p => p.audio_path || p.latest_generation);
  const matchedMediaCount = paragraphs.filter(p => p.media_path).length;
  const syncedVideoCount = paragraphs.filter(p => p.synced_video_path).length;

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
    try {
      await api.renderBatchVideo(batch.id, { videoVolume, narrationVolume });
      setVideoTimestamp(Date.now());
      onUpdated();
    } catch (e: any) {
      setRenderError(e.message || 'Failed to render master video timeline');
    } finally {
      setRendering(false);
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
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#101827]">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wider">MASTER TIMELINE VIDEO</span>
            {batch.master_video_path && (
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                READY ({formatDuration(batch.master_video_duration)})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Audio Mix Controls */}
            <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-[11px] shadow-sm">
              <div className="flex items-center space-x-1" title="Volume of source video clip's original soundtrack/effects">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-300 font-medium">Video Sound:</span>
                <select
                  value={videoVolume}
                  onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                  className="bg-slate-800 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-slate-600 outline-none text-[11px]"
                >
                  <option value="1.0">100% (Default)</option>
                  <option value="0.8">80%</option>
                  <option value="0.5">50%</option>
                  <option value="1.2">120% (Boost)</option>
                  <option value="0.0">Mute (0%)</option>
                </select>
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
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              <Sparkles className={`w-3.5 h-3.5 ${rendering ? 'animate-spin' : ''}`} />
              <span>{rendering ? 'RENDERING & STITCHING VIDEO...' : 'RENDER & STITCH FULL VIDEO'}</span>
            </button>

            {batch.master_video_path && (
              <a
                href={api.getMasterVideoUrl(batch.id)}
                download={`batch_${batch.id}_master.mp4`}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all active:scale-95"
                title="Export Master Video MP4"
              >
                <Download className="w-3.5 h-3.5" />
                <span>EXPORT MP4</span>
              </a>
            )}
          </div>
        </div>

        {/* Video Canvas or Empty State */}
        <div className="p-4 flex flex-col items-center justify-center bg-black/40 min-h-[320px]">
          {batch.master_video_path ? (
            <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 relative">
              <video
                key={`master-${videoTimestamp}`}
                ref={videoPlayerRef}
                controls
                className="w-full h-full object-contain"
                src={`${api.getMasterVideoUrl(batch.id)}?t=${videoTimestamp}`}
              />
            </div>
          ) : (
            <div className="text-center py-12 px-4 space-y-4 max-w-md">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 mx-auto flex items-center justify-center">
                <Video className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Master Video Not Yet Rendered</h3>
                <p className="text-xs text-slate-400">
                  {matchedMediaCount === 0 
                    ? 'Enter your media assets folder above and click "Scan & Match Assets" to link your clips.'
                    : `All ${matchedMediaCount} media assets are matched! Click "Render & Stitch Full Video" to compile the video.`
                  }
                </p>
              </div>
              {matchedMediaCount > 0 && (
                <button
                  onClick={handleRenderMasterVideo}
                  disabled={rendering}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Full Video Timeline Now</span>
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
            const speedInfo = formatSpeedBadge(para.speed_factor);
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
                  <div className="flex items-center space-x-1 text-slate-400">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span>Audio:</span>
                    <strong className="text-white">{formatDuration(para.latest_generation?.duration || (para.audio_path ? 10 : undefined))}</strong>
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

                  {/* On-screen text cue */}
                  {para.on_screen_text && (
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                        On-Screen Text:
                      </span>
                      <p className="text-[11px] text-amber-200 font-mono line-clamp-2">
                        "{para.on_screen_text}"
                      </p>
                    </div>
                  )}

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
    </div>
  );
};
