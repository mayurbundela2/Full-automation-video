import React, { useEffect, useState } from 'react';
import { 
  Sparkles, Loader2, CheckCircle2, AlertCircle, Clock, Zap, 
  ChevronDown, X, Layers, Flame, ArrowRight, ShieldCheck 
} from 'lucide-react';

export interface LoadingModalState {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  currentStep?: string;
  progress: number; // 0 - 100
  currentCount?: number;
  totalCount?: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  errorMessage?: string;
  startTime?: number; // timestamp when started
}

interface UniversalLoadingModalProps {
  state: LoadingModalState;
  onClose: () => void;
  onMinimize?: () => void;
}

export const UniversalLoadingModal: React.FC<UniversalLoadingModalProps> = ({
  state,
  onClose,
  onMinimize,
}) => {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!state.isOpen || state.status !== 'running' || !state.startTime) {
      if (state.status === 'completed' || state.status === 'error') {
        // freeze elapsed
      } else {
        setElapsed(0);
      }
      return;
    }

    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - (state.startTime || Date.now())) / 1000);
      setElapsed(sec);
    }, 500);

    return () => clearInterval(interval);
  }, [state.isOpen, state.status, state.startTime]);

  if (!state.isOpen) return null;

  // Calculate ETA
  let etaSeconds: number | null = null;
  let speedText: string | null = null;

  if (state.status === 'running' && state.totalCount && state.totalCount > 0 && state.currentCount !== undefined) {
    if (state.currentCount > 0 && elapsed > 0) {
      const avgPerItem = elapsed / state.currentCount;
      const remainingItems = Math.max(0, state.totalCount - state.currentCount);
      etaSeconds = Math.round(remainingItems * avgPerItem);
      speedText = `${avgPerItem.toFixed(1)}s / item`;
    } else {
      // Default initial estimate ~3.5s per paragraph
      etaSeconds = Math.round((state.totalCount - (state.currentCount || 0)) * 3.5);
    }
  } else if (state.status === 'running') {
    // For rebuild / tighten without totalCount: estimate ~12s total
    const estimatedTotal = 12;
    etaSeconds = Math.max(1, Math.round(estimatedTotal - elapsed));
  }

  const formatTime = (totalSeconds: number) => {
    if (totalSeconds < 0) return '0s';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const pct = Math.min(100, Math.max(0, Math.round(state.progress)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-lg bg-gradient-to-b from-[#0F172A] to-[#0A0E17] border border-blue-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-blue-500/10 overflow-hidden"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(59, 130, 246, 0.15)'
        }}
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-500/15 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between relative z-10 mb-5">
          <div className="flex items-center space-x-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-inner ${
              state.status === 'running' 
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : state.status === 'completed'
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400'
                : 'bg-rose-600/20 border-rose-500/40 text-rose-400'
            }`}>
              {state.status === 'running' && <Loader2 className="w-6 h-6 animate-spin" />}
              {state.status === 'completed' && <CheckCircle2 className="w-6 h-6 animate-bounce" />}
              {state.status === 'error' && <AlertCircle className="w-6 h-6" />}
            </div>

            <div>
              <h2 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
                <span>{state.title}</span>
                {state.status === 'running' && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {state.subtitle || (state.status === 'running' ? 'Processing with multi-threaded speed...' : '')}
              </p>
            </div>
          </div>

          {/* Minimize / Close Buttons */}
          <div className="flex items-center space-x-1.5">
            {onMinimize && state.status === 'running' && (
              <button
                onClick={onMinimize}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-xs font-semibold"
                title="Run in background"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
            {(state.status === 'completed' || state.status === 'error') && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="relative z-10 space-y-2 mb-5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span>Progress</span>
              {state.totalCount !== undefined && state.currentCount !== undefined && (
                <span className="text-blue-400 font-semibold">
                  ({state.currentCount} / {state.totalCount})
                </span>
              )}
            </span>
            <span className="text-xl font-extrabold text-blue-400 tracking-tight">
              {pct}%
            </span>
          </div>

          {/* Glowing Track */}
          <div className="w-full bg-slate-900/80 h-3.5 rounded-full overflow-hidden border border-slate-700/60 p-0.5 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-300 relative overflow-hidden ${
                state.status === 'error'
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400'
              }`}
              style={{ width: `${pct}%` }}
            >
              {state.status === 'running' && (
                <div 
                  className="absolute inset-0 bg-white/25 animate-pulse"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    animation: 'shimmer 1.5s infinite'
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Real-time Metrics Card */}
        <div className="relative z-10 grid grid-cols-2 gap-3 mb-5 text-xs">
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Estimated Remaining</p>
              <p className="text-xs font-bold text-white font-mono mt-0.5">
                {state.status === 'completed' 
                  ? 'Done' 
                  : etaSeconds !== null 
                  ? `~${formatTime(etaSeconds)}` 
                  : 'Calculating...'}
              </p>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Elapsed Time</p>
              <p className="text-xs font-bold text-white font-mono mt-0.5">
                {formatTime(elapsed)} {speedText ? `• ${speedText}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Current Step Snippet */}
        {state.currentStep && (
          <div className="relative z-10 bg-slate-900/50 border border-slate-800/70 rounded-xl p-3 mb-5 text-xs text-slate-300 font-mono flex items-start space-x-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0 animate-pulse" />
            <p className="truncate line-clamp-2 leading-relaxed">
              {state.currentStep}
            </p>
          </div>
        )}

        {/* Error Message if any */}
        {state.status === 'error' && state.errorMessage && (
          <div className="relative z-10 bg-rose-950/40 border border-rose-500/40 rounded-xl p-3 mb-5 text-xs text-rose-300 font-mono">
            {state.errorMessage}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="relative z-10 flex items-center justify-between pt-2 border-t border-slate-800/60">
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-key concurrency active</span>
          </div>

          {state.status === 'running' ? (
            <button
              onClick={onMinimize || onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold transition-all"
            >
              Run in Background
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow ${
                state.status === 'completed'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              {state.status === 'completed' ? 'Great, Continue!' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
