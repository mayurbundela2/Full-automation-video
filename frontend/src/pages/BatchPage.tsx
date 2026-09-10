import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Plus, Play, Sparkles, FileDown, FolderOpen, Search, 
  CheckCircle, AlertTriangle, Layers, RefreshCw, Trash2,
  Zap, Scissors, Film, Video, Download, FileText, Clock, Eye, X, Copy, Check, FileSpreadsheet
} from 'lucide-react';
import { Project, Batch, VoiceItem } from '../types';
import { ParagraphCard } from '../components/ParagraphCard';
import { ReferenceImporter } from '../components/ReferenceImporter';
import { ScriptWordCheckerModal } from '../components/ScriptWordCheckerModal';
import { GenerationProgress } from '../components/GenerationProgress';
import { VideoTimelineEditor } from '../components/VideoTimelineEditor';
import { DataExporterModal } from '../components/DataExporterModal';
import { NativeExporter } from '../services/nativeExporter';
import { api } from '../api';

interface BatchPageProps {
  project: Project;
  onBack: () => void;
}

export const BatchPage: React.FC<BatchPageProps> = ({ project, onBack }) => {
  const roundTwo = (n: number) => Math.round(n * 100) / 100;
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showImporter, setShowImporter] = useState(false);
  const [showScriptChecker, setShowScriptChecker] = useState(false);
  const [showDataExporter, setShowDataExporter] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  
  // Batch generation status
  const [generatingAll, setGeneratingAll] = useState(false);
  const [progressState, setProgressState] = useState<{
    status: 'idle' | 'running' | 'completed' | 'error';
    current: number;
    total: number;
    message: string;
  }>({
    status: 'idle',
    current: 0,
    total: 0,
    message: '',
  });

  const [masterAudioUrl, setMasterAudioUrl] = useState<string>('');
  const [tightAudioUrl, setTightAudioUrl] = useState<string>('');
  const [tightening, setTightening] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [audioCacheKey, setAudioCacheKey] = useState<number>(Date.now());
  const [silenceThreshold, setSilenceThreshold] = useState<number>(0.18);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [subtitleModalType, setSubtitleModalType] = useState<'master' | 'tight'>('master');
  const [wordTimestamps, setWordTimestamps] = useState<any>(null);
  const [loadingTimestamps, setLoadingTimestamps] = useState(false);
  const [copiedWords, setCopiedWords] = useState(false);
  const [activeTab, setActiveTab] = useState<'paragraphs' | 'video'>('paragraphs');

  const fetchBatches = async () => {
    try {
      const data = await api.getBatches(project.id);
      setBatches(data);
      if (data.length > 0) {
        if (!selectedBatchId || !data.some((b) => b.id === selectedBatchId)) {
          setSelectedBatchId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCurrentBatch = async () => {
    if (!selectedBatchId) return;
    try {
      const b = await api.getBatch(selectedBatchId);
      setCurrentBatch(b);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoading(true);
      try {
        const [batchList, voiceList] = await Promise.all([
          api.getBatches(project.id),
          api.getVoices(),
        ]);
        if (!active) return;
        setVoices(voiceList);
        setBatches(batchList);

        if (batchList.length > 0) {
          const firstId = batchList[0].id;
          setSelectedBatchId(firstId);
          const firstBatch = await api.getBatch(firstId);
          if (active) setCurrentBatch(firstBatch);
        } else {
          try {
            const newB = await api.createBatch(project.id, 'Batch 01');
            if (active) {
              setBatches([newB]);
              setSelectedBatchId(newB.id);
              setCurrentBatch(newB);
            }
          } catch (e) {
            console.error('Auto-create batch error:', e);
          }
        }
      } catch (e) {
        console.error('BatchPage init error:', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [project.id]);

  useEffect(() => {
    if (selectedBatchId && !loading) {
      fetchCurrentBatch();
    }
  }, [selectedBatchId]);

  useEffect(() => {
    let active = true;
    const resolveBatchAudios = async () => {
      if (selectedBatchId) {
        if (NativeExporter.isNative()) {
          try {
            const mBlob = await api.getAudioBlob(`batch_${selectedBatchId}_master_audio`);
            if (mBlob && active && mBlob.size > 100) {
              setMasterAudioUrl(URL.createObjectURL(mBlob));
            } else if (active) {
              setMasterAudioUrl(`${api.getBatchAudioUrl(selectedBatchId, 'wav')}&t=${audioCacheKey}`);
            }
          } catch {
            if (active) setMasterAudioUrl(`${api.getBatchAudioUrl(selectedBatchId, 'wav')}&t=${audioCacheKey}`);
          }

          try {
            const tBlob = await api.getAudioBlob(`batch_${selectedBatchId}_tight_audio`);
            if (tBlob && active && tBlob.size > 100) {
              setTightAudioUrl(URL.createObjectURL(tBlob));
            } else if (active) {
              setTightAudioUrl(`${api.getBatchTightAudioUrl(selectedBatchId, 'wav')}&t=${audioCacheKey}`);
            }
          } catch {
            if (active) setTightAudioUrl(`${api.getBatchTightAudioUrl(selectedBatchId, 'wav')}&t=${audioCacheKey}`);
          }
        } else {
          if (active) {
            setMasterAudioUrl(`${api.getBatchAudioUrl(selectedBatchId, 'wav')}&t=${audioCacheKey}`);
            setTightAudioUrl(`${api.getBatchTightAudioUrl(selectedBatchId, 'wav')}&t=${audioCacheKey}`);
          }
        }
      }
    };

    resolveBatchAudios();
    return () => {
      active = false;
    };
  }, [selectedBatchId, audioCacheKey, currentBatch?.combined_audio?.duration, currentBatch?.tight_audio?.duration]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) return;
    try {
      const newBatch = await api.createBatch(project.id, newBatchName.trim());
      setBatches([...batches, newBatch]);
      setSelectedBatchId(newBatch.id);
      setNewBatchName('');
      setShowNewBatchModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBatch = async (batchId: number) => {
    if (!confirm('Are you sure you want to delete this batch and all its paragraphs?')) return;
    try {
      await api.deleteBatch(batchId);
      const remaining = batches.filter((b) => b.id !== batchId);
      setBatches(remaining);
      if (remaining.length > 0) {
        setSelectedBatchId(remaining[0].id);
      } else {
        setSelectedBatchId(null);
        setCurrentBatch(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateAll = async () => {
    if (!currentBatch || !selectedBatchId) return;

    // Only include paragraphs that are NOT already completed, NOT over limit, and have text
    const readyParas = (currentBatch.paragraphs || []).filter(
      (p) =>
        p.status !== 'COMPLETED' &&
        !(p.latest_generation && p.latest_generation.status === 'COMPLETED') &&
        p.limit_status !== 'OVER_LIMIT' &&
        Boolean(p.transcript?.trim())
    );

    if (readyParas.length === 0) {
      alert('All paragraphs in this batch are already generated! To re-generate any specific paragraph, click the Generate button on its individual card.');
      return;
    }

    setGeneratingAll(true);
    setProgressState({
      status: 'running',
      current: 0,
      total: readyParas.length,
      message: `Starting sequential generation of ${readyParas.length} ungenerated paragraph(s)...`,
    });

    try {
      for (let i = 0; i < readyParas.length; i++) {
        const para = readyParas[i];
        setProgressState({
          status: 'running',
          current: i + 1,
          total: readyParas.length,
          message: `Generating Paragraph ${para.paragraph_number} (${i + 1}/${readyParas.length})...`,
        });

        await api.generateParagraph(para.id);
        await fetchCurrentBatch();
      }

      // Auto-combine full narration & generate tight audio + subtitles
      setProgressState({
        status: 'running',
        current: readyParas.length,
        total: readyParas.length,
        message: 'Assembling full batch narration track & subtitles...',
      });

      try {
        await api.rebuildAllBatchAudio(selectedBatchId, silenceThreshold);
        await fetchCurrentBatch();
      } catch (combErr) {
        console.warn('Auto-combine note:', combErr);
      }

      setProgressState({
        status: 'completed',
        current: readyParas.length,
        total: readyParas.length,
        message: `Successfully generated ${readyParas.length} paragraph(s) & assembled full narration!`,
      });
    } catch (e: any) {
      setProgressState({
        status: 'error',
        current: progressState.current,
        total: readyParas.length,
        message: `Generation stopped: ${e.message || 'Unknown error'}`,
      });
    } finally {
      setGeneratingAll(false);
      await fetchCurrentBatch();
    }
  };

  const handleCombineBatchAudio = async () => {
    if (!selectedBatchId) return;
    try {
      await api.combineBatchAudio(selectedBatchId);
      setAudioCacheKey(Date.now());
      await fetchCurrentBatch();
    } catch (e: any) {
      alert(e.message || 'Failed to combine batch audio');
    }
  };

  const handleTightenBatchAudio = async () => {
    if (!selectedBatchId) return;
    setTightening(true);
    try {
      await api.tightenBatchAudio(selectedBatchId, silenceThreshold);
      setAudioCacheKey(Date.now());
      await fetchCurrentBatch();
    } catch (e: any) {
      alert(e.message || 'Failed to trim pauses');
    } finally {
      setTightening(false);
    }
  };

  const handleRebuildAll = async () => {
    if (!selectedBatchId) return;
    setRebuilding(true);
    try {
      await api.rebuildAllBatchAudio(selectedBatchId, silenceThreshold);
      setAudioCacheKey(Date.now());
      await fetchCurrentBatch();
    } catch (e: any) {
      alert(e.message || 'Failed to rebuild narration');
    } finally {
      setRebuilding(false);
    }
  };

  const handleExportAudio = async (type: 'master' | 'tight', format: 'wav' | 'mp3' = 'wav') => {
    if (!currentBatch) return;
    const key = `batch_${currentBatch.id}_${type}_audio`;
    const blob = await api.getAudioBlob(key);
    if (blob) {
      NativeExporter.shareOrDownloadBlob(blob, `batch_${currentBatch.id}_${type}.${format}`, `${currentBatch.name} - ${type} narration`);
      return;
    }
    const url = type === 'master' ? api.getBatchAudioUrl(currentBatch.id, format, true) : api.getBatchTightAudioUrl(currentBatch.id, format, true);
    NativeExporter.shareAudioUrl(url, `batch_${currentBatch.id}_${type}.${format}`);
  };

  const handleExportSubtitles = async (type: 'master' | 'tight', format: 'srt' | 'vtt' | 'json' = 'srt') => {
    if (!currentBatch) return;
    if (format === 'json') {
      const timestamps = await api.getBatchWordTimestamps(currentBatch.id, type);
      NativeExporter.shareText(`Word Timestamps`, JSON.stringify(timestamps, null, 2), `batch_${currentBatch.id}_${type}_timestamps.json`);
      return;
    }
    const subText = await api.getBatchSubtitleText(currentBatch.id, type, format as any);
    if (subText) {
      NativeExporter.shareText(`Subtitles`, subText, `batch_${currentBatch.id}_${type}.${format}`);
      return;
    }
    const url = api.getBatchSubtitlesUrl(currentBatch.id, format, type, true);
    window.open(url, '_blank');
  };

  const handleViewTimestamps = async (type: 'master' | 'tight') => {
    const bId = currentBatch?.id || selectedBatchId;
    if (!bId) return;
    setSubtitleModalType(type);
    setShowSubtitleModal(true);
    setLoadingTimestamps(true);
    try {
      const data = await api.getBatchWordTimestamps(bId, type);
      setWordTimestamps(data);
    } catch (e: any) {
      alert(e.message || 'Failed to fetch timestamps');
    } finally {
      setLoadingTimestamps(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const res = await api.getSettings();
      await api.openFolder(res.output_folder);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6 animate-fadeIn">
      {/* Top Breadcrumb & Project Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-studio-cardBorder">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition-colors"
            title="Back to Projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase font-mono text-blue-400 font-bold">PROJECT WORKSPACE</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {project.name}
            </h1>
          </div>
        </div>

        {/* Batch Selector and Add Batch Button */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          {batches.length > 0 && (
            <div className="flex items-center space-x-2 bg-studio-card p-1 rounded-xl border border-studio-cardBorder">
              <span className="text-xs text-studio-textMuted px-2 font-mono">Batch:</span>
              <select
                value={selectedBatchId || ''}
                onChange={(e) => setSelectedBatchId(Number(e.target.value))}
                className="bg-[#152037] border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.paragraphs?.length ?? b.total_paragraphs ?? 0} paras)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowNewBatchModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>NEW BATCH</span>
          </button>

          <button
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
            title="Open local outputs directory in Finder / File Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>OUTPUT FOLDER</span>
          </button>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-16 bg-studio-card/30 border border-dashed border-studio-cardBorder rounded-3xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No Batches Created Yet</h3>
            <p className="text-xs text-studio-textMuted max-w-sm mx-auto">
              Create "Batch 01" to paste your AI Studio reference script and begin voiceover generation.
            </p>
          </div>
          <button
            onClick={() => setShowNewBatchModal(true)}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Batch 01</span>
          </button>
        </div>
      ) : currentBatch ? (
        <div className="space-y-6">
          {/* Batch Status Bar & Action Banner */}
          <div className="bg-[#121B2D] border border-studio-cardBorder rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-3">
                <h2 className="text-base font-bold text-white">{currentBatch.name}</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase">
                  {currentBatch.status}
                </span>
              </div>

              {/* Stats badges */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-studio-textMuted">
                <span>Total Paras: <strong className="text-white">{currentBatch.paragraphs?.length || 0}</strong></span>
                <span>&bull;</span>
                <span>Words: <strong className="text-white">{currentBatch.total_words}</strong></span>
                <span>&bull;</span>
                <span className="text-emerald-400">Ready: <strong>{currentBatch.ready_count}</strong></span>
                {currentBatch.over_limit_count > 0 && (
                  <>
                    <span>&bull;</span>
                    <span className="text-rose-400 font-bold flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5 inline" />
                      <span>Over Limit: {currentBatch.over_limit_count}</span>
                    </span>
                  </>
                )}
                <span>&bull;</span>
                <span className="text-blue-400">Completed: <strong>{currentBatch.completed_count}</strong></span>
              </div>
            </div>

            {/* Main Batch Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowImporter(true)}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold border border-slate-700 transition-all shadow"
              >
                <FileDown className="w-4 h-4 text-blue-400" />
                <span>IMPORT SCRIPT</span>
              </button>

              <button
                onClick={() => setShowScriptChecker(true)}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold border border-slate-700 transition-all shadow"
                title="Verify and audit all script words sequence-wise against your master original script"
              >
                <Search className="w-4 h-4 text-emerald-400" />
                <span>CHECK SCRIPT WORDS</span>
              </button>

              <button
                onClick={() => setShowDataExporter(true)}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold border border-slate-700 transition-all shadow"
                title="Inspect, sort, filter, and export audio & video script cues"
              >
                <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                <span>DATA EXPORTER</span>
              </button>

              <button
                onClick={handleGenerateAll}
                disabled={generatingAll || currentBatch.ready_count === 0}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-blue-600/25 active:scale-95 transition-all"
                title="Sequentially generates all READY paragraphs in this batch"
              >
                {generatingAll ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>GENERATING...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>GENERATE READY ({currentBatch.ready_count})</span>
                  </>
                )}
              </button>

              {currentBatch.completed_count > 0 && (
                <button
                  onClick={handleRebuildAll}
                  disabled={rebuilding}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 active:scale-95 text-indigo-200 text-xs font-bold border border-indigo-500/40 transition-all shadow"
                  title="Rebuild full combined narration and tight timelines"
                >
                  <RefreshCw className={`w-4 h-4 text-indigo-400 ${rebuilding ? 'animate-spin' : ''}`} />
                  <span>{rebuilding ? 'REBUILDING FULL NARRATION...' : 'REBUILD FULL NARRATION'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Sequential Progress Bar (if generating) */}
          <GenerationProgress
            currentParagraph={progressState.current}
            totalParagraphs={progressState.total}
            status={progressState.status}
            message={progressState.message}
          />

          {/* Tab Navigation: Script & Audio vs Video Studio */}
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('paragraphs')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'paragraphs'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>SCRIPT & AUDIO ({currentBatch.paragraphs?.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveTab('video')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'video'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Film className="w-4 h-4 text-purple-300" />
              <span>VIDEO STUDIO & TIMELINE</span>
              {currentBatch.master_video_path && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>

          {activeTab === 'video' ? (
            <VideoTimelineEditor batch={currentBatch} onUpdated={fetchCurrentBatch} />
          ) : (
            <>
              {/* Unified Full Batch Audio Suite */}
              {currentBatch.completed_count > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Deck 1: Master Sequential Narration */}
                  <div className="bg-gradient-to-br from-[#0F1B30] to-[#142340] border border-indigo-500/40 rounded-2xl p-5 shadow-2xl flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-sm text-white tracking-wide">
                              MASTER NARRATION
                            </h3>
                            <p className="text-[11px] text-slate-300 font-mono">
                              {currentBatch.combined_audio
                                ? `All ${currentBatch.completed_count} parts joined • ${currentBatch.combined_audio.duration}s`
                                : `${currentBatch.completed_count} parts ready to assemble`}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={handleRebuildAll}
                          disabled={rebuilding}
                          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-semibold transition-all active:scale-95"
                          title="Rebuild master audio track"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                          <span>{rebuilding ? 'Rebuilding...' : 'Rebuild'}</span>
                        </button>
                      </div>

                      {/* Master Audio Element / CTA */}
                      {currentBatch.combined_audio ? (
                        <audio
                          key={`combined-${audioCacheKey}`}
                          controls
                          className="w-full h-10 rounded-xl accent-indigo-500 bg-slate-900/60"
                          src={masterAudioUrl || `${api.getBatchAudioUrl(currentBatch.id, 'wav')}&t=${audioCacheKey}`}
                        />
                      ) : (
                        <button
                          onClick={handleCombineBatchAudio}
                          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow flex items-center justify-center space-x-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Assemble Master Narration ({currentBatch.completed_count} Parts)</span>
                        </button>
                      )}
                    </div>

                    {/* Master Actions Bar */}
                    {currentBatch.combined_audio && (
                      <div className="pt-3 border-t border-indigo-500/20 flex flex-wrap items-center justify-between gap-2">
                        <button
                          onClick={() => handleViewTimestamps('master')}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 text-xs font-semibold transition-all active:scale-95"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Subtitles & Timestamps</span>
                        </button>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleExportAudio('master', 'wav')}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-all active:scale-95 flex items-center space-x-1"
                            title="Export Master WAV"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>WAV</span>
                          </button>

                          {currentBatch.combined_audio.mp3_path && (
                            <button
                              onClick={() => handleExportAudio('master', 'mp3')}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95 flex items-center space-x-1"
                              title="Export Master 320k MP3"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>MP3</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Deck 2: Tight Video Narration (Trimmed Pauses) */}
                  <div className="bg-gradient-to-br from-[#0B2520] to-[#0D332B] border border-emerald-500/40 rounded-2xl p-5 shadow-2xl flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                            <Scissors className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-extrabold text-sm text-white tracking-wide">
                                TIGHT TIMELINE
                              </h3>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-500/30">
                                0.18s CUT
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 font-mono">
                              {currentBatch.tight_audio
                                ? `${currentBatch.tight_audio.duration}s (${roundTwo(currentBatch.tight_audio.saved_seconds || 0)}s silence eliminated)`
                                : 'Fast-paced, zero dead-air timeline'}
                            </p>
                          </div>
                        </div>

                        {currentBatch.tight_audio && (
                          <button
                            onClick={handleTightenBatchAudio}
                            disabled={tightening}
                            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all active:scale-95"
                            title="Re-run pause trimming"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${tightening ? 'animate-spin' : ''}`} />
                            <span>{tightening ? 'Trimming...' : 'Re-trim'}</span>
                          </button>
                        )}
                      </div>

                      {/* Tight Audio Element / CTA */}
                      {currentBatch.tight_audio ? (
                        <audio
                          key={`tight-${audioCacheKey}`}
                          controls
                          className="w-full h-10 rounded-xl accent-emerald-500 bg-slate-900/60"
                          src={tightAudioUrl || `${api.getBatchTightAudioUrl(currentBatch.id, 'wav')}&t=${audioCacheKey}`}
                        />
                      ) : (
                        <button
                          onClick={handleTightenBatchAudio}
                          disabled={tightening}
                          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow flex items-center justify-center space-x-2"
                        >
                          <Zap className="w-4 h-4" />
                          <span>{tightening ? 'Trimming Silences...' : 'Trim Pauses & Generate Timeline'}</span>
                        </button>
                      )}
                    </div>

                    {/* Tight Actions Bar */}
                    {currentBatch.tight_audio && (
                      <div className="pt-3 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
                        <button
                          onClick={() => handleViewTimestamps('tight')}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-xs font-semibold transition-all active:scale-95"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>No-Pause Subtitles</span>
                        </button>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleExportAudio('tight', 'wav')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all active:scale-95 flex items-center space-x-1"
                            title="Export No-Pause WAV"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>WAV</span>
                          </button>

                          {currentBatch.tight_audio.mp3_path && (
                            <button
                              onClick={() => handleExportAudio('tight', 'mp3')}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95 flex items-center space-x-1"
                              title="Export No-Pause 320k MP3"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>MP3</span>
                            </button>
                          )}

                          {currentBatch.tight_audio.mp4_path && (
                            <a
                              href={api.getBatchTightAudioUrl(currentBatch.id, 'mp4', true)}
                              download
                              className="px-3 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white text-xs font-bold shadow transition-all active:scale-95 flex items-center space-x-1"
                              title="Download Timeline Video (MP4)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>MP4</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Paragraphs List */}
              {(!currentBatch.paragraphs || currentBatch.paragraphs.length === 0) ? (
                <div className="text-center py-12 bg-studio-card/20 border border-dashed border-studio-cardBorder rounded-2xl space-y-3">
                  <p className="text-xs text-studio-textMuted">
                    This batch has no paragraphs yet. Paste your AI Studio script breakdown to populate.
                  </p>
                  <button
                    onClick={() => setShowImporter(true)}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Import Script Reference</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentBatch.paragraphs.map((p) => (
                    <ParagraphCard
                      key={p.id}
                      paragraph={p}
                      voices={voices}
                      onUpdated={fetchCurrentBatch}
                      onDeleted={() => fetchCurrentBatch()}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-20 bg-studio-card/20 border border-dashed border-studio-cardBorder rounded-3xl space-y-4 animate-pulse">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 mx-auto flex items-center justify-center">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-xs font-mono text-studio-textMuted">Loading workspace batches and paragraphs...</p>
        </div>
      )}

            {/* Script Word Sequence Auditor Modal */}
      {showScriptChecker && currentBatch && (
        <ScriptWordCheckerModal
          paragraphs={currentBatch.paragraphs}
          batchNumber={currentBatch.batch_number}
          projectName={project.name}
          onClose={() => setShowScriptChecker(false)}
        />
      )}

      {/* Reference Importer Modal */}
      {showImporter && selectedBatchId && (
        <ReferenceImporter
          batchId={selectedBatchId}
          onImportSuccess={fetchCurrentBatch}
          onClose={() => setShowImporter(false)}
        />
      )}

      {/* New Batch Modal */}
      {showNewBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#111A2C] border border-[#233554] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <form onSubmit={handleCreateBatch}>
              <div className="px-6 py-4 border-b border-studio-cardBorder bg-[#152037]">
                <h3 className="font-bold text-sm text-white">CREATE NEW BATCH</h3>
                <p className="text-xs text-studio-textMuted">Batch {batches.length + 1} for {project.name}</p>
              </div>

              <div className="p-6 space-y-3">
                <label className="text-xs font-semibold text-white uppercase tracking-wider block">
                  Batch Name
                </label>
                <input
                  type="text"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  placeholder={`Batch ${batches.length + 1 < 10 ? '0' : ''}${batches.length + 1}`}
                  className="w-full bg-studio-bg border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                  autoFocus
                />
              </div>

              <div className="px-6 py-4 border-t border-studio-cardBorder bg-[#152037] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowNewBatchModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20"
                >
                  CREATE BATCH
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subtitle & Word-Level Timestamps Inspector Modal */}
      {showSubtitleModal && currentBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0F172A] border border-[#233554] rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-[#141E33] flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white tracking-wide uppercase">
                    Word-Level Timestamps ({subtitleModalType === 'tight' ? 'No-Pause Narration' : 'Master Narration'})
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {currentBatch.name} &bull; {wordTimestamps?.total_words || 0} words &bull; {wordTimestamps?.total_duration || 0}s duration
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSubtitleModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {loadingTimestamps ? (
                <div className="py-16 text-center text-slate-400 font-mono space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-400" />
                  <p className="text-xs">Loading word-level timestamps...</p>
                </div>
              ) : wordTimestamps && wordTimestamps.words && wordTimestamps.words.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400 font-mono">
                    <span>Click copy to export words or use direct download buttons below</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(wordTimestamps, null, 2));
                        setCopiedWords(true);
                        setTimeout(() => setCopiedWords(false), 2000);
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
                    >
                      {copiedWords ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedWords ? 'Copied JSON!' : 'Copy JSON'}</span>
                    </button>
                  </div>

                  {/* Word Grid Table */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {wordTimestamps.words.map((w: any, i: number) => (
                      <div
                        key={i}
                        className="bg-[#152037] border border-slate-800/80 hover:border-blue-500/50 rounded-xl p-2.5 flex items-center justify-between transition-all group"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-[10px] font-mono text-slate-500 w-5">#{w.index}</span>
                          <span className="text-xs font-bold text-white group-hover:text-blue-300 truncate">{w.word}</span>
                        </div>
                        <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 flex-shrink-0 ml-2">
                          {w.start}s &rarr; {w.end}s
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-mono text-xs">
                  No word timestamps generated yet. Click 'Rebuild Full Narration' to generate.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-800 bg-[#141E33] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-slate-400">Export Options:</span>
                <button
                  type="button"
                  onClick={() => handleExportSubtitles(subtitleModalType, 'srt')}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition-all active:scale-95"
                >
                  Export .SRT
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSubtitles(subtitleModalType, 'vtt')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                >
                  Export .VTT
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSubtitles(subtitleModalType, 'json')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                >
                  Export Words (.JSON)
                </button>
              </div>

              <button
                onClick={() => setShowSubtitleModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Script Sorter & Data Exporter Modal */}
      <DataExporterModal
        isOpen={showDataExporter}
        onClose={() => setShowDataExporter(false)}
        initialScript={currentBatch?.raw_reference || ''}
      />
    </div>
  );
};
