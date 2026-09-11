import { Project, Batch, Paragraph, Generation, AppSettings, VoiceItem, ScanMediaResponse, MediaMatchItem } from './types';
import { MobileStorage } from './services/mobileStorage';
import { ClientReferenceParser } from './services/clientReferenceParser';
import { ClientGeminiService } from './services/clientGeminiService';
import { ClientAudioProcessor } from './services/clientAudioTrimmer';
import { NativeExporter } from './services/nativeExporter';

const API_BASE = '/api';
let isBackendOnline: boolean | null = null;

const DEFAULT_VOICES: VoiceItem[] = [
  { name: 'Algenib', gender: 'Male', description: 'Deep, gravelly, narrative, impactful', recommended_for: 'Documentaries & Deep Intros', is_default: true },
  { name: 'Puck', gender: 'Male', description: 'Playful, energetic, upbeat, engaging', recommended_for: 'High Energy Reels & Shorts', is_default: false },
  { name: 'Charon', gender: 'Male', description: 'Authoritative, calm, clear, executive', recommended_for: 'Educational & Business Videos', is_default: false },
  { name: 'Kore', gender: 'Female', description: 'Warm, empathetic, natural, soothing', recommended_for: 'Storytelling & Meditations', is_default: false },
  { name: 'Fenrir', gender: 'Male', description: 'Grit, intense, cinematic, powerful', recommended_for: 'Mystery, Action, Teasers', is_default: false },
  { name: 'Aoede', gender: 'Female', description: 'Melodic, sophisticated, expressive', recommended_for: 'Documentary & Historical', is_default: false },
  { name: 'Enceladus', gender: 'Male', description: 'Youthful, energetic, conversational', recommended_for: 'Tech & Modern Commentary', is_default: false },
  { name: 'Hestia', gender: 'Female', description: 'Professional, articulate, dynamic', recommended_for: 'Explainers & Presentations', is_default: false }
];

async function checkBackend(): Promise<boolean> {
  if (NativeExporter.isNative()) return false;
  if (isBackendOnline !== null) return isBackendOnline;
  try {
    const res = await fetch(`${API_BASE}/settings`, { method: 'GET', headers: { Accept: 'application/json' } });
    const contentType = res.headers.get('content-type') || '';
    isBackendOnline = res.ok && contentType.includes('application/json');
  } catch {
    isBackendOnline = false;
  }
  return isBackendOnline;
}

export const api = {
  // Settings
  async getSettings(): Promise<AppSettings> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) return res.json();
    }
    return MobileStorage.getSettings();
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) return res.json();
    }
    return MobileStorage.updateSettings(settings);
  },

  // Voices
  async getVoices(): Promise<VoiceItem[]> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/voices`);
      if (res.ok) return res.json();
    }
    return DEFAULT_VOICES;
  },

  async addCustomVoice(name: string): Promise<VoiceItem[]> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/voices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) return res.json();
    }
    const newVoice: VoiceItem = {
      name,
      gender: 'Custom',
      description: 'User added custom voice model',
      recommended_for: 'General Narration',
      is_default: false,
    };
    return [...DEFAULT_VOICES, newVoice];
  },

  // System
  async openAiStudio(): Promise<{ status: string; opened: boolean }> {
    window.open('https://aistudio.google.com/prompts/new_chat', '_blank');
    return { status: 'OPENED', opened: true };
  },

  async openFolder(path: string): Promise<{ status: string }> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/open-folder?path=${encodeURIComponent(path)}`, { method: 'POST' });
        if (res.ok) return res.json();
      } catch {}
    }
    return { status: 'NOT_SUPPORTED_ON_MOBILE' };
  },

  async selectFolder(title?: string): Promise<{ status: string; folder_path: string | null }> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/select-folder?title=${encodeURIComponent(title || 'Select Video / Media Folder')}`, {
          method: 'POST',
        });
        if (res.ok) {
          return res.json();
        }
      } catch (e) {
        console.warn('Native select-folder failed:', e);
      }
    }
    return { status: 'NOT_SUPPORTED', folder_path: null };
  },

  // Projects
  async syncOutputs(): Promise<{ synced_projects: number; total_projects: number }> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects/sync-outputs`, { method: 'POST' });
        if (res.ok) return res.json();
      } catch (e) {
        console.warn('syncOutputs failed:', e);
      }
    }
    return { synced_projects: 0, total_projects: (await MobileStorage.getProjects()).length };
  },

  async getProjects(): Promise<Project[]> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects`);
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.getProjects();
  },

  async createProject(name: string, description?: string): Promise<Project> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        });
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.createProject(name, description);
  },

  async getProject(id: number): Promise<Project> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects/${id}`);
        if (res.ok) return res.json();
      } catch {}
    }
    const p = await MobileStorage.getProject(id);
    if (!p) throw new Error('Project not found');
    return p;
  },

  async updateProject(id: number, data: { name?: string; description?: string }): Promise<Project> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.updateProject(id, data);
  },

  async deleteProject(id: number): Promise<void> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
        if (res.ok) return;
      } catch {}
    }
    return MobileStorage.deleteProject(id);
  },

  // Batches
  async getBatches(projectId: number): Promise<Batch[]> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects/${projectId}/batches`);
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.getBatches(projectId);
  },

  async createBatch(projectId: number, name: string, batchNumber?: number): Promise<Batch> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/projects/${projectId}/batches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, batch_number: batchNumber }),
        });
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.createBatch(projectId, name, batchNumber);
  },

  async getBatch(id: number): Promise<Batch> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${id}`);
        if (res.ok) return res.json();
      } catch {}
    }
    const b = await MobileStorage.getBatch(id);
    if (!b) throw new Error('Batch not found');
    return b;
  },

  async deleteBatch(id: number): Promise<void> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${id}`, { method: 'DELETE' });
        if (res.ok) return;
      } catch {}
    }
    return MobileStorage.deleteBatch(id);
  },

  async parseReference(batchId: number, rawText: string, defaultVoice?: string, mediaFolder?: string): Promise<{ detected_count: number; paragraphs: any[] }> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/parse-reference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: rawText, default_voice: defaultVoice, media_folder: mediaFolder }),
        });
        if (res.ok) return res.json();
      } catch {}
    }

    const parsed = ClientReferenceParser.parseBatch(rawText, defaultVoice || 'Algenib');
    const previewParagraphs = parsed.map((p, idx) => ({
      paragraph_number: p.paragraph_number,
      part_number: p.part_number,
      scene: p.scene,
      sample_context: p.sample_context,
      audio_profile: p.audio_profile,
      speaker: p.speaker,
      style: p.style,
      pace: p.pace,
      accent: p.accent,
      voice: p.voice || defaultVoice || 'Algenib',
      transcript: p.transcript,
      raw_reference: p.raw_reference,
      on_screen_text: p.on_screen_text,
      video_prompt: p.video_prompt,
      scene_progression: p.scene_progression,
      overall_mood: p.overall_mood,
      sound_effects: p.sound_effects,
      background_music: p.background_music,
      word_count: p.transcript ? p.transcript.split(/\s+/).filter(Boolean).length : 0,
      character_count: p.transcript ? p.transcript.length : 0,
      limit_status: 'SAFE',
    }));

    return { detected_count: previewParagraphs.length, paragraphs: previewParagraphs };
  },

  async importReference(batchId: number, rawText: string, defaultVoice?: string, mediaFolder?: string): Promise<Batch> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/import-reference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: rawText, default_voice: defaultVoice, media_folder: mediaFolder }),
        });
        if (res.ok) return res.json();
      } catch {}
    }

    const parsed = ClientReferenceParser.parseBatch(rawText, defaultVoice || 'Algenib');
    const paragraphs: Paragraph[] = parsed.map((p, idx) => {
      const words = p.transcript ? p.transcript.split(/\s+/).filter(Boolean).length : 0;
      const chars = p.transcript ? p.transcript.length : 0;
      return {
        id: Date.now() + idx,
        batch_id: batchId,
        paragraph_number: p.paragraph_number,
        part_number: p.part_number,
        scene: p.scene,
        sample_context: p.sample_context,
        audio_profile: p.audio_profile,
        speaker: p.speaker,
        style: p.style || 'Newscaster',
        pace: p.pace || 'Natural',
        accent: p.accent || 'Neutral',
        voice: p.voice || defaultVoice || 'Algenib',
        model: 'gemini-3.1-flash-tts-preview',
        transcript: p.transcript,
        raw_reference: p.raw_reference,
        built_prompt: ClientReferenceParser.buildPrompt(p),
        is_locked: false,
        sort_order: idx + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        word_count: words,
        character_count: chars,
        limit_status: chars > 650 ? 'OVER_LIMIT' : 'SAFE',
      };
    });

    await MobileStorage.deleteBatchParagraphs(batchId);
    await MobileStorage.saveParagraphs(paragraphs);

    const totalWords = paragraphs.reduce((acc, p) => acc + (p.word_count || 0), 0);
    const totalChars = paragraphs.reduce((acc, p) => acc + (p.character_count || 0), 0);
    const readyCount = paragraphs.filter((p) => p.limit_status !== 'OVER_LIMIT').length;
    const overLimitCount = paragraphs.filter((p) => p.limit_status === 'OVER_LIMIT').length;

    await MobileStorage.updateBatch(batchId, {
      total_paragraphs: paragraphs.length,
      total_words: totalWords,
      total_characters: totalChars,
      ready_count: readyCount,
      over_limit_count: overLimitCount,
      status: paragraphs.length > 0 ? 'READY' : 'DRAFT',
    });

    const updatedBatch = await MobileStorage.getBatch(batchId);
    if (!updatedBatch) throw new Error('Batch not found after import');
    return updatedBatch;
  },

  // Paragraphs
  async getParagraphs(batchId: number): Promise<Paragraph[]> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/paragraphs`);
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.getParagraphs(batchId);
  },

  async updateParagraph(id: number, data: Partial<Paragraph>): Promise<Paragraph> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/paragraphs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) return res.json();
      } catch {}
    }
    return MobileStorage.updateParagraph(id, data);
  },

  async generateParagraph(paragraphId: number, force: boolean = false): Promise<Generation> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/paragraphs/${paragraphId}/generate?force=${force}`, { method: 'POST' });
      if (res.ok) {
        return res.json();
      }
      let errDetail = `Generation failed (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.detail) {
          errDetail = errJson.detail;
        }
      } catch {}
      throw new Error(errDetail);
    }

    const [settings, paragraph] = await Promise.all([
      MobileStorage.getSettings(),
      MobileStorage.getParagraph(paragraphId),
    ]);

    if (!paragraph) throw new Error(`Paragraph ${paragraphId} not found`);

    const rawKeys = (settings.gemini_api_key || '').split(',').map((k) => k.trim()).filter(Boolean);

    // Build the accurate director prompt
    const prompt = paragraph.built_prompt || ClientReferenceParser.buildPrompt(paragraph);
    const voice = paragraph.voice || settings.default_voice || 'Algenib';
    const model = paragraph.model || settings.gemini_model || 'gemini-3.1-flash-tts-preview';

    // Call Client Gemini Service
    const ttsResult = await ClientGeminiService.generateSpeech({
      prompt,
      transcript: paragraph.transcript,
      voice,
      model,
      apiKeys: rawKeys,
    });

    const genKey = `para_${paragraphId}_audio`;
    await MobileStorage.saveAudioBlob(genKey, ttsResult.wavBlob);

    const generation: Generation = {
      id: Date.now(),
      paragraph_id: paragraphId,
      voice,
      model: ttsResult.modelUsed,
      duration: ttsResult.duration,
      wav_path: genKey,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };

    // Update the paragraph with the new latest_generation and COMPLETED status
    await MobileStorage.updateParagraph(paragraphId, {
      status: 'COMPLETED',
      latest_generation: generation,
      generation_count: (paragraph.generation_count || 0) + 1,
    });

    // Update batch completed count
    if (paragraph.batch_id) {
      const batchParas = await MobileStorage.getParagraphs(paragraph.batch_id);
      const completedCount = batchParas.filter((p) => p.status === 'COMPLETED' || p.id === paragraphId).length;
      await MobileStorage.updateBatch(paragraph.batch_id, {
        completed_count: completedCount,
      });
    }

    return generation;
  },

  // Audio Blob helpers for native mobile & client playback
  async getAudioBlob(keyOrId: string | number): Promise<Blob | null> {
    const key = typeof keyOrId === 'number' ? `para_${keyOrId}_audio` : keyOrId;
    return MobileStorage.getAudioBlob(key);
  },

  getAudioUrl(generationId: number, format: 'wav' | 'mp3' = 'wav'): string {
    return `${API_BASE}/generations/${generationId}/audio?format=${format}`;
  },

  // Subtitle URLs & Downloads
  getBatchSubtitlesUrl(batchId: number, format: string = 'srt', type: string = 'master', download: boolean = false): string {
    return `${API_BASE}/batches/${batchId}/subtitles?format=${format}&type=${type}&download=${download}`;
  },

  getBatchAudioUrl(batchId: number, format: 'wav' | 'mp3' = 'wav', download: boolean = false): string {
    return `${API_BASE}/batches/${batchId}/audio?format=${format}&download=${download}`;
  },

  getBatchTightAudioUrl(batchId: number, format: 'wav' | 'mp3' | 'mp4' = 'wav', download: boolean = false): string {
    return `${API_BASE}/batches/${batchId}/tight-audio?format=${format}&download=${download}`;
  },

  getParagraphAudioUrl(paragraphId: number, format: 'wav' | 'mp3' = 'wav', download: boolean = false): string {
    return `${API_BASE}/paragraphs/${paragraphId}/audio?format=${format}&download=${download}`;
  },

  getParagraphSubtitlesUrl(paragraphId: number, format: string = 'srt', download: boolean = false): string {
    return `${API_BASE}/paragraphs/${paragraphId}/subtitles?format=${format}&download=${download}`;
  },

  async combineBatchAudio(batchId: number): Promise<any> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/combine-audio`, { method: 'POST' });
        if (res.ok) return res.json();
      } catch {}
    }

    const paras = await MobileStorage.getParagraphs(batchId);
    const validParas = paras.filter((p) => p.status === 'COMPLETED' || p.latest_generation);
    if (validParas.length === 0) {
      throw new Error('No completed paragraph audio found to combine. Please generate paragraphs first.');
    }

    const blobs: Blob[] = [];
    for (const p of validParas) {
      const blobKey = p.latest_generation?.wav_path || `para_${p.id}_audio`;
      const blob = await MobileStorage.getAudioBlob(blobKey);
      if (blob) {
        blobs.push(blob);
      }
    }

    if (blobs.length === 0) {
      throw new Error('Could not retrieve audio blobs from local storage.');
    }

    // Concatenate all parts
    const { combinedBlob, duration, offsets } = await ClientAudioProcessor.concatenateAudioBlobs(blobs, 0.15);
    const masterKey = `batch_${batchId}_master_audio`;
    await MobileStorage.saveAudioBlob(masterKey, combinedBlob);

    // Generate Master Subtitles using high-precision paragraph-anchored offsets
    const paragraphItems = validParas.map((p, idx) => ({
      transcript: p.transcript,
      blob: blobs[idx],
      startOffset: offsets[idx]?.start || 0,
      duration: offsets[idx]?.duration || 0,
    }));
    const subResult = await ClientAudioProcessor.generateBatchAlignedSubtitles(paragraphItems, duration, 3);

    const srtBlob = new Blob([subResult.srt], { type: 'text/plain;charset=utf-8' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_master_srt`, srtBlob);

    const vttBlob = new Blob([subResult.vtt], { type: 'text/plain;charset=utf-8' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_master_vtt`, vttBlob);

    // Save word timestamps
    const timestampsBlob = new Blob([JSON.stringify(subResult.wordsJson)], { type: 'application/json' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_word_timestamps_master`, timestampsBlob);

    // Update batch in storage
    const combinedAudioMeta = {
      wav_path: masterKey,
      mp3_path: masterKey,
      duration: duration,
      file_size: combinedBlob.size,
      status: 'COMPLETED',
      paragraph_count: validParas.length,
    };

    await MobileStorage.updateBatch(batchId, {
      combined_audio: combinedAudioMeta,
      status: 'COMPLETED',
    });

    return {
      status: 'COMBINED',
      batch_id: batchId,
      duration,
      paragraph_count: validParas.length,
    };
  },

  async tightenBatchAudio(batchId: number, silenceThreshold: number = 0.18): Promise<any> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/tighten-audio?silence_threshold=${silenceThreshold}`, { method: 'POST' });
        if (res.ok) return res.json();
      } catch {}
    }

    const masterKey = `batch_${batchId}_master_audio`;
    let masterBlob = await MobileStorage.getAudioBlob(masterKey);

    if (!masterBlob) {
      // Auto combine first
      await this.combineBatchAudio(batchId);
      masterBlob = await MobileStorage.getAudioBlob(masterKey);
    }

    if (!masterBlob) {
      throw new Error('Master audio could not be prepared for pause trimming.');
    }

    // Tighten pauses
    const trimResult = await ClientAudioProcessor.tightenAudio(masterBlob, silenceThreshold, 0.08);
    const tightKey = `batch_${batchId}_tight_audio`;
    await MobileStorage.saveAudioBlob(tightKey, trimResult.tightWavBlob);

    // Generate Tight Subtitles by mapping fresh clean master word timestamps directly via trim intervals
    const paras = await MobileStorage.getParagraphs(batchId);
    const validParas = paras.filter((p) => p.status === 'COMPLETED' || p.latest_generation);
    const blobs: Blob[] = [];
    for (const p of validParas) {
      const bKey = p.latest_generation?.wav_path || `para_${p.id}_audio`;
      const b = await MobileStorage.getAudioBlob(bKey);
      if (b) blobs.push(b);
    }
    const { duration: masterDuration, offsets } = await ClientAudioProcessor.concatenateAudioBlobs(blobs, 0.15);
    const paragraphItems = validParas.map((p, idx) => ({
      transcript: p.transcript,
      blob: blobs[idx],
      startOffset: offsets[idx]?.start || 0,
      duration: offsets[idx]?.duration || 0,
    }));
    const masterSubResult = await ClientAudioProcessor.generateBatchAlignedSubtitles(paragraphItems, masterDuration, 3);

    // Save fresh master subtitles as well
    const masterSrtBlob = new Blob([masterSubResult.srt], { type: 'text/plain;charset=utf-8' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_master_srt`, masterSrtBlob);
    const masterVttBlob = new Blob([masterSubResult.vtt], { type: 'text/plain;charset=utf-8' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_master_vtt`, masterVttBlob);
    const masterTimestampsBlob = new Blob([JSON.stringify(masterSubResult.wordsJson)], { type: 'application/json' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_word_timestamps_master`, masterTimestampsBlob);

    const tightSubResult = ClientAudioProcessor.mapTimestampsToTightAudio(
      masterSubResult.wordsJson.words,
      trimResult.mappings,
      trimResult.tightDuration,
      3
    );

    const srtBlob = new Blob([tightSubResult.srt], { type: 'text/plain;charset=utf-8' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_tight_srt`, srtBlob);

    const vttBlob = new Blob([tightSubResult.vtt], { type: 'text/plain;charset=utf-8' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_tight_vtt`, vttBlob);

    const tightTimestampsBlob = new Blob([JSON.stringify(tightSubResult.wordsJson)], { type: 'application/json' });
    await MobileStorage.saveAudioBlob(`batch_${batchId}_word_timestamps_tight`, tightTimestampsBlob);

    const tightAudioMeta = {
      wav_path: tightKey,
      mp3_path: tightKey,
      mp4_path: tightKey,
      duration: trimResult.tightDuration,
      original_duration: trimResult.originalDuration,
      saved_seconds: trimResult.savedSeconds,
      status: 'COMPLETED',
      silence_threshold: silenceThreshold,
    };

    await MobileStorage.updateBatch(batchId, {
      tight_audio: tightAudioMeta,
    });

    return {
      status: 'TIGHTENED',
      batch_id: batchId,
      duration: trimResult.tightDuration,
      saved_seconds: trimResult.savedSeconds,
    };
  },

  async rebuildAllBatchAudio(batchId: number, silenceThreshold: number = 0.18): Promise<any> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/rebuild-all?silence_threshold=${silenceThreshold}`, { method: 'POST' });
        if (res.ok) return res.json();
      } catch {}
    }

    await this.combineBatchAudio(batchId);
    await this.tightenBatchAudio(batchId, silenceThreshold);
    return { status: 'REBUILT' };
  },

  async getBatchWordTimestamps(batchId: number, type: 'master' | 'tight' = 'master'): Promise<any> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/word-timestamps?type=${type}`);
        if (res.ok) return res.json();
      } catch {}
    }

    const key = `batch_${batchId}_word_timestamps_${type}`;
    const blob = await MobileStorage.getAudioBlob(key);
    if (blob) {
      try {
        const txt = await blob.text();
        return JSON.parse(txt);
      } catch {}
    }

    // Dynamic on-the-fly generation if not yet cached
    try {
      const audioKey = `batch_${batchId}_${type}_audio`;
      const audioBlob = await MobileStorage.getAudioBlob(audioKey);
      const paras = await MobileStorage.getParagraphs(batchId);
      const validParas = paras.filter((p) => p.status === 'COMPLETED' || p.latest_generation);
      if (audioBlob && validParas.length > 0) {
        const fullTranscript = validParas.map((p) => p.transcript).join('\n\n');
        const buffer = await ClientAudioProcessor.decodeAudioBlob(audioBlob);
        const intervals = ClientAudioProcessor.detectSpeechIntervals(buffer, -38, 0.15);
        const res = ClientAudioProcessor.generateSubtitles(fullTranscript, intervals, buffer.duration, 3);
        const timestampsBlob = new Blob([JSON.stringify(res.wordsJson)], { type: 'application/json' });
        await MobileStorage.saveAudioBlob(key, timestampsBlob);
        return res.wordsJson;
      }
    } catch {}

    return { total_words: 0, total_duration: 0, words: [] };
  },

  async getBatchSubtitleText(batchId: number, type: 'master' | 'tight' = 'master', format: 'srt' | 'vtt' = 'srt'): Promise<string> {
    const key = `batch_${batchId}_${type}_${format}`;
    const blob = await MobileStorage.getAudioBlob(key);
    if (blob) {
      return blob.text();
    }

    // Dynamic on-the-fly generation if not yet cached
    try {
      const audioKey = `batch_${batchId}_${type}_audio`;
      const audioBlob = await MobileStorage.getAudioBlob(audioKey);
      const paras = await MobileStorage.getParagraphs(batchId);
      const validParas = paras.filter((p) => p.status === 'COMPLETED' || p.latest_generation);
      if (audioBlob && validParas.length > 0) {
        const fullTranscript = validParas.map((p) => p.transcript).join('\n\n');
        const buffer = await ClientAudioProcessor.decodeAudioBlob(audioBlob);
        const intervals = ClientAudioProcessor.detectSpeechIntervals(buffer, -38, 0.15);
        const res = ClientAudioProcessor.generateSubtitles(fullTranscript, intervals, buffer.duration, 3);
        const srtBlob = new Blob([res.srt], { type: 'text/plain;charset=utf-8' });
        const vttBlob = new Blob([res.vtt], { type: 'text/plain;charset=utf-8' });
        await MobileStorage.saveAudioBlob(`batch_${batchId}_${type}_srt`, srtBlob);
        await MobileStorage.saveAudioBlob(`batch_${batchId}_${type}_vtt`, vttBlob);
        return format === 'vtt' ? res.vtt : res.srt;
      }
    } catch (e) {
      console.warn('Dynamic subtitle generation fallback note:', e);
    }
    return '';
  },

  // Video & Media Studio
  async scanMedia(batchId: number, mediaFolder: string): Promise<ScanMediaResponse> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/batches/${batchId}/scan-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: mediaFolder, media_folder: mediaFolder }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to scan media folder' }));
        throw new Error(err.detail || 'Failed to scan media folder');
      }
      return res.json();
    }
    return { media_folder: mediaFolder, total_files_found: 0, matches: [] };
  },

  async uploadMediaFiles(batchId: number, files: File[]): Promise<ScanMediaResponse> {
    if (await checkBackend()) {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      const res = await fetch(`${API_BASE}/batches/${batchId}/upload-media`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to upload media files' }));
        throw new Error(err.detail || 'Failed to upload media files');
      }
      return res.json();
    }
    throw new Error('Uploading media files requires backend server');
  },

  async assignMedia(batchId: number, paragraphId: number, mediaPath: string): Promise<Paragraph> {
    if (await checkBackend()) {
      const res = await fetch(`${API_BASE}/batches/${batchId}/assign-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraph_id: paragraphId, media_path: mediaPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to assign media' }));
        throw new Error(err.detail || 'Failed to assign media');
      }
      return res.json();
    }
    const para = await MobileStorage.getParagraph(paragraphId);
    if (!para) throw new Error('Paragraph not found');
    const updated = { ...para, media_path: mediaPath };
    await MobileStorage.updateParagraph(paragraphId, updated);
    return updated;
  },

  async renderBatchVideo(
    batchId: number,
    options?: { videoVolume?: number; narrationVolume?: number; audioSource?: 'master' | 'tight' }
  ): Promise<{ status: string; master_video_path: string; duration: number }> {
    if (await checkBackend()) {
      const params = new URLSearchParams();
      if (options?.videoVolume !== undefined) params.append('video_volume', options.videoVolume.toString());
      if (options?.narrationVolume !== undefined) params.append('narration_volume', options.narrationVolume.toString());
      if (options?.audioSource) params.append('audio_source', options.audioSource);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_BASE}/batches/${batchId}/render-video${query}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to render batch video' }));
        throw new Error(err.detail || 'Failed to render batch video');
      }
      return res.json();
    }
    throw new Error('Video rendering requires backend FFmpeg service');
  },

  async getBatchRenderStatus(batchId: number): Promise<{
    status: string;
    percentage: number;
    current_shot: number;
    total_shots: number;
    current_step: string;
    elapsed_seconds: number;
    error?: string;
  }> {
    if (await checkBackend()) {
      try {
        const res = await fetch(`${API_BASE}/batches/${batchId}/render-status`);
        if (res.ok) return await res.json();
      } catch {}
    }
    return {
      status: 'IDLE',
      percentage: 0,
      current_shot: 0,
      total_shots: 0,
      current_step: '',
      elapsed_seconds: 0
    };
  },

  getMasterVideoUrl(batchId: number, source: 'master' | 'tight' = 'master'): string {
    return `${API_BASE}/batches/${batchId}/master-video?source=${source}`;
  },

  getParagraphVideoUrl(paragraphId: number): string {
    return `${API_BASE}/paragraphs/${paragraphId}/video`;
  },

  getParagraphThumbnailUrl(paragraphId: number): string {
    return `${API_BASE}/paragraphs/${paragraphId}/thumbnail`;
  },
};
