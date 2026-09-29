/**
 * Direct Client-Side Gemini 3.1 & 2.5 TTS Engine for Android / Mobile.
 * Connects directly to Google Gemini API with multi-key round-robin pooling.
 */

export interface ClientTTSOptions {
  prompt: string;
  transcript: string;
  voice?: string;
  model?: string;
  apiKeys?: string[];
}

export interface ClientTTSResult {
  wavBlob: Blob;
  wavBase64: string;
  duration: number;
  sampleRate: number;
  modelUsed: string;
  keyUsedIndex: number;
}

export class ClientGeminiService {
  private static lastKeyIndex = -1;
  private static lastCallTimes: Map<string, number> = new Map();
  private static MIN_KEY_INTERVAL_MS = 20500; // 3 RPM safety

  /**
   * Encodes raw 24kHz 16-bit Mono PCM buffer into a standard WAV Blob.
   */
  public static pcmToWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.byteLength;
    const headerBuffer = new ArrayBuffer(44);
    const view = new DataView(headerBuffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataSize, true); // file length - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels (1)
    view.setUint32(24, sampleRate, true); // SampleRate (24000)
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample (16)

    // data sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true); // Subchunk2Size

    return new Blob([headerBuffer, pcmData], { type: 'audio/wav' });
  }

  /**
   * Generates synthetic audio tone in demo mode when no API keys are set.
   */
  public static generateDemoAudio(durationSec: number = 3.0, sampleRate: number = 24000): Blob {
    const numSamples = Math.floor(durationSec * sampleRate);
    const buffer = new ArrayBuffer(numSamples * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = 220 + Math.sin(2 * Math.PI * 1.5 * t) * 40;
      const env = Math.min(1.0, i / (sampleRate * 0.1)) * Math.min(1.0, (numSamples - i) / (sampleRate * 0.1));
      const sample = Math.sin(2 * Math.PI * freq * t) * 0.25 * env;
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(i * 2, intSample, true);
    }

    return this.pcmToWavBlob(new Uint8Array(buffer), sampleRate);
  }

  /**
   * Direct Gemini TTS call with multi-key round-robin rotation.
   */
  public static async generateSpeech(options: ClientTTSOptions): Promise<ClientTTSResult> {
    const rawKeys = options.apiKeys && options.apiKeys.length > 0 ? options.apiKeys : [];
    const validKeys = rawKeys.filter((k) => k && k.trim().length > 5);

    if (validKeys.length === 0) {
      // Demo Mode
      const demoBlob = this.generateDemoAudio(3.0);
      const base64 = await this.blobToBase64(demoBlob);
      return {
        wavBlob: demoBlob,
        wavBase64: base64,
        duration: 3.0,
        sampleRate: 24000,
        modelUsed: 'demo-mode',
        keyUsedIndex: 0,
      };
    }

    const modelPreference = options.model || 'gemini-3.8-flash-tts';
    const modelsToTry = [
      modelPreference,
      'gemini-3.8-flash-tts',
      'gemini-3.8-flash-lite-tts',
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-flash-preview-tts',
      'gemini-2.0-flash',
    ].filter((v, i, a) => a.indexOf(v) === i);

    let lastError: any = null;

    // Try keys in round-robin sequence
    for (let attempt = 0; attempt < validKeys.length; attempt++) {
      this.lastKeyIndex = (this.lastKeyIndex + 1) % validKeys.length;
      const keyIndex = this.lastKeyIndex;
      const apiKey = validKeys[keyIndex].trim();

      // Check key pacing
      const lastUsed = this.lastCallTimes.get(apiKey) || 0;
      const elapsed = Date.now() - lastUsed;
      if (elapsed < this.MIN_KEY_INTERVAL_MS) {
        const waitMs = this.MIN_KEY_INTERVAL_MS - elapsed;
        await new Promise((r) => setTimeout(r, waitMs));
      }

      // Extract clean spoken text to ensure metadata/instructions are never synthesized as speech
      let speechContent = options.transcript && options.transcript.trim() ? options.transcript.trim() : options.prompt;
      if (speechContent.includes('TRANSCRIPT:\n')) {
        const parts = speechContent.split('TRANSCRIPT:\n');
        speechContent = parts[parts.length - 1].trim();
      }

      for (const model of modelsToTry) {
        try {
          const result = await this.callGeminiApi(speechContent, options.voice || 'Algenib', model, apiKey);
          this.lastCallTimes.set(apiKey, Date.now());
          return {
            ...result,
            modelUsed: model,
            keyUsedIndex: keyIndex + 1,
          };
        } catch (err: any) {
          lastError = err;
          // If rate limit (429), try next model or next key
          console.warn(`[ClientTTS] Key ${keyIndex + 1} with ${model} failed: ${err.message}. Rotating...`);
        }
      }
    }

    throw new Error(`All API keys exhausted. Last error: ${lastError?.message || 'Unknown'}`);
  }

  private static async callGeminiApi(
    prompt: string,
    voice: string,
    model: string,
    apiKey: string
  ): Promise<{ wavBlob: Blob; wavBase64: string; duration: number; sampleRate: number }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.error?.message || JSON.stringify(errJson);
      } catch {
        errText = await res.text();
      }
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const inlineData = part?.inlineData;

    if (!inlineData || !inlineData.data) {
      throw new Error('Gemini API did not return audio data in response.');
    }

    const mimeType = inlineData.mimeType || '';
    const base64Str = inlineData.data;
    const binaryStr = atob(base64Str);
    const pcmBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      pcmBytes[i] = binaryStr.charCodeAt(i);
    }

    const sampleRate = mimeType.includes('rate=') ? parseInt(mimeType.split('rate=')[1], 10) || 24000 : 24000;
    const wavBlob = this.pcmToWavBlob(pcmBytes, sampleRate);
    const duration = pcmBytes.length / (sampleRate * 2); // 16-bit mono

    return {
      wavBlob,
      wavBase64: `data:audio/wav;base64,${await this.blobToBase64(wavBlob)}`,
      duration: Math.round(duration * 100) / 100,
      sampleRate,
    };
  }

  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const b64 = res.split(',')[1] || res;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
