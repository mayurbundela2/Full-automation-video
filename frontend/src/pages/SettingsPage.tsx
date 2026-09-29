import React, { useState, useEffect } from 'react';
import { Settings, Key, Cpu, Volume2, Sliders, HardDrive, Check, AlertCircle, Sparkles, Folder } from 'lucide-react';
import { api } from '../api';
import { AppSettings, VoiceItem } from '../types';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [customVoiceInput, setCustomVoiceInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedToast, setSavedToast] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([api.getSettings(), api.getVoices()]);
      setSettings(s);
      setVoices(v);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setErrorMsg(null);
    try {
      const payload: Partial<AppSettings> = {
        gemini_model: settings.gemini_model,
        default_voice: settings.default_voice,
        voice_speed: Number(settings.voice_speed || 1.0),
        max_tts_characters: Number(settings.max_tts_characters),
        max_tts_words: Number(settings.max_tts_words),
        near_limit_threshold: Number(settings.near_limit_threshold),
        auto_split: settings.auto_split,
        auto_convert_mp3: settings.auto_convert_mp3,
        mp3_bitrate: settings.mp3_bitrate,
        preserve_inline_tags: settings.preserve_inline_tags,
        output_folder: settings.output_folder,
        chrome_path: settings.chrome_path,
        ffmpeg_path: settings.ffmpeg_path,
      };

      if (apiKeyInput.trim()) {
        payload.gemini_api_key = apiKeyInput.trim();
      }

      const updated = await api.updateSettings(payload);
      setSettings(updated);
      setApiKeyInput('');
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings');
    }
  };

  const handleAddCustomVoice = async () => {
    if (!customVoiceInput.trim()) return;
    try {
      const updatedVoices = await api.addCustomVoice(customVoiceInput.trim());
      setVoices(updatedVoices);
      if (settings) {
        setSettings({ ...settings, default_voice: customVoiceInput.trim() });
      }
      setCustomVoiceInput('');
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || !settings) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-center text-studio-textMuted font-mono">
        Loading configuration...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-studio-cardBorder">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Studio Settings & Configuration</h1>
            <p className="text-xs text-studio-textMuted">Configure Gemini API key, limits, voice defaults, and audio converters</p>
          </div>
        </div>

        {savedToast && (
          <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold animate-fadeIn">
            <Check className="w-4 h-4" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3.5 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Gemini API Credentials */}
        <div className="bg-[#111A2D] border border-studio-cardBorder rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-800">
            <Key className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Google Gemini API Credentials</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white">Google Gemini API Keys (Pool & Fallback)</label>
                {settings.is_demo_mode ? (
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    No key detected (Running in Demo Mode)
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Active Pool: {settings.gemini_api_key_masked}
                  </span>
                )}
              </div>
              <textarea
                rows={2}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={settings.gemini_api_key_masked ? "Enter new API keys to overwrite (comma or newline separated for multiple fallback keys)..." : "Paste your Gemini API keys (comma or newline separated for automatic rotation)..."}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[11px] text-studio-textMuted">
                🔄 <strong>Automatic Multi-Key Rotation:</strong> You can paste multiple API keys separated by commas or newlines. If Key #1 hits rate limits or quota (429), the engine automatically rotates to Key #2 seamlessly.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Gemini TTS Model</label>
              <select
                value={['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.0-flash'].includes(settings.gemini_model) ? settings.gemini_model : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setSettings({ ...settings, gemini_model: e.target.value });
                  }
                }}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="gemini-3.8-flash-tts">✨ Gemini 3.8 Flash TTS (Latest / Expressive Studio)</option>
                <option value="gemini-3.8-flash-lite-tts">⚡ Gemini 3.8 Flash-Lite TTS (Fast / High-Throughput)</option>
                <option value="gemini-3.1-flash-tts-preview">Gemini 3.1 Flash TTS Preview</option>
                <option value="gemini-2.5-flash-preview-tts">Gemini 2.5 Flash TTS Preview</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="custom">Custom Model Identifier...</option>
              </select>
              {!['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.0-flash'].includes(settings.gemini_model) && (
                <input
                  type="text"
                  value={settings.gemini_model}
                  onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
                  placeholder="Enter custom model identifier..."
                  className="w-full mt-1.5 bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              )}
              <p className="text-[11px] text-studio-textMuted">
                Active: <code className="text-blue-300">{settings.gemini_model}</code> (auto-fallbacks if quota is reached)
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white">Default Voiceover Speed (Speaking Rate)</label>
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {Number(settings.voice_speed || 1.0).toFixed(2)}x
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={settings.voice_speed || 1.0}
                  onChange={(e) => setSettings({ ...settings, voice_speed: parseFloat(e.target.value) })}
                  className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="0.80">0.80x (Slow / Deliberate)</option>
                  <option value="0.90">0.90x (Relaxed Pace)</option>
                  <option value="1.00">1.00x (Normal / Default Speed)</option>
                  <option value="1.05">1.05x (Slightly Brisk)</option>
                  <option value="1.10">1.10x (Dynamic Fast)</option>
                  <option value="1.15">1.15x (Energetic Voiceover)</option>
                  <option value="1.20">1.20x (Fast Pace)</option>
                  <option value="1.25">1.25x (Viral Short Pace)</option>
                  <option value="1.30">1.30x (High Energy / Ultra Fast)</option>
                  <option value="1.40">1.40x (1.4x Speed)</option>
                  <option value="1.50">1.50x (1.5x Speed)</option>
                </select>
              </div>
              <p className="text-[11px] text-studio-textMuted">
                Speeds up narration audio without changing voice pitch. Default is <strong className="text-slate-200">1.00x</strong>.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Default TTS Voice</label>
              <select
                value={settings.default_voice}
                onChange={(e) => setSettings({ ...settings, default_voice: e.target.value })}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.gender}) - {v.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Add Custom Voice */}
          <div className="pt-2 flex items-center space-x-2">
            <input
              type="text"
              value={customVoiceInput}
              onChange={(e) => setCustomVoiceInput(e.target.value)}
              placeholder="Add custom voice name parameter..."
              className="bg-[#0B101B] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 flex-1 font-mono"
            />
            <button
              type="button"
              onClick={handleAddCustomVoice}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Add Voice
            </button>
          </div>
        </div>

        {/* TTS Limits & Length Guardrails */}
        <div className="bg-[#111A2D] border border-studio-cardBorder rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-800">
            <Sliders className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">TTS Length Limits & Splitting</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Max Characters per Request</label>
              <input
                type="number"
                value={settings.max_tts_characters}
                onChange={(e) => setSettings({ ...settings, max_tts_characters: Number(e.target.value) })}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Max Words per Request</label>
              <input
                type="number"
                value={settings.max_tts_words}
                onChange={(e) => setSettings({ ...settings, max_tts_words: Number(e.target.value) })}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Near-Limit Threshold</label>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="0.95"
                value={settings.near_limit_threshold}
                onChange={(e) => setSettings({ ...settings, near_limit_threshold: Number(e.target.value) })}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label className="flex items-center space-x-3 cursor-pointer bg-studio-bg/60 p-3 rounded-xl border border-slate-800">
              <input
                type="checkbox"
                checked={settings.preserve_inline_tags}
                onChange={(e) => setSettings({ ...settings, preserve_inline_tags: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700"
              />
              <div className="text-xs">
                <span className="font-semibold text-white block">Preserve Inline Emotion Tags</span>
                <span className="text-studio-textMuted">Keeps tags like [serious], [mysterious] in generated prompt</span>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer bg-studio-bg/60 p-3 rounded-xl border border-slate-800">
              <input
                type="checkbox"
                checked={settings.auto_convert_mp3}
                onChange={(e) => setSettings({ ...settings, auto_convert_mp3: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700"
              />
              <div className="text-xs">
                <span className="font-semibold text-white block">Auto Convert MP3</span>
                <span className="text-studio-textMuted">Generates 320kbps MP3 alongside WAV master</span>
              </div>
            </label>
          </div>
        </div>

        {/* System & Executable Paths */}
        <div className="bg-[#111A2D] border border-studio-cardBorder rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-800">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Local Storage & System Paths</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-white">Output Storage Directory</label>
              <input
                type="text"
                value={settings.output_folder}
                onChange={(e) => setSettings({ ...settings, output_folder: e.target.value })}
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">FFmpeg Binary Path</label>
              <input
                type="text"
                value={settings.ffmpeg_path}
                onChange={(e) => setSettings({ ...settings, ffmpeg_path: e.target.value })}
                placeholder="ffmpeg or /opt/homebrew/bin/ffmpeg"
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Chrome Executable Path (Optional)</label>
              <input
                type="text"
                value={settings.chrome_path}
                onChange={(e) => setSettings({ ...settings, chrome_path: e.target.value })}
                placeholder="Auto-detected across OS if left empty"
                className="w-full bg-[#0B101B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Submit Save Button */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="flex items-center space-x-2 px-8 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs shadow-xl shadow-blue-600/30 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>SAVE CONFIGURATION</span>
          </button>
        </div>
      </form>
    </div>
  );
};
