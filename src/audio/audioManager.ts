export type BgmMode = "lobby" | "battle" | "none";

export interface AudioSettings {
  muted: boolean;
  sfxVolume: number;
  bgmVolume: number;
  ready: boolean;
  bgmMode: BgmMode;
}

type AudioStateListener = (settings: AudioSettings) => void;
type PlayableBgmMode = Exclude<BgmMode, "none">;
type BrowserWindowWithAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

interface BgmLoop {
  mode: PlayableBgmMode;
  gain: GainNode;
  timerId: number;
  nodes: Set<AudioNode>;
  step: number;
  stopping: boolean;
}

interface OscillatorNoteOptions {
  destination: AudioNode;
  nodes?: Set<AudioNode>;
  startTime: number;
  duration: number;
  frequency: number;
  endFrequency?: number;
  type: OscillatorType;
  volume: number;
  attack?: number;
  filterFrequency?: number;
  filterType?: BiquadFilterType;
  q?: number;
}

interface NoiseBurstOptions {
  startTime: number;
  duration: number;
  volume: number;
  filterType: BiquadFilterType;
  filterFrequency: number;
  q: number;
  destination?: AudioNode;
  nodes?: Set<AudioNode>;
  onEnded?: () => void;
}

const DEFAULT_SETTINGS: Omit<AudioSettings, "bgmMode"> = {
  muted: false,
  sfxVolume: 0.72,
  bgmVolume: 0.46,
  ready: false,
};

const LOBBY_BGM_INTERVAL_MS = 320;
const BATTLE_BGM_INTERVAL_MS = 145;

class AudioManager {
  private context: AudioContext | null = null;
  private readonly listeners = new Set<AudioStateListener>();
  private settings: Omit<AudioSettings, "bgmMode"> = { ...DEFAULT_SETTINGS };
  private requestedBgmMode: BgmMode = "none";
  private activeBgmLoop: BgmLoop | null = null;
  private lastImpactAt = 0;
  private activeImpactCount = 0;

  getSettings(): AudioSettings {
    return {
      ...this.settings,
      ready: this.isAudioUnlocked(),
      bgmMode: this.getCurrentBgmMode(),
    };
  }

  subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async initAudio(): Promise<void> {
    await this.unlockAudio();
  }

  async unlockAudio(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const wasUnlocked = this.isAudioUnlocked();
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? (window as BrowserWindowWithAudio).webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      this.context = new AudioContextClass();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.settings = {
      ...this.settings,
      ready: this.context.state === "running",
    };

    if (!wasUnlocked && this.isAudioUnlocked()) {
      this.debugLog("unlocked");
    }

    if (!this.settings.muted && this.requestedBgmMode !== "none") {
      this.ensureBgmLoop(this.requestedBgmMode);
    }

    this.notify();
  }

  isAudioUnlocked(): boolean {
    return !!this.context && this.context.state === "running";
  }

  getCurrentBgmMode(): BgmMode {
    if (this.settings.muted) {
      return "none";
    }

    return this.activeBgmLoop?.mode ?? this.requestedBgmMode;
  }

  switchBgm(mode: BgmMode): void {
    if (this.requestedBgmMode === mode && (mode === "none" || this.activeBgmLoop?.mode === mode)) {
      return;
    }

    this.requestedBgmMode = mode;
    this.debugLog(`switchBgm ${mode}`);

    if (mode === "none" || this.settings.muted) {
      this.fadeOutCurrentBgm();
      this.notify();
      return;
    }

    if (!this.isAudioUnlocked()) {
      this.notify();
      return;
    }

    this.ensureBgmLoop(mode);
    this.notify();
  }

  startLobbyBgm(): void {
    this.switchBgm("lobby");
  }

  stopLobbyBgm(): void {
    if (this.requestedBgmMode === "lobby") {
      this.switchBgm("none");
    }
  }

  startBattleBgm(): void {
    this.switchBgm("battle");
  }

  stopBattleBgm(): void {
    if (this.requestedBgmMode === "battle") {
      this.switchBgm("none");
    }
  }

  fadeOutCurrentBgm(): void {
    if (this.activeBgmLoop) {
      this.stopBgmLoop(this.activeBgmLoop, 0.45);
      this.activeBgmLoop = null;
    }
  }

  setMuted(muted: boolean): void {
    this.settings = {
      ...this.settings,
      muted,
    };
    this.debugLog(muted ? "muted" : "unmuted");

    if (muted) {
      this.fadeOutCurrentBgm();
      this.notify();
      return;
    }

    void this.unlockAudio().then(() => {
      if (this.requestedBgmMode !== "none") {
        this.ensureBgmLoop(this.requestedBgmMode);
      }
      this.notify();
    });
    this.notify();
  }

  setSfxVolume(value: number): void {
    this.settings = {
      ...this.settings,
      sfxVolume: clamp(value, 0, 1),
    };
    this.notify();
  }

  setBgmVolume(value: number): void {
    this.settings = {
      ...this.settings,
      bgmVolume: clamp(value, 0, 1),
    };
    this.notify();
  }

  playLaunchCharge(): void {
    const context = this.getPlayableContext();
    if (!context) {
      return;
    }

    const now = context.currentTime;
    const duration = 0.95;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(110, now);
    oscillator.frequency.exponentialRampToValueAtTime(560, now + duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(1800, now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18 * this.settings.sfxVolume, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  playLaunchShoot(): void {
    const context = this.getPlayableContext();
    if (!context) {
      return;
    }

    const now = context.currentTime;
    this.playNoiseBurst({
      startTime: now,
      duration: 0.34,
      volume: 0.28 * this.settings.sfxVolume,
      filterType: "bandpass",
      filterFrequency: 620,
      q: 0.9,
    });

    const punch = context.createOscillator();
    const punchGain = context.createGain();
    punch.type = "triangle";
    punch.frequency.setValueAtTime(170, now);
    punch.frequency.exponentialRampToValueAtTime(64, now + 0.22);
    punchGain.gain.setValueAtTime(0.26 * this.settings.sfxVolume, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    punch.connect(punchGain);
    punchGain.connect(context.destination);
    punch.start(now);
    punch.stop(now + 0.26);
  }

  playMetalImpact(intensity: number): void {
    const context = this.getPlayableContext();
    if (!context) {
      return;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastImpactAt < 55 || this.activeImpactCount >= 4) {
      return;
    }
    this.lastImpactAt = nowMs;
    this.activeImpactCount += 1;

    const normalized = clamp(intensity / 170, 0.22, 1);
    const now = context.currentTime;
    const duration = 0.1 + normalized * 0.16;
    const volume = (0.12 + normalized * 0.3) * this.settings.sfxVolume;

    this.playNoiseBurst({
      startTime: now,
      duration,
      volume,
      filterType: "bandpass",
      filterFrequency: 360 + normalized * 360,
      q: 1.6,
      onEnded: () => {
        this.activeImpactCount = Math.max(0, this.activeImpactCount - 1);
      },
    });

    const clang = context.createOscillator();
    const clangGain = context.createGain();
    clang.type = "square";
    clang.frequency.setValueAtTime(190 - normalized * 70, now);
    clang.frequency.exponentialRampToValueAtTime(84, now + duration);
    clangGain.gain.setValueAtTime(volume * 0.55, now);
    clangGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    clang.connect(clangGain);
    clangGain.connect(context.destination);
    clang.start(now);
    clang.stop(now + duration + 0.02);
  }

  playWallHit(intensity: number): void {
    const context = this.getPlayableContext();
    if (!context) {
      return;
    }

    const normalized = clamp(intensity / 150, 0.18, 0.75);
    this.playNoiseBurst({
      startTime: context.currentTime,
      duration: 0.08 + normalized * 0.08,
      volume: (0.045 + normalized * 0.11) * this.settings.sfxVolume,
      filterType: "lowpass",
      filterFrequency: 520 + normalized * 420,
      q: 0.8,
    });
  }

  stopAll(): void {
    this.requestedBgmMode = "none";
    this.fadeOutCurrentBgm();
    this.activeImpactCount = 0;
    this.notify();
  }

  private ensureBgmLoop(mode: PlayableBgmMode): void {
    if (!this.context || this.settings.muted || !this.isAudioUnlocked()) {
      return;
    }

    if (this.activeBgmLoop?.mode === mode) {
      return;
    }

    const previousLoop = this.activeBgmLoop;
    const nextLoop = this.startBgmLoop(mode);
    this.activeBgmLoop = nextLoop;

    if (previousLoop) {
      this.stopBgmLoop(previousLoop, 0.55);
    }
  }

  private startBgmLoop(mode: PlayableBgmMode): BgmLoop {
    const context = this.context;
    if (!context) {
      throw new Error("AudioContext is not ready.");
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.5);
    gain.connect(context.destination);

    const loop: BgmLoop = {
      mode,
      gain,
      timerId: 0,
      nodes: new Set<AudioNode>(),
      step: 0,
      stopping: false,
    };

    this.playBgmStep(loop);
    loop.timerId = window.setInterval(
      () => this.playBgmStep(loop),
      mode === "battle" ? BATTLE_BGM_INTERVAL_MS : LOBBY_BGM_INTERVAL_MS,
    );

    return loop;
  }

  private stopBgmLoop(loop: BgmLoop, fadeSeconds: number): void {
    if (loop.stopping) {
      return;
    }

    loop.stopping = true;
    window.clearInterval(loop.timerId);

    const context = this.context;
    if (context) {
      const now = context.currentTime;
      loop.gain.gain.cancelScheduledValues(now);
      loop.gain.gain.setValueAtTime(Math.max(0.001, loop.gain.gain.value), now);
      loop.gain.gain.linearRampToValueAtTime(0.001, now + fadeSeconds);
    }

    window.setTimeout(() => {
      loop.nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {
          // 이미 정리된 Web Audio node는 무시합니다.
        }
      });
      loop.nodes.clear();
      try {
        loop.gain.disconnect();
      } catch {
        // 이미 정리된 gain node는 무시합니다.
      }
    }, fadeSeconds * 1000 + 80);
  }

  private playBgmStep(loop: BgmLoop): void {
    if (loop.stopping || this.settings.muted || this.settings.bgmVolume <= 0) {
      return;
    }

    if (loop.mode === "lobby") {
      this.playLobbyBgmStep(loop);
    } else {
      this.playBattleBgmStep(loop);
    }

    loop.step = (loop.step + 1) % 64;
  }

  private playLobbyBgmStep(loop: BgmLoop): void {
    const context = this.getPlayableContext();
    if (!context) {
      return;
    }

    const now = context.currentTime;
    const baseVolume = this.settings.bgmVolume;
    const step = loop.step;

    if (step % 16 === 0) {
      this.scheduleOscillator({
        destination: loop.gain,
        nodes: loop.nodes,
        startTime: now,
        duration: 3.4,
        frequency: step % 32 === 0 ? 98 : 123.47,
        endFrequency: step % 32 === 0 ? 101 : 120,
        type: "sine",
        volume: 0.18 * baseVolume,
        attack: 0.42,
        filterFrequency: 620,
        filterType: "lowpass",
        q: 0.4,
      });
    }

    if (step % 4 === 0) {
      this.scheduleOscillator({
        destination: loop.gain,
        nodes: loop.nodes,
        startTime: now,
        duration: 0.32,
        frequency: step % 8 === 0 ? 196 : 246.94,
        type: "triangle",
        volume: 0.09 * baseVolume,
        attack: 0.04,
        filterFrequency: 900,
        filterType: "lowpass",
        q: 0.5,
      });
    }

    if (step % 8 === 6) {
      this.scheduleOscillator({
        destination: loop.gain,
        nodes: loop.nodes,
        startTime: now,
        duration: 0.48,
        frequency: 329.63,
        endFrequency: 349.23,
        type: "sine",
        volume: 0.055 * baseVolume,
        attack: 0.08,
        filterFrequency: 1200,
        filterType: "lowpass",
        q: 0.55,
      });
    }

    if (step % 2 === 0) {
      this.playNoiseBurst({
        startTime: now,
        duration: 0.028,
        volume: 0.045 * baseVolume,
        filterType: "highpass",
        filterFrequency: 2600,
        q: 0.6,
        destination: loop.gain,
        nodes: loop.nodes,
      });
    }
  }

  private playBattleBgmStep(loop: BgmLoop): void {
    const context = this.getPlayableContext();
    if (!context) {
      return;
    }

    const now = context.currentTime;
    const baseVolume = this.settings.bgmVolume;
    const step = loop.step;
    const bassSequence = [55, 55, 82.41, 61.74, 98, 82.41, 73.42, 61.74];
    const arpSequence = [220, 277.18, 329.63, 392, 466.16, 392, 329.63, 277.18];
    const accent = step % 4 === 0 ? 1 : 0.72;

    this.scheduleOscillator({
      destination: loop.gain,
      nodes: loop.nodes,
      startTime: now,
      duration: 0.13,
      frequency: bassSequence[step % bassSequence.length],
      endFrequency: bassSequence[step % bassSequence.length] * 0.94,
      type: "sawtooth",
      volume: 0.23 * baseVolume * accent,
      attack: 0.012,
      filterFrequency: 360,
      filterType: "lowpass",
      q: 0.85,
    });

    if (step % 2 === 1) {
      this.scheduleOscillator({
        destination: loop.gain,
        nodes: loop.nodes,
        startTime: now,
        duration: 0.09,
        frequency: arpSequence[step % arpSequence.length],
        endFrequency: arpSequence[step % arpSequence.length] * 1.015,
        type: "square",
        volume: 0.052 * baseVolume,
        attack: 0.006,
        filterFrequency: 1800,
        filterType: "bandpass",
        q: 1.4,
      });
    }

    if (step % 8 === 4) {
      this.scheduleOscillator({
        destination: loop.gain,
        nodes: loop.nodes,
        startTime: now,
        duration: 0.26,
        frequency: 146.83,
        endFrequency: 110,
        type: "triangle",
        volume: 0.08 * baseVolume,
        attack: 0.03,
        filterFrequency: 720,
        filterType: "lowpass",
        q: 0.7,
      });
    }

    if (step % 2 === 0) {
      this.playNoiseBurst({
        startTime: now,
        duration: step % 4 === 0 ? 0.036 : 0.024,
        volume: (step % 4 === 0 ? 0.09 : 0.055) * baseVolume,
        filterType: "highpass",
        filterFrequency: 3600,
        q: 0.7,
        destination: loop.gain,
        nodes: loop.nodes,
      });
    }
  }

  private scheduleOscillator({
    destination,
    nodes,
    startTime,
    duration,
    frequency,
    endFrequency,
    type,
    volume,
    attack = 0.02,
    filterFrequency,
    filterType,
    q = 0.7,
  }: OscillatorNoteOptions): void {
    const context = this.context;
    if (!context || this.settings.muted || volume <= 0.0005) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const shouldUseFilter = filterFrequency !== undefined && filterType !== undefined;
    const filter = shouldUseFilter ? context.createBiquadFilter() : null;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (endFrequency) {
      oscillator.frequency.linearRampToValueAtTime(endFrequency, startTime + duration);
    }

    if (filter && shouldUseFilter) {
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFrequency, startTime);
      filter.Q.setValueAtTime(q, startTime);
      oscillator.connect(filter);
      filter.connect(gain);
      nodes?.add(filter);
    } else {
      oscillator.connect(gain);
    }

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    gain.connect(destination);

    nodes?.add(oscillator);
    nodes?.add(gain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
    oscillator.onended = () => {
      this.cleanupNodes([oscillator, gain, filter], nodes);
    };
  }

  private playNoiseBurst({
    startTime,
    duration,
    volume,
    filterType,
    filterFrequency,
    q,
    destination,
    nodes,
    onEnded,
  }: NoiseBurstOptions): void {
    const context = this.context;
    if (!context || this.settings.muted || volume <= 0.0005) {
      onEnded?.();
      return;
    }

    const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, startTime);
    filter.Q.setValueAtTime(q, startTime);
    gain.gain.setValueAtTime(Math.max(0.001, volume), startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination ?? context.destination);
    source.start(startTime);
    source.stop(startTime + duration + 0.01);

    nodes?.add(source);
    nodes?.add(filter);
    nodes?.add(gain);
    source.onended = () => {
      this.cleanupNodes([source, filter, gain], nodes);
      onEnded?.();
    };
  }

  private cleanupNodes(nodesToClean: Array<AudioNode | null>, trackingSet?: Set<AudioNode>): void {
    nodesToClean.forEach((node) => {
      if (!node) {
        return;
      }

      try {
        node.disconnect();
      } catch {
        // 이미 정리된 Web Audio node는 무시합니다.
      }
      trackingSet?.delete(node);
    });
  }

  private getPlayableContext(): AudioContext | null {
    if (!this.context || this.settings.muted || this.context.state !== "running") {
      return null;
    }

    return this.context;
  }

  private notify(): void {
    const nextSettings = this.getSettings();
    this.listeners.forEach((listener) => listener(nextSettings));
  }

  private debugLog(message: string): void {
    const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      console.log(`[Audio] ${message}`);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const audioManager = new AudioManager();
