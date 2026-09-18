/**
 * Offline performance timing for the Robby study.
 * Voice playback accepts original film audio supplied by the host application.
 * No speech synthesis, voice imitation, or external requests are used here.
 */
const TAU = Math.PI * 2;
const REGISTER_PREROLL = 0.7;
const MODES = new Set(['idle', 'walk', 'talk', 'lights', 'drive', 'showcase']);
const FILM_UNAVAILABLE = 'Original film clip unavailable — captions only.';
const PLAYBACK_UNAVAILABLE = 'Original film audio could not play — captions only.';
const CAPTIONS = {
  idle: 'Ready for demonstration.',
  walk: 'A measured, short-stride walk with a gentle side-to-side weight shift.',
  lights: 'The dome mechanisms cycle. Speaking lamps remain dark.',
  drive: 'Vehicle demonstration. Speaking lamps remain dark.',
};
const SHOWCASE = [
  { mode: 'walk', end: 6.5 },
  { mode: 'talk', end: 16.7 },
  { mode: 'lights', end: 22.2 },
];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

export class PerformanceController extends EventTarget {
  constructor() {
    super();
    this._mediaQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this._state = {
      mode: 'idle', activeMode: 'idle', time: 0, modeTime: 0,
      phase: 0, walkWeight: 0, speechLevel: 0, lightLevel: 0,
      registerLevel: 0, speaking: false,
      caption: CAPTIONS.idle, muted: true,
      reducedMotion: Boolean(this._mediaQuery?.matches),
      clipAvailable: false, audioStatus: 'muted',
    };
    this._modeTime = 0;
    this._segmentTime = 0;
    this._talkPhase = 'none';
    this._clipCaption = '';
    this._clipUrl = '';
    this._clipDuration = 9;
    this._audio = null;
    this._context = null;
    this._mediaSource = null;
    this._analyser = null;
    this._samples = null;
    this._effectNodes = [];
    this._playGeneration = 0;
    this._soundAuthorized = false;
    this._destroyed = false;
    this._reducedMotionOverridden = false;
    this._onVisibility = () => { if (globalThis.document?.hidden) this.stop(); };
    this._onMotionPreference = event => {
      if (!this._reducedMotionOverridden) this._applyReducedMotion(event.matches);
    };
    globalThis.document?.addEventListener('visibilitychange', this._onVisibility);
    this._mediaQuery?.addEventListener?.('change', this._onMotionPreference);
  }

  /** The stable, read-only-by-convention render state. */
  get state() { return this._state; }

  /** Supply a bundled original-film clip and its transcript/caption. Does not play. */
  setClip(url, caption = '') {
    if (this._destroyed) return;
    this._cancelSound();
    this._talkPhase = 'none';
    this._releaseMediaSource();
    if (this._audio) {
      this._audio.removeAttribute('src');
      this._audio.load();
    }
    this._audio = null;
    this._clipUrl = typeof url === 'string' ? url : '';
    this._clipCaption = typeof caption === 'string' ? caption : '';
    this._clipDuration = 9;
    this._state.clipAvailable = Boolean(this._clipUrl);
    this._state.audioStatus = this._state.muted ? 'muted' : 'ready';
    if (this._clipUrl && typeof globalThis.Audio === 'function') {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.crossOrigin = 'anonymous';
      audio.volume = 0.72;
      audio.src = this._clipUrl;
      audio.addEventListener('loadedmetadata', () => {
        if (audio !== this._audio) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this._clipDuration = clamp(audio.duration, 0.8, 9.5);
        }
      });
      audio.addEventListener('ended', () => {
        if (audio !== this._audio || this._state.activeMode !== 'talk') return;
        this._talkPhase = 'done';
        this._setSpeaking(false);
        if (this._state.mode === 'talk') this.stop();
        else this._setAudioStatus(this._state.muted ? 'muted' : 'clip-complete');
      });
      audio.addEventListener('error', () => {
        if (audio !== this._audio) return;
        this._state.clipAvailable = false;
        this._setSpeaking(false);
        this._setAudioStatus('clip-unavailable');
        if (this._state.activeMode === 'talk') this._setCaption(FILM_UNAVAILABLE);
      });
      this._audio = audio;
    }
    if (this._state.activeMode === 'talk') this._setCaption(this._captionFor('talk'));
    this._emitChange();
  }

  /** Call from a UI gesture. Selecting the same mode restarts that demonstration. */
  setMode(mode) {
    if (this._destroyed || !MODES.has(mode)) return false;
    if (mode === 'idle') { this.stop(); return true; }
    this._cancelSound();
    this._authorizeSound();
    this._modeTime = 0;
    this._segmentTime = 0;
    this._state.modeTime = 0;
    this._state.mode = mode;
    this._enterSegment(mode === 'showcase' ? SHOWCASE[0].mode : mode);
    this._emitChange();
    return true;
  }

  setMuted(muted) {
    if (this._destroyed) return;
    const next = Boolean(muted);
    if (next === this._state.muted) return;
    this._state.muted = next;
    this._cancelSound();
    if (next) {
      this._soundAuthorized = false;
      this._state.audioStatus = 'muted';
    } else {
      this._authorizeSound();
      this._state.audioStatus = this._soundAuthorized ? 'ready' : 'gesture-required';
      // A direct unmute restarts the registers followed by the original clip.
      if (this._state.activeMode === 'talk') {
        this._segmentTime = 0;
        if (this._state.mode === 'talk') this._modeTime = 0;
        // Restart the showcase speech window with the restarted clip, so a
        // late unmute cannot advance to Lights in the middle of its audio.
        if (this._state.mode === 'showcase') this._modeTime = SHOWCASE[0].end;
        this._state.modeTime = this._modeTime;
        this._beginTalk();
      }
    }
    this._emitChange();
  }

  setReducedMotion(reduced) {
    this._reducedMotionOverridden = true;
    this._applyReducedMotion(Boolean(reduced));
  }

  _applyReducedMotion(reduced) {
    if (this._destroyed || reduced === this._state.reducedMotion) return;
    this._state.reducedMotion = reduced;
    if (reduced) {
      this._state.walkWeight = 0;
      this._state.registerLevel = 0;
      this._state.speechLevel = this._state.speaking ? 0.35 : 0;
      this._state.lightLevel = this._state.speechLevel;
    }
    this._setCaption(this._captionFor(this._state.activeMode));
    this._emitChange();
  }

  stop() {
    if (this._destroyed) return;
    this._cancelSound();
    this._modeTime = 0;
    this._segmentTime = 0;
    this._talkPhase = 'none';
    Object.assign(this._state, {
      mode: 'idle', activeMode: 'idle', modeTime: 0,
      walkWeight: 0, speechLevel: 0, lightLevel: 0,
      registerLevel: 0, speaking: false,
      caption: CAPTIONS.idle,
      audioStatus: this._state.muted ? 'muted' : 'ready',
    });
    this._emitChange();
  }

  /** Real elapsed seconds drive timing; tempo scales only the walking cadence. */
  update(dt, tempo = 1) {
    if (this._destroyed) return this._state;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const walkTempo = Number.isFinite(tempo) ? clamp(tempo, 0, 3) : 1;
    const state = this._state;
    state.time += step;
    this._modeTime += step;
    this._segmentTime += step;
    state.modeTime = this._modeTime;
    if (state.mode === 'showcase') {
      const segment = SHOWCASE.find(item => this._modeTime < item.end);
      if (!segment) { this.stop(); return state; }
      if (segment.mode !== state.activeMode) {
        const previous = SHOWCASE[SHOWCASE.indexOf(segment) - 1];
        this._enterSegment(segment.mode, this._modeTime - (previous?.end || 0));
        this._emitChange();
      }
    } else {
      const audibleTalk = !state.muted && ['loading-original', 'playing-original'].includes(state.audioStatus);
      const duration = state.mode === 'talk' ? REGISTER_PREROLL + (audibleTalk ? 9.5 : this._clipDuration)
        : state.mode === 'lights' ? 7 : Infinity;
      if (this._modeTime >= duration) { this.stop(); return state; }
    }

    const active = state.activeMode;
    const segmentTime = this._segmentTime;
    if (active === 'talk') this._advanceTalk();
    if (state.reducedMotion) {
      state.walkWeight = 0;
      state.registerLevel = 0;
      state.speechLevel = state.speaking ? 0.35 : 0;
      state.lightLevel = state.speechLevel;
      return state;
    }

    const walking = active === 'walk' ? 1 : 0;
    state.walkWeight += (walking - state.walkWeight) * (1 - Math.exp(-step * 5));
    if (state.walkWeight < 0.001) state.walkWeight = 0;
    if (state.walkWeight > 0) state.phase = (state.phase + step * walkTempo * TAU * 0.8) % TAU;
    state.speechLevel = state.speaking ? this._speechEnvelope(segmentTime - REGISTER_PREROLL) : 0;
    // No resting glow, residual fade, or illumination from non-speaking modes.
    state.lightLevel = state.speechLevel;
    return state;
  }

  _enterSegment(mode, elapsed = 0) {
    this._cancelSound();
    this._segmentTime = elapsed;
    this._talkPhase = 'none';
    this._state.activeMode = mode;
    this._state.registerLevel = 0;
    this._setCaption(this._captionFor(mode));
    if (mode === 'talk') {
      // Give a newly entered speech scene its full audible cue even after a
      // delayed animation frame. Normal frame timing differs only by overshoot.
      this._segmentTime = 0;
      if (this._state.mode === 'showcase') {
        this._modeTime = SHOWCASE[0].end;
        this._state.modeTime = this._modeTime;
      }
      this._beginTalk();
    }
  }

  _captionFor(mode) {
    let caption = mode === 'talk'
      ? this._talkPhase === 'registers'
        ? 'Registers cycling…'
        : this._state.audioStatus === 'playback-unavailable'
        ? `${PLAYBACK_UNAVAILABLE}${this._clipCaption ? ` ${this._clipCaption}` : ''}`
        : this._state.audioStatus === 'gesture-required'
          ? 'Click Talk to enable original film audio.'
        : this._state.clipAvailable
        ? this._clipCaption || 'Original film voice clip.'
        : FILM_UNAVAILABLE
      : CAPTIONS[mode] || CAPTIONS.idle;
    if (this._state.reducedMotion && mode !== 'idle') {
      caption += ' Reduced motion: movement paused; speaking illumination stays steady.';
    }
    return caption;
  }

  _setCaption(caption) {
    if (this._state.caption === caption) return;
    this._state.caption = caption;
    this._emitChange();
  }

  _setAudioStatus(status) {
    if (status === this._state.audioStatus) return;
    this._state.audioStatus = status;
    this._emitChange();
  }

  _setSpeaking(speaking) {
    const next = Boolean(speaking);
    const changed = next !== this._state.speaking;
    this._state.speaking = next;
    if (!next) {
      this._state.speechLevel = 0;
      this._state.lightLevel = 0;
    }
    if (changed) this._emitChange();
  }

  _beginTalk() {
    this._talkPhase = 'registers';
    this._setSpeaking(false);
    this._state.registerLevel = this._state.reducedMotion ? 0 : 1;
    this._setCaption(this._captionFor('talk'));
    this._playRegisters();
  }

  _advanceTalk() {
    if (this._talkPhase === 'registers') {
      this._state.registerLevel = this._state.reducedMotion ? 0 : 1;
      if (this._segmentTime < REGISTER_PREROLL) return;
      this._cancelEffects();
      this._state.registerLevel = 0;
      this._talkPhase = 'voice';
      this._setCaption(this._captionFor('talk'));
      if (!this._state.muted) this._playClip();
    }
    if (this._talkPhase === 'voice' && this._state.muted) {
      const voiceTime = this._segmentTime - REGISTER_PREROLL;
      this._setSpeaking(this._state.clipAvailable && voiceTime < this._clipDuration);
    }
  }

  _playRegisters() {
    if (this._state.muted || !this._soundAuthorized || globalThis.document?.hidden) return;
    const context = this._ensureAudioContext();
    if (!context) return;
    // A generated nonverbal mechanism cue, not audio sampled from the film.
    // Every scheduled node is retained for immediate Stop/mute cancellation.
    try {
      const start = context.currentTime;
      for (let i = 0; i < 7; i++) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + i * 0.1;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime([960, 1320, 810, 1480, 1060, 1220, 920][i], at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.045, at + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.019);
        oscillator.connect(gain);
        gain.connect(context.destination);
        this._effectNodes.push(oscillator, gain);
        oscillator.start(at);
        oscillator.stop(at + 0.022);
      }
    } catch { this._cancelEffects(); }
  }

  _authorizeSound() {
    if (this._state.muted || globalThis.document?.hidden) return;
    const activation = globalThis.navigator?.userActivation;
    if (activation && !activation.isActive) return;
    this._soundAuthorized = true;
    this._ensureAudioContext();
  }

  _ensureAudioContext() {
    if (!this._soundAuthorized || this._state.muted) return null;
    try {
      if (!this._context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return null;
        this._context = new Context();
      }
      if (this._context.state === 'suspended') this._context.resume().catch(() => {});
      return this._context;
    } catch { return null; }
  }

  _connectClipAnalyser() {
    const context = this._ensureAudioContext();
    if (!context || !this._audio || this._mediaSource) return;
    try {
      this._mediaSource = context.createMediaElementSource(this._audio);
      this._analyser = context.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.55;
      this._samples = new Uint8Array(this._analyser.fftSize);
      this._mediaSource.connect(this._analyser);
      this._analyser.connect(context.destination);
    } catch {
      // If analysis is unavailable, preserve direct clip playback where possible.
      if (this._mediaSource) {
        try { this._mediaSource.connect(context.destination); } catch { /* optional audio */ }
      }
      this._analyser = null;
      this._samples = null;
    }
  }

  _playClip() {
    if (this._state.muted || globalThis.document?.hidden) return;
    if (!this._audio || !this._state.clipAvailable) {
      this._state.clipAvailable = false;
      this._setAudioStatus('clip-unavailable');
      this._setCaption(FILM_UNAVAILABLE);
      return;
    }
    if (!this._soundAuthorized) {
      this._setAudioStatus('gesture-required');
      this._setCaption(this._captionFor('talk'));
      return;
    }
    const audio = this._audio;
    const generation = this._playGeneration;
    this._connectClipAnalyser();
    try { audio.currentTime = 0; } catch { /* metadata can arrive later */ }
    try {
      const result = audio.play();
      this._setAudioStatus(result?.then ? 'loading-original' : 'playing-original');
      if (!result?.then) this._setSpeaking(true);
      result?.then(() => {
        // A stale play promise may belong to the same element already restarted
        // by a newer Talk action; avoid pausing that valid new playback.
        if (this._audio !== audio || this._destroyed || this._state.muted
          || this._state.activeMode !== 'talk' || this._talkPhase !== 'voice'
          || globalThis.document?.hidden) audio.pause();
        else if (generation === this._playGeneration) {
          this._setAudioStatus('playing-original');
          this._setSpeaking(true);
        }
      }).catch(() => {
        if (generation === this._playGeneration) this._reportPlaybackFailure();
      });
    } catch { this._reportPlaybackFailure(); }
  }

  _reportPlaybackFailure() {
    this._setSpeaking(false);
    this._setAudioStatus('playback-unavailable');
    this._setCaption(this._captionFor('talk'));
  }

  _speechEnvelope(time) {
    if (!this._state.clipAvailable || !this._state.speaking) return 0;
    if (this._analyser && this._samples && this._audio && !this._audio.paused
      && this._context?.state === 'running') {
      this._analyser.getByteTimeDomainData(this._samples);
      let sum = 0;
      for (const sample of this._samples) sum += ((sample - 128) / 128) ** 2;
      return clamp(Math.sqrt(sum / this._samples.length) * 4.8);
    }
    // Silent preview and browsers without an analyser use a stylized rhythm,
    // only inside the active voice phase; it is not measured film phonemes.
    if (time >= this._clipDuration) return 0;
    const onset = smoothstep(time / 0.18);
    const release = smoothstep((this._clipDuration - time) / 0.3);
    const phrase = Math.max(0, Math.sin(time * 3.4) + 0.3);
    const syllable = 0.4 + 0.6 * Math.abs(Math.sin(time * 10.3));
    return clamp(phrase * syllable * onset * release * 0.7);
  }

  _cancelClip() {
    this._playGeneration += 1;
    if (!this._audio) return;
    this._audio.pause();
    try { this._audio.currentTime = 0; } catch { /* not loaded */ }
  }

  _cancelEffects() {
    for (const node of this._effectNodes) {
      try { node.stop?.(); } catch { /* oscillator already stopped */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this._effectNodes = [];
  }

  _cancelSound() {
    this._cancelClip();
    this._cancelEffects();
    this._setSpeaking(false);
    this._state.audioStatus = this._state.muted ? 'muted' : 'ready';
  }

  _releaseMediaSource() {
    try { this._mediaSource?.disconnect(); } catch { /* optional audio */ }
    try { this._analyser?.disconnect(); } catch { /* optional audio */ }
    this._mediaSource = null;
    this._analyser = null;
    this._samples = null;
  }

  _emitChange() {
    if (!this._destroyed) this.dispatchEvent(new Event('change'));
  }

  destroy() {
    if (this._destroyed) return;
    this.stop();
    this._destroyed = true;
    globalThis.document?.removeEventListener('visibilitychange', this._onVisibility);
    this._mediaQuery?.removeEventListener?.('change', this._onMotionPreference);
    this._releaseMediaSource();
    if (this._audio) {
      this._audio.removeAttribute('src');
      this._audio.load();
      this._audio = null;
    }
    this._context?.close().catch(() => {});
    this._context = null;
  }
}
