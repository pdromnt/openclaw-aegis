// ═══════════════════════════════════════════════════════════
// AudioPlayback — PCM @ 24kHz → Speaker output
//
// Receives PCM16 audio chunks from Gemini Live and plays
// them through the speakers with gapless sequencing.
//
// Uses a SEPARATE AudioContext from AudioCapture to avoid
// sample rate conflicts (capture=16kHz, playback=24kHz).
//
// Playback strategy: chain AudioBufferSourceNodes with
// precise scheduling for seamless audio without pops/clicks.
//
// IMPORTANT: stop() must kill ALL scheduled sources, not just
// the last one. We track every scheduled source in an array
// so we can stop them all reliably.
// ═══════════════════════════════════════════════════════════

/** Sample rate of Gemini Live audio output */
const PLAYBACK_SAMPLE_RATE = 24000;

export class AudioPlayback {
  // ── State ──
  private audioContext: AudioContext | null = null;
  private queue: AudioBuffer[] = [];
  private playing = false;
  private nextStartTime = 0;
  private scheduledCount = 0;
  private completedCount = 0;

  // ── Track ALL scheduled sources so stop() can kill them all ──
  private activeSources: AudioBufferSourceNode[] = [];
  private analyserNode: AnalyserNode | null = null;

  /** AnalyserNode for real-time output audio level metering */
  get analyser(): AnalyserNode | null { return this.analyserNode; }

  /** Called when all queued audio has finished playing */
  onPlaybackEnd: () => void = () => {};

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  /**
   * Initialize the playback AudioContext.
   * Call once before first enqueue. Safe to call multiple times.
   */
  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      // Create analyser for output level metering
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.analyserNode.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  /**
   * Add a PCM16 audio chunk to the playback queue.
   * Chunks are played sequentially without gaps.
   *
   * @param pcm24k - Raw PCM16 mono audio at 24kHz (Int16 little-endian)
   */
  enqueue(pcm24k: ArrayBuffer): void {
    const ctx = this.ensureContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err) => console.error('[AudioPlayback] Resume failed:', err));
    }

    // Convert Int16 PCM to Float32 AudioBuffer
    const audioBuffer = this.pcmToAudioBuffer(ctx, pcm24k);
    this.queue.push(audioBuffer);

    // Start scheduling if not already playing
    if (!this.playing) {
      this.playing = true;
      this.nextStartTime = ctx.currentTime;
      this.scheduledCount = 0;
      this.completedCount = 0;
    }

    this.scheduleNext();
  }

  /**
   * Stop ALL playback and clear the queue.
   * Stops every scheduled source — not just the last one.
   */
  stop(): void {
    // Stop ALL scheduled sources
    for (const source of this.activeSources) {
      try {
        source.onended = null; // Prevent onended from re-scheduling
        source.stop();
        source.disconnect();
      } catch {
        // Ignore if already stopped
      }
    }
    this.activeSources = [];

    // Clear queue and reset state
    this.queue.length = 0;
    this.playing = false;
    this.scheduledCount = 0;
    this.completedCount = 0;
    this.nextStartTime = 0;
  }

  /**
   * Check if audio is currently playing or queued.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Clean up the AudioContext. Call when voice session ends.
   */
  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Internal scheduling
  // ═══════════════════════════════════════════════════════════

  /**
   * Schedule queued audio buffers for gapless playback.
   * Uses Web Audio's precise timing to chain buffers seamlessly.
   */
  private scheduleNext(): void {
    const ctx = this.audioContext;
    if (!ctx || this.queue.length === 0) return;

    const buffer = this.queue.shift()!;
    this.scheduledCount++;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Route through analyser for level metering, then to speakers
    source.connect(this.analyserNode || ctx.destination);

    // Schedule at exact time for gapless playback
    const startTime = Math.max(this.nextStartTime, ctx.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    // Track this source so stop() can kill it
    this.activeSources.push(source);

    // When this buffer finishes, clean up and check for more
    source.onended = () => {
      this.completedCount++;

      // Remove from active sources
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }

      if (this.queue.length > 0) {
        // More chunks available — schedule next
        this.scheduleNext();
      } else if (this.completedCount >= this.scheduledCount) {
        // All chunks played, no more in queue
        this.playing = false;
        this.onPlaybackEnd();
      }
    };

    // If there are more chunks already queued, schedule them too
    // (pre-schedule up to 3 ahead for smoother playback)
    if (this.queue.length > 0 && this.scheduledCount - this.completedCount < 3) {
      this.scheduleNext();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Format conversion
  // ═══════════════════════════════════════════════════════════

  /**
   * Convert raw PCM16 (Int16 LE mono) to a Web Audio AudioBuffer.
   */
  private pcmToAudioBuffer(
    ctx: AudioContext,
    pcm: ArrayBuffer
  ): AudioBuffer {
    const int16 = new Int16Array(pcm);
    const numSamples = int16.length;

    const audioBuffer = ctx.createBuffer(1, numSamples, PLAYBACK_SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);

    // Int16 → Float32 (-1.0 to 1.0)
    for (let i = 0; i < numSamples; i++) {
      channelData[i] = int16[i] / 32768;
    }

    return audioBuffer;
  }
}
