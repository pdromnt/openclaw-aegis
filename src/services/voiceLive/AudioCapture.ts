// ═══════════════════════════════════════════════════════════
// AudioCapture — Microphone input → PCM16 @ 16kHz
//
// Uses AudioWorklet (not the deprecated ScriptProcessorNode)
// to capture mic audio, resample to 16kHz, and convert to
// Int16 PCM for streaming to Gemini Live.
//
// The AudioWorklet processor is created inline via Blob URL
// to avoid needing a separate file in the public directory.
// ═══════════════════════════════════════════════════════════

import type { AudioChunkCallback } from './types';

/** Target sample rate for Gemini Live input */
const TARGET_SAMPLE_RATE = 16000;

/** Chunk duration in seconds (~150ms = ~4800 bytes at 16kHz 16-bit) */
const CHUNK_DURATION_SEC = 0.15;

/**
 * AudioWorklet processor source code (runs in audio thread).
 * Accumulates samples, resamples to target rate, converts to Int16,
 * and posts chunks to the main thread.
 */
const WORKLET_PROCESSOR_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate = options.processorOptions?.targetRate || 16000;
    this.chunkSize = options.processorOptions?.chunkSize || 2400;
    this.buffer = [];
    this.resampleRatio = this.targetRate / sampleRate;
    this.muted = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'mute') this.muted = true;
      if (e.data.type === 'unmute') this.muted = false;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || this.muted) return true;

    const channelData = input[0]; // Mono (first channel)

    // Resample if native rate differs from target
    if (Math.abs(this.resampleRatio - 1.0) > 0.001) {
      // Linear interpolation resampling
      const outputLength = Math.floor(channelData.length * this.resampleRatio);
      for (let i = 0; i < outputLength; i++) {
        const srcIndex = i / this.resampleRatio;
        const srcFloor = Math.floor(srcIndex);
        const srcCeil = Math.min(srcFloor + 1, channelData.length - 1);
        const frac = srcIndex - srcFloor;
        const sample = channelData[srcFloor] * (1 - frac) + channelData[srcCeil] * frac;
        this.buffer.push(sample);
      }
    } else {
      // No resampling needed
      for (let i = 0; i < channelData.length; i++) {
        this.buffer.push(channelData[i]);
      }
    }

    // Send chunks when we have enough samples
    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.splice(0, this.chunkSize);

      // Convert Float32 → Int16
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.port.postMessage(
        { type: 'chunk', pcm: int16.buffer },
        [int16.buffer]
      );
    }

    return true;
  }
}

registerProcessor('aegis-capture-processor', CaptureProcessor);
`;

export class AudioCapture {
  // ── State ──
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private muted = false;

  /** AnalyserNode for real-time audio level metering */
  analyser: AnalyserNode | null = null;

  /** Called for each PCM16 chunk (~150ms, 16kHz, 16-bit LE mono) */
  onChunk: AudioChunkCallback = () => {};

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  /**
   * Request microphone permission and start capturing audio.
   * @throws Error if mic permission denied or AudioWorklet not supported
   */
  async start(): Promise<void> {
    // Request mic access
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      throw new Error(
        `Microphone permission denied: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Create AudioContext (use browser's native sample rate)
    this.audioContext = new AudioContext();
    const nativeRate = this.audioContext.sampleRate;

    // Calculate chunk size at target rate for ~150ms
    const chunkSize = Math.floor(TARGET_SAMPLE_RATE * CHUNK_DURATION_SEC);

    // Register AudioWorklet processor from inline source
    const blob = new Blob([WORKLET_PROCESSOR_SOURCE], {
      type: 'application/javascript',
    });
    const blobUrl = URL.createObjectURL(blob);

    try {
      await this.audioContext.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    // Create worklet node
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      'aegis-capture-processor',
      {
        processorOptions: {
          targetRate: TARGET_SAMPLE_RATE,
          chunkSize,
        },
      }
    );

    // Listen for PCM chunks from the worklet
    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'chunk' && event.data.pcm) {
        this.onChunk(event.data.pcm);
      }
    };

    // Connect: mic → analyser → worklet → silent gain → destination
    // Gain is zeroed so the user doesn't hear their own mic.
    // Some browsers require a connected output for the worklet to process.
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // AnalyserNode for real-time audio level metering (visualizer)
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0;
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.workletNode);
    this.workletNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    this.muted = false;
  }

  /**
   * Stop capturing and release the microphone.
   */
  stop(): void {
    // Disconnect audio graph
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Stop all mic tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.muted = false;
  }

  /**
   * Temporarily stop sending audio chunks (mic stays open).
   */
  mute(): void {
    this.muted = true;
    this.workletNode?.port.postMessage({ type: 'mute' });
  }

  /**
   * Resume sending audio chunks.
   */
  unmute(): void {
    this.muted = false;
    this.workletNode?.port.postMessage({ type: 'unmute' });
  }

  /**
   * Check if currently muted.
   */
  isMuted(): boolean {
    return this.muted;
  }
}
