import React, { useState, useEffect } from 'react';
import { Plus, FolderKanban, ArrowRight, Trash2, Mic, Clock, FileAudio, Sparkles, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { Project } from '../types';

interface DashboardProps {
  onSelectProject: (project: Project) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncOutputs = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await api.syncOutputs();
      await fetchProjects();
      if (res.synced_projects > 0) {
        setSyncStatus(`Discovered & synced ${res.synced_projects} new project(s) from outputs/!`);
      } else {
        setSyncStatus(`All ${res.total_projects} projects in outputs/ are up to date.`);
      }
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (e: any) {
      console.error(e);
      setSyncStatus('Failed to sync outputs folder.');
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const p = await api.createProject(name, description);
      setShowNewModal(false);
      setName('');
      setDescription('');
      onSelectProject(p);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${projectName}" and all its batches?\n\nThis will permanently delete the project from the database and remove its folder from the outputs/ directory.`)) {
      await api.deleteProject(id);
      fetchProjects();
    }
  };


  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-fadeIn">
      {/* Hero Welcome */}
      <div className="bg-gradient-to-r from-[#111A2E] to-[#15233E] border border-studio-cardBorder rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Studio Style TTS Voice Architecture</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            High-Fidelity Gemini TTS Studio
          </h1>
          <p className="text-sm text-studio-textMuted leading-relaxed">
            Generate cinematic voiceovers paragraph by paragraph with granular director controls, smart splitting, master WAV preservation, and automatic 320k MP3 conversion.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 z-10">
          <button
            onClick={handleSyncOutputs}
            disabled={syncing}
            className="flex items-center justify-center space-x-2 px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 active:scale-95 text-slate-200 hover:text-white font-semibold text-xs shadow-lg transition-all whitespace-nowrap"
            title="Scan outputs/ directory and sync any projects, batches, or paragraphs on disk"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-blue-400' : 'text-blue-400'}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Outputs Folder'}</span>
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>NEW PROJECT</span>
          </button>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {syncStatus && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium animate-fadeIn">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span>{syncStatus}</span>
          </div>
          <button onClick={() => setSyncStatus(null)} className="text-blue-400 hover:text-blue-200">
            &times;
          </button>
        </div>
      )}

      {/* Projects Grid Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Your Projects</h2>
          <p className="text-xs text-studio-textMuted">Select a project or create a new narration workspace</p>
        </div>

        <span className="text-xs font-mono text-studio-textMuted bg-studio-card px-3 py-1 rounded-lg border border-studio-cardBorder">
          {projects.length} Project{projects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-studio-card/50 rounded-2xl border border-studio-cardBorder animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-studio-card/30 border border-dashed border-studio-cardBorder rounded-3xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center">
            <FolderKanban className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No projects yet</h3>
            <p className="text-xs text-studio-textMuted max-w-sm mx-auto">
              Create your first project (e.g., "Cannabis Documentary") or place folders in the outputs/ directory.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleSyncOutputs}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold shadow transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync from Outputs</span>
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Project</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => (
            <div
              key={proj.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectProject(proj)}
              className="group bg-gradient-to-br from-[#111A2D] to-[#142036] hover:from-[#15223B] hover:to-[#182845] border border-studio-cardBorder hover:border-blue-500/50 rounded-2xl p-5 sm:p-6 shadow-xl transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between space-y-4 relative select-none"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center border border-blue-500/20 group-hover:scale-105 transition-transform shadow-sm">
                    <FolderKanban className="w-5 h-5" />
                  </div>

                  <button
                    onClick={(e) => handleDelete(proj.id, proj.name, e)}
                    className="p-2 rounded-lg text-studio-textMuted hover:text-rose-400 hover:bg-rose-500/15 transition-all"
                    title="Delete project from database and outputs/"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                  {proj.name}
                </h3>
                {proj.description && (
                  <p className="text-xs text-studio-textMuted line-clamp-2 leading-relaxed">
                    {proj.description}
                  </p>
                )}
              </div>

              {/* Stats Footer */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-studio-textMuted">
                <div className="flex items-center space-x-2.5">
                  <span className="bg-slate-800/80 px-2 py-0.5 rounded text-[11px]"><strong>{proj.batch_count}</strong> Batches</span>
                  <span className="bg-slate-800/80 px-2 py-0.5 rounded text-[11px]"><strong>{proj.paragraph_count}</strong> Paras</span>
                </div>

                <div className="flex items-center space-x-1 text-blue-400 font-semibold group-hover:translate-x-1 transition-transform">
                  <span>Open</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#111A2C] border border-[#233554] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <form onSubmit={handleCreate}>
              <div className="px-6 py-4 border-b border-studio-cardBorder bg-[#152037]">
                <h3 className="font-bold text-sm text-white">CREATE NEW PROJECT</h3>
                <p className="text-xs text-studio-textMuted">Set up a container for your documentary or video batches</p>
              </div>

              <div className="p-6 space-y-4">
                {error && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">{error}</p>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white uppercase tracking-wider block">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cannabis Documentary"
                    className="w-full bg-studio-bg border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-studio-textMuted uppercase tracking-wider block">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Brief summary of topic, tone, and goals..."
                    className="w-full bg-studio-bg border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-studio-cardBorder bg-[#152037] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20"
                >
                  {creating ? 'Creating...' : 'CREATE PROJECT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
