import React, { useState } from 'react';
import { Sparkles, ExternalLink, Settings, History, FolderKanban, AlertCircle, Cpu, BookOpen, Lightbulb, FileSpreadsheet, Power } from 'lucide-react';
import { api } from '../api';
import { PromptHelpModal } from './PromptHelpModal';
import { DataExporterModal } from './DataExporterModal';

interface NavbarProps {
  currentTab: 'projects' | 'batches' | 'history' | 'settings';
  setCurrentTab: (tab: 'projects' | 'batches' | 'history' | 'settings') => void;
  isDemoMode: boolean;
  selectedProjectName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  isDemoMode,
  selectedProjectName,
}) => {
  const [openingStudio, setOpeningStudio] = useState(false);
  const [showPromptHelp, setShowPromptHelp] = useState(false);
  const [showDataExporter, setShowDataExporter] = useState(false);
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isShutdownComplete, setIsShutdownComplete] = useState(false);

  const handleOpenAiStudio = async () => {
    setOpeningStudio(true);
    try {
      await api.openAiStudio();
    } catch (e) {
      console.error(e);
      window.open('https://aistudio.google.com/', '_blank');
    } finally {
      setTimeout(() => setOpeningStudio(false), 1000);
    }
  };

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await api.shutdownServer();
    } catch (e) {
      console.error(e);
    } finally {
      setIsShuttingDown(false);
      setShowShutdownModal(false);
      setIsShutdownComplete(true);
    }
  };


  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0E1524]/90 backdrop-blur-md border-b border-studio-cardBorder px-6 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-6">
          <div 
            onClick={() => setCurrentTab('projects')}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">GEMINI TTS STUDIO</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">Phase 1</span>
              </div>
              {selectedProjectName && (
                <p className="text-xs text-studio-textMuted flex items-center space-x-1">
                  <span>Project:</span>
                  <span className="text-blue-400 font-medium">{selectedProjectName}</span>
                </p>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-studio-bg/60 p-1 rounded-xl border border-studio-cardBorder">
            <button
              onClick={() => setCurrentTab('projects')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 ${
                currentTab === 'projects'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-studio-textMuted hover:text-white hover:bg-studio-cardHover'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Projects</span>
            </button>
            
            <button
              onClick={() => setCurrentTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 ${
                currentTab === 'history'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-studio-textMuted hover:text-white hover:bg-studio-cardHover'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>

            <button
              onClick={() => setCurrentTab('settings')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 ${
                currentTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-studio-textMuted hover:text-white hover:bg-studio-cardHover'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          {/* Data Exporter / Script Sorter Button */}
          <button
            onClick={() => setShowDataExporter(true)}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
            title="Open Script Sorter & Data Exporter"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">DATA EXPORTER</span>
          </button>

          {/* Prompt Guide Button */}
          <button
            onClick={() => setShowPromptHelp(true)}
            className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:border-indigo-400 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
            title="Open AI Studio Script Director Prompt Guide"
          >
            <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">AI PROMPT GUIDE</span>
          </button>

          {/* Demo Mode Badge */}
          {isDemoMode && (
            <div 
              onClick={() => setCurrentTab('settings')}
              className="cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 transition-colors border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center space-x-1 text-amber-400 text-xs"
              title="Running in Demo Mode"
            >
              <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden md:inline font-medium">DEMO</span>
            </div>
          )}

          {/* Open Google AI Studio Button */}
          <button
            onClick={handleOpenAiStudio}
            disabled={openingStudio}
            className="bg-[#1A2338] hover:bg-[#222E4A] active:scale-95 text-blue-400 border border-blue-500/30 hover:border-blue-400/50 transition-all px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm"
            title="Open Google AI Studio"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden lg:inline">AI STUDIO</span>
            <ExternalLink className="w-3 h-3 text-blue-400/80" />
          </button>

          {/* Shutdown Server Button */}
          <button
            onClick={() => setShowShutdownModal(true)}
            className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-700/50 hover:border-rose-500 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Shut down server and exit application safely"
          >
            <Power className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline font-bold">SHUT DOWN</span>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B1220]/95 backdrop-blur-lg border-t border-[#1E293B] px-4 py-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setCurrentTab('projects')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-all ${
            currentTab === 'projects' || currentTab === 'batches'
              ? 'text-blue-400 font-bold bg-blue-500/10'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span className="text-[10px]">Projects</span>
        </button>

        <button
          onClick={() => setShowPromptHelp(true)}
          className="flex flex-col items-center space-y-1 py-1 px-3 rounded-xl text-indigo-400 hover:text-indigo-300 transition-all"
        >
          <Lightbulb className="w-4 h-4" />
          <span className="text-[10px]">Prompt Guide</span>
        </button>

        <button
          onClick={() => setCurrentTab('history')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-all ${
            currentTab === 'history'
              ? 'text-blue-400 font-bold bg-blue-500/10'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span className="text-[10px]">History</span>
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-all ${
            currentTab === 'settings'
              ? 'text-blue-400 font-bold bg-blue-500/10'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[10px]">Settings</span>
        </button>

        <button
          onClick={() => setShowShutdownModal(true)}
          className="flex flex-col items-center space-y-1 py-1 px-3 rounded-xl text-rose-400 hover:text-rose-300 transition-all"
        >
          <Power className="w-4 h-4" />
          <span className="text-[10px]">Shut Down</span>
        </button>
      </div>

      {/* Shutdown Confirmation Modal */}
      {showShutdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <Power className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Shut Down Gemini TTS Studio?</h3>
                <p className="text-xs text-slate-400">Stop local server & free resources</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <p>This will cleanly shut down the backend FastAPI server and release port 8000.</p>
              <div className="pt-1 text-emerald-400 font-semibold space-y-1">
                <div>✓ All your database projects and files are safely saved</div>
                <div>✓ You can restart anytime using <code className="text-blue-300">start_windows.bat</code></div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowShutdownModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShutdown}
                disabled={isShuttingDown}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isShuttingDown ? 'Shutting Down...' : 'Yes, Shut Down Server'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Shutdown Complete Overlay */}
      {isShutdownComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b14]/95 backdrop-blur-md p-6 text-center animate-fadeIn">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Power className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-white">Server Stopped Cleanly</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Gemini TTS Studio has shut down and released system port 8000. You can now safely close this browser window.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 font-mono">
              To relaunch later, double-click <span className="text-blue-400">start_windows.bat</span> (Windows) or <span className="text-blue-400">start_mac.command</span> (macOS)
            </div>
          </div>
        </div>
      )}

      {/* Director Prompt Modal */}
      <PromptHelpModal isOpen={showPromptHelp} onClose={() => setShowPromptHelp(false)} />

      {/* Script Sorter & Data Exporter Modal */}
      <DataExporterModal
        isOpen={showDataExporter}
        onClose={() => setShowDataExporter(false)}
      />
    </>
  );
};

