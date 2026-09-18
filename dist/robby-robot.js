(()=>{
const PerformanceController=(()=>{
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

class PerformanceController extends EventTarget {
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

return PerformanceController;})();
const RobbyRenderer=(()=>{
// Original procedural artwork drawn from the supplied full-body photograph.
// Crown = 0; soles = 480. Orthographic depth keeps orbiting independent of WebGL.
const PI = Math.PI, clamp = (n,a,b) => Math.max(a,Math.min(b,n)), f = n => Number(n.toFixed(2));
class RobbyRenderer {
  constructor(svg) { this.svg=svg; this.yaw=-.22; this.zoom=1; this.offset=0; this.groundPitch=null; svg.setAttribute('viewBox','-300 -24 600 554'); }
  render(s) {
    const t=s.time||0, phase=s.phase||0, motion=s.reducedMotion?0:1, walk=(s.walkWeight||0)*motion;
    const c=Math.cos(this.yaw), sn=Math.sin(this.yaw), sway=Math.sin(phase)*2*walk, bob=-Math.abs(Math.sin(phase))*1.6*walk;
    // A signal alone must never make an idle robot glow.
    const speech=s.speaking?clamp(s.speechLevel||0,0,1):0, registers=clamp(s.registerLevel||0,0,1);
    const mechanism=motion*Math.max(registers,speech*.7,s.activeMode==='lights'?.65:0);
    // Match the car's lateral ground depth as Robby turns, while preserving
    // the portrait artwork's shallow relief on its front-mounted details.
    const p=(x,y,z=0)=>[f(x*c+z*sn+sway),f(y-z*.065-(this.groundPitch===null?0:x*sn*this.groundPitch)+bob)], pt=(x,y,z=0)=>p(x,y,z).join(',');
    const radius=(x,z=x)=>Math.sqrt((x*c)**2+(z*sn)**2);
    const ell=(x,y,z,rx,ry,fill='url(#rb-black)',rz=rx,stroke='#465056',sw=.65)=>{const [cx,cy]=p(x,y,z);return `<ellipse cx="${cx}" cy="${cy}" rx="${f(radius(rx,rz))}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;};
    const line=(a,b,color,width=1,extra='')=>`<path d="M${p(...a)} L${p(...b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
    const tube=(a,b,r,fill='url(#rb-black)')=>line(a,b,'#465056',r*2+.8)+line(a,b,fill,r*2);
    const path=(commands,fill,stroke='#414b51',sw=.7,extra='')=>`<path d="${commands.map(([cmd,...coords])=>cmd+Array.from({length:coords.length/3},(_,i)=>pt(...coords.slice(i*3,i*3+3))).join(' ')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
    const volume=(y,width,depth,d,fill='url(#rb-body)')=>{const [x,yy]=p(0,y),scale=radius(width,depth)/width;return `<path d="${d}" transform="translate(${x} ${yy}) scale(${f(scale)} 1)" fill="${fill}" stroke="#3d484e" stroke-width=".85"/>`;};
    const defs=`<defs>
      <radialGradient id="rb-black" cx="29%" cy="23%" r="83%"><stop stop-color="#7d888b"/><stop offset=".14" stop-color="#455055"/><stop offset=".34" stop-color="#20292e"/><stop offset=".68" stop-color="#11171b"/><stop offset=".89" stop-color="#080d11"/><stop offset="1" stop-color="#38444b"/></radialGradient>
      <linearGradient id="rb-body" x1="0" x2="1" y1="0" y2=".12"><stop stop-color="#0b1116"/><stop offset=".13" stop-color="#4e5a61"/><stop offset=".28" stop-color="#252f35"/><stop offset=".59" stop-color="#161e23"/><stop offset=".86" stop-color="#10171b"/><stop offset="1" stop-color="#424f57"/></linearGradient>
      <linearGradient id="rb-hood"><stop stop-color="#12191e"/><stop offset=".17" stop-color="#4d595e"/><stop offset=".36" stop-color="#283239"/><stop offset=".72" stop-color="#192229"/><stop offset="1" stop-color="#3d494f"/></linearGradient>
      <linearGradient id="rb-chrome"><stop stop-color="#5c656a"/><stop offset=".19" stop-color="#e7e6dd"/><stop offset=".34" stop-color="#8f9b9f"/><stop offset=".56" stop-color="#343f45"/><stop offset=".78" stop-color="#bdc6c7"/><stop offset="1" stop-color="#677278"/></linearGradient>
      <radialGradient id="rb-amber" cx="31%" cy="28%"><stop stop-color="#ac9470"/><stop offset=".38" stop-color="#725a3d"/><stop offset=".7" stop-color="#443728"/><stop offset="1" stop-color="#242421"/></radialGradient>
      <linearGradient id="rb-ivory"><stop stop-color="#6c756d"/><stop offset=".38" stop-color="#bdc4ac"/><stop offset=".65" stop-color="#8d9787"/><stop offset="1" stop-color="#4e5c58"/></linearGradient>
      <linearGradient id="rb-glass"><stop stop-color="#d7edf1" stop-opacity=".23"/><stop offset=".21" stop-color="#dbeff2" stop-opacity=".025"/><stop offset=".75" stop-color="#dbeff2" stop-opacity=".01"/><stop offset="1" stop-color="#dcebef" stop-opacity=".16"/></linearGradient>
      <radialGradient id="rb-bulb"><stop stop-color="#c7c0a3" stop-opacity=".7"/><stop offset=".6" stop-color="#9b947b" stop-opacity=".3"/><stop offset="1" stop-color="#c4c6b3" stop-opacity=".5"/></radialGradient>
      <filter id="rb-blue-glow" x="-25%" y="-200%" width="150%" height="500%"><feGaussianBlur stdDeviation="1.5"/></filter>
      <filter id="rb-lamp-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2"/></filter>
      <filter id="rb-shadow"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>`;
    const leg=side=>{
      const cycle=phase+(side<0?PI:0),lift=Math.max(0,Math.sin(cycle))*7*walk,z=Math.cos(cycle)*10*walk,x=side*32;
      let out='';
      for(const [i,y] of [335,374,415].entries()) {
        const yy=y-lift*(.42+i*.25);
        out+=ell(x,yy,z,28.7-i*.45,27,'url(#rb-black)',27);
        out+=path([['M',x-26,yy+11,z+7],['Q',x,yy+20,z+24,x+26,yy+11,z+7]],'none','#080e12',.9);
      }
      out+=ell(x,442-lift,z,20,5,'url(#rb-body)',22,'#0b1216');
      const [bx,by]=p(x,441-lift,z+10),bw=radius(32,37)/32;
      out+=`<path d="M-24 1 C-30 6-33 17-32 27 L-29 34 Q0 42 29 34 L32 27 C33 17 28 6 23 1 Q0-7-24 1Z" transform="translate(${bx} ${by}) scale(${f(bw)} 1)" fill="url(#rb-black)" stroke="#38434a" stroke-width=".8"/>`;
      out+=`<path d="M-30 24 Q0 12 30 24 M-29 34 Q0 39 29 34" transform="translate(${bx} ${by}) scale(${f(bw)} 1)" fill="none" stroke="#080e12" stroke-width="1.1"/>`;
      return {depth:-x*sn+z*c,markup:out};
    };
    const arms=[-1,1].map(side=>{
      const swing=Math.sin(phase+(side<0?PI:0))*8*walk,sx=side*62,ex=side*73,hx=side*78;
      let a=tube([sx,181,1],[ex,214,15+swing],24);
      a+=ell(sx,185,1,29,32,'url(#rb-black)',30);
      // Large overlapping tapered shells give the arms their characteristic heavy profile.
      for(const [y,rx,ry,z,x] of [[197,28,28,10,side*67],[208,26.5,26,18,side*72],[219,24.5,24,24,side*75]]) {
        a+=ell(x,y,z+swing,rx,ry,'url(#rb-black)',rx);
        a+=path([['M',x-rx*.92,y-7,z+swing+7],['Q',x,y-ry,z+swing+rx,x+rx*.92,y-7,z+swing+7]],'none','#849094',.65,'opacity=".5"');
      }
      a+=ell(hx,238,33+swing,13,13,'url(#rb-body)',13,'#586469',.75);
      a+=tube([hx,240,35+swing],[hx+side,253,40+swing],9);
      for(let j=0;j<3;j++) {
        const fx=hx+side*(j-1)*5.7,fy=251+(j===1?2:0),zz=44+swing+j*.6;
        a+=tube([fx,fy,zz],[fx+side*1.8,fy+14,zz+4],3.9);
        a+=line([fx-2,fy+5,zz+5],[fx+3,fy+5,zz+5],'#657078',.6);
        a+=line([fx-1,fy+9,zz+6],[fx+3.6,fy+9,zz+6],'#657078',.6);
      }
      a+=tube([hx-side*9,246,40+swing],[hx-side*15,255,46+swing],4.5);
      return {depth:-sx*sn+(22+swing)*c,markup:a};
    });
    let pelvis=volume(247,59,42,'M-44 0 Q-59 8-59 27 L-55 54 Q-41 69 0 74 Q41 69 55 54 L59 27 Q59 8 44 0Z');
    if(c>.08) {
      pelvis+=path([['M',-55,267,15],['Q',0,281,44,55,267,15]],'none','#080e12',1);
      pelvis+=path([['M',-55,294,19],['Q',-31,308,38,-5,309,42],['L',0,317,42],['L',5,309,42],['Q',31,308,38,55,294,19]],'none','#101619',1.3);
      pelvis+=line([0,291,43],[0,316,43],'#0a1013',.8);
    }
    for(const side of [-1,1]) {
      pelvis+=path([['M',side*60,259,0],['L',side*64,259,0],['L',side*64,312,0],['Q',side*59,318,2,side*55,323,3],['L',side*54,309,2],['Q',side*60,296,0,side*60,259,0]],'url(#rb-body)','#556269',.8);
      pelvis+=ell(side*61,275,0,4,8,'url(#rb-chrome)',6,'#28343b');
    }
    let body=volume(154,76,47,'M-55 0 Q-74 1-76 20 L-74 69 Q-72 84-56 90 Q0 97 56 90 Q72 84 74 69 L76 20 Q74 1 55 0Z');
    body+=ell(0,244,0,66,5,'url(#rb-body)',40,'#0b1216',.7);
    if(c>.09) {
      body+=path([['M',-22,166,44],['Q',-29,166,45,-29,174,45],['L',-29,229,46],['Q',-29,239,46,-20,239,46],['L',20,239,46],['Q',29,239,46,29,229,46],['L',29,174,45],['Q',29,166,45,22,166,44],['Z']],'#090f13','#656b68',2.2);
      body+=path([['M',-24,175,46],['Q',0,171,48,24,175,46],['L',24,190,47],['Q',0,194,48,-24,190,47],['Z']],'url(#rb-black)','#121a20',1.2);
      body+=line([-23,199,48],[23,199,48],'#3c3c32',.65);
      if(speech>.01) body+=line([-17,190,49],[17,190,49],'#dfae65',2,`opacity="${f(speech*.6)}" filter="url(#rb-lamp-glow)"`);
      for(const side of [-1,1]) {
        body+=ell(side*12.5,212,49,8.6,8.6,'url(#rb-chrome)',.2,'#838b8d',.7);
        body+=ell(side*12.5,212,49.2,6.1,6.1,side<0?'url(#rb-chrome)':'url(#rb-amber)',.2,'#657072',.5);
        for(let j=0;j<3;j++) {
          const angle=j*PI*2/3+t*mechanism*(side<0?.8:-.65);
          body+=ell(side*12.5+Math.cos(angle)*3.5,212+Math.sin(angle)*3.5,49.4,1.9,1.9,side<0?'#d0d3c8':'#bd9c67',.1,'none');
        }
        if(speech>.01) {const [gx,gy]=p(side*12.5,212,50);body+=`<ellipse cx="${gx}" cy="${gy}" rx="${f(radius(6.5,.2))}" ry="6.5" fill="${side<0?'#eef4df':'#ffc066'}" opacity="${f(speech*.7)}" filter="url(#rb-lamp-glow)"/>`;}
      }
      for(let j=0;j<4;j++) body+=path([['M',-22+j*13,226,48],['L',-18+j*13,226,48],['L',-18+j*13,235,48],['L',-22+j*13,235,48],['Z']],'#293134','#6d7168',.5);
    }
    // The dark tapered mechanism hood has a transparent rounded upper cap.
    const headW=radius(59,38),capW=radius(41,31),[hc,hy]=p(0,0);
    let head=`<path d="M${f(hc-headW)},147 Q${f(hc-headW+3)},96 ${f(hc-capW)},45 Q${hc},40 ${f(hc+capW)},45 Q${f(hc+headW-3)},96 ${f(hc+headW)},147 Q${hc},157 ${f(hc-headW)},147Z" fill="url(#rb-hood)" stroke="#626d72" stroke-width=".8"/>`;
    const cap=`M${f(hc-capW)},${f(hy+45)} C${f(hc-capW+9)},${f(hy+16)} ${f(hc-18)},${f(hy-1)} ${hc},${f(hy)} C${f(hc+18)},${f(hy-1)} ${f(hc+capW-9)},${f(hy+16)} ${f(hc+capW)},${f(hy+45)}Z`;
    head+=`<path d="${cap}" fill="url(#rb-glass)" stroke="#96a5ab" stroke-width="1" stroke-opacity=".8"/>`;
    head+=tube([0,44,-4],[0,20,-4],3.4,'url(#rb-chrome)');
    for(let j=0;j<6;j++) head+=line([-4.4,24+j*1.5,0],[4.4,24+j*1.5,0],'#8b918c',.8);
    head+=ell(0,15,-3,5.7,8,'url(#rb-bulb)',5.7,'#b7b9a7',.6)+line([0,20,1],[0,11,1],'#c2bca3',.8);
    if(speech>.01) {const [gx,gy]=p(0,15,0);head+=`<ellipse cx="${gx}" cy="${gy}" rx="5.6" ry="7.6" fill="#fff0bd" opacity="${f(speech*.85)}" filter="url(#rb-lamp-glow)"/>`;}
    for(const side of [-1,1]) {
      const [gx,gy]=p(side*14,35,1),ang=side*(22+Math.sin(t*5)*45*mechanism);
      head+=`<g transform="translate(${gx} ${gy}) rotate(${f(ang)})"><ellipse rx="8.7" ry="9.8" fill="none" stroke="#172024" stroke-width="1.1"/><ellipse rx="6.7" ry="8" fill="none" stroke="#172024" stroke-width=".9"/><ellipse rx="4.4" ry="6.1" fill="none" stroke="#172024" stroke-width=".9"/><ellipse rx="2.2" ry="4" fill="none" stroke="#273136" stroke-width=".8"/><path d="M-10 0H10 M0-10V10 M-6-7L6 7" stroke="#222b2e" stroke-width=".8"/><circle r="1.8" fill="#525c5c"/></g>`;
      head+=tube([side*5,43,-1],[side*15,38,0],1.6,'#20292c');
    }
    if(c>.10) {
      // These upper fins stay black. They are not the speaking lights.
      for(const side of [-1,1]) for(let j=0;j<4;j++) {const x=side*(19+j*4.2);head+=tube([x,47,31],[x+side*.5,63,34],1.55,'#080f14');head+=line([x-.7,48,33],[x-.7,61,36],'#586266',.65);}
      head+=path([['M',-7,50,33],['L',10,49,33],['L',10,51,33],['L',-7,52,33],['Z']],'#bbc1b9','#6d7673',.45);
      head+=line([-12,48,32],[-9,64,35],'#99a29d',1);
      // Six upright valves across one horizontal manifold, with register-driven relay travel.
      head+=tube([-31,72,34],[31,72,34],1.65,'url(#rb-chrome)');
      for(const [j,x] of [-29,-17,-6,6,17,29].entries()) {
        const relay=Math.sin(t*16+j*1.35)*mechanism*1.7;
        head+=ell(x,72,35,2.9,2.9,'url(#rb-amber)',2.9,'#747e73',.5);
        head+=tube([x,74,36],[x,81+relay,37],1.15,'url(#rb-chrome)');
        head+=ell(x,82+relay,37,2.25,2,'url(#rb-chrome)',2.25,'#8c978f',.4);
        head+=path([['M',x-2.7,87,36],['L',x-3.3,99,36],['Q',x,101,37,x+3.3,99,36],['L',x+2.7,87,36],['Z']],'url(#rb-ivory)','#adb5a0',.45);
        head+=tube([x,86,37],[x,97,38],.65,'#475454');
        head+=ell(x,88,38,1.65,2.5,'url(#rb-chrome)',1.65,'#626d68',.4);
        head+=path([['M',x,100,35],['L',x,103+(j%2)*2,35],['Q',x,105+(j%2)*2,35,x+(x<0?4:-4),105+(j%2)*2,35]],'none','#717b76',.75);
      }
      for(const side of [-1,1]) {head+=ell(side*35,91,31,3.3,5.3,'url(#rb-amber)',3.3,'#656359',.5);for(let j=0;j<5;j++) head+=line([side*29-2.4,105+j*1.4,34],[side*29+2.4,105+j*1.4,34],'#7a8988',.55);}
      for(let j=0;j<5;j++) head+=line([-9,103+j*1.1,37],[9,103+j*1.1,37],'#7c8582',.7);
    }
    // The swept lower arch exposes the horizontal speaking grille beneath the hood.
    const archScale=radius(67,41)/67,[ax,ay]=p(0,113,7);
    head+=`<path d="M-67 38 Q-67 13-42 5 Q0-11 42 5 Q67 13 67 38 Q0 46-67 38Z" transform="translate(${ax} ${ay}) scale(${f(archScale)} 1)" fill="#0a1116" stroke="#61696b" stroke-width="1"/>`;
    if(c>.10) {
      for(let j=0;j<8;j++) {
        const y=127+j*3.3,d=`M${pt(-36,y+1.9,27)} Q${pt(0,y-4,42)} ${pt(36,y+1.9,27)}`;
        head+=`<path d="${d}" fill="none" stroke="#586669" stroke-width="1.1" opacity=".65"/>`;
        if(speech>.01) {const intensity=clamp(speech*(.8+.2*Math.sin(t*10+j*.9)),0,1);head+=`<path d="${d}" fill="none" stroke="#40baff" stroke-width="4" opacity="${f(intensity*.65)}" filter="url(#rb-blue-glow)"/><path d="${d}" fill="none" stroke="#b5efff" stroke-width="1.2" opacity="${f(intensity)}"/>`;}
        for(const side of [-1,1]) head+=path([['M',side*38,y+2,27],['L',side*(50+j*1.5),y+2.7,17]],'none','#394449',.7);
      }
      head+=line([0,125,43],[0,153,43],'#243c42',.7);
    }
    head+=ell(0,154,0,69,3.6,'url(#rb-body)',42,'#151d22',1);
    head+=path([['M',-49,118,18],['Q',-43,72,24,-37,49,25]],'none','#d2e4e7',1.3,'opacity=".19"');
    head+=`<path d="M${f(hc-capW+8)},${f(hy+36)} Q${f(hc-24)},${f(hy+8)} ${f(hc-6)},${f(hy+4)}" fill="none" stroke="#edf5f3" stroke-width="2.1" opacity=".23"/>`;
    const scanner=side=>{
      let out=tube([side*44,67,0],[side*59,67,0],9);
      out+=ell(side*54,67,1,13,12,'url(#rb-black)',10);
      out+=ell(side*55,67,11,5.6,5.6,'url(#rb-chrome)',2.5,'#a1abad',.7);
      out+=ell(side*55,67,13,2.4,2.4,'#526e81',1.4,'#9fb1b9',.55);
      out+=ell(side*55-.6,66.3,14,.8,.8,'#c0d1d4',.6,'none');
      if(side<0) {
        out+=tube([-62,65,0],[-72,65,0],1.4,'url(#rb-chrome)');
        const [rx,ry]=p(-85,65,0),scan=.88+.12*Math.cos(t*1.5)*mechanism;
        out+=`<ellipse cx="${rx}" cy="${ry}" rx="${f(radius(12.8*scan,3.7))}" ry="11.2" fill="none" stroke="#a4aeb0" stroke-width="3"/><ellipse cx="${rx}" cy="${ry}" rx="${f(radius(12.8*scan,3.7))}" ry="11.2" fill="none" stroke="#e0e4df" stroke-width="1"/>`;
        out+=line([-58,62,6],[-61,43,4],'#bbc4c5',.85)+line([-53,61,7],[-48,42,3],'#9eabad',.75);
      } else {
        out+=tube([65,59,0],[65,41,0],1.1,'url(#rb-chrome)');
        const [rx,ry]=p(65,29,0),scan=1-.35*mechanism*(1+Math.sin(t*1.7))*.5;
        out+=`<ellipse cx="${rx}" cy="${ry}" rx="${f(radius(6.6*scan,3))}" ry="13" fill="none" stroke="#97a0a4" stroke-width="3"/><ellipse cx="${rx}" cy="${ry}" rx="${f(radius(6.6*scan,3))}" ry="13" fill="none" stroke="#d9ddda" stroke-width=".8"/>`;
        out+=line([59,67,8],[79,62,2],'#b4bec0',.8)+line([59,69,8],[79,73,2],'#a7b4b8',.75);
      }
      for(let j=0;j<6;j++) out+=line([side*(54+j*.8),82+j*4.5,2],[side*(60+j*.8),80+j*4.5,2],'#94a2a6',.75);
      return {depth:-side*55*sn,markup:out};
    };
    const scanners=[-1,1].map(scanner).sort((a,b)=>a.depth-b.depth),legs=[-1,1].map(leg).sort((a,b)=>a.depth-b.depth);
    const backArms=arms.filter(a=>a.depth<-5).map(a=>a.markup).join('');
    const frontArms=arms.filter(a=>a.depth>=-5).sort((a,b)=>a.depth-b.depth).map(a=>a.markup).join('');
    const shift=this.offset*motion;
    this.svg.innerHTML=defs+`<ellipse cx="${shift}" cy="488" rx="92" ry="11" fill="#07151c" opacity=".3" filter="url(#rb-shadow)"/><g transform="translate(${shift} 0) translate(0 480) scale(${this.zoom}) translate(0 -480)">${backArms}${legs.map(l=>l.markup).join('')}${pelvis}${body}${frontArms}${scanners[0].markup}${head}${scanners[1].markup}</g>`;
  }
}

return RobbyRenderer;})();
const renderVehicle=(()=>{
/** Original projected SVG landcar study, drawn from the supplied reference photographs.
 * Local x is lateral; +z is the openable front; Robby stands at (0, 480, 0).
 * Insert back before Robby and front after him. No image mirroring or screen rotation.
 */
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const f=n=>Math.round(n*1000)/1000;
function projectVehiclePoint(x,y,z,heading=0,pitch=.5) {
  const c=Math.cos(heading),s=Math.sin(heading),depth=-x*s+z*c;
  return [x*c+z*s,y+depth*pitch,depth];
}
function renderVehicle({gate=0,wheel=0,heading=0,steering=0,pitch=.5,robotDepth=0}={}) {
  const opened=clamp(finite(gate),0,1),h=finite(heading),tilt=clamp(finite(pitch,.5),0,.8);
  const spin=finite(wheel),steer=clamp(finite(steering),-.7,.7),plane=finite(robotDepth),surfaces=[];
  const hc=Math.cos(h),hs=Math.sin(h),depth=p=>-p[0]*hs+p[2]*hc;
  const project=p=>{const d=depth(p);return [p[0]*hc+p[2]*hs,p[1]+d*tilt,d];};
  const relativeDepth=p=>{const d=depth(p)-plane;return Math.abs(d)<1e-7?0:d;};
  const coords=p=>`${f(p[0]*hc+p[2]*hs)},${f(p[1]+depth(p)*tilt)}`;
  const defs=`
  <linearGradient id="rv-silver" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#d8e1df"/><stop offset=".25" stop-color="#94a5aa"/><stop offset=".64" stop-color="#6b818c"/><stop offset="1" stop-color="#3c5665"/></linearGradient>
  <linearGradient id="rv-deck" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c9d5d3"/><stop offset=".45" stop-color="#83989f"/><stop offset="1" stop-color="#465f6c"/></linearGradient>
  <linearGradient id="rv-rib" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0f5e9"/><stop offset=".35" stop-color="#c5d4d3"/><stop offset=".75" stop-color="#80979f"/><stop offset="1" stop-color="#c5d5d6"/></linearGradient>
  <linearGradient id="rv-glass" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#e7ffff" stop-opacity=".36"/><stop offset=".22" stop-color="#c9edf4" stop-opacity=".07"/><stop offset=".7" stop-color="#efffff" stop-opacity=".025"/><stop offset="1" stop-color="#d7f6fa" stop-opacity=".24"/></linearGradient>
  <radialGradient id="rv-tire"><stop stop-color="#65777e"/><stop offset=".43" stop-color="#293e48"/><stop offset=".67" stop-color="#13252e"/><stop offset="1" stop-color="#061219"/></radialGradient>`;
  // Clip every surface at the driver's depth so an orbit never puts the whole car
  // on one side of him. Intersections are interpolated in the car's local space.
  const clip=(points,side)=>{
    if(side<0&&points.every(p=>relativeDepth(p)===0))return [];
    const out=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],da=relativeDepth(a)*side,db=relativeDepth(b)*side;
      if(da>=0) out.push(a);
      if((da<0&&db>0)||(da>0&&db<0)) {
        const k=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*k));
      }
    }
    return out;
  };
  const push=(points,markup,side)=>surfaces.push({depth:points.reduce((a,p)=>a+depth(p),0)/points.length,side,markup});
  const polygon=(points,fill,stroke='#8ca3ad',width=.8,attrs='')=>{
    for(const side of [-1,1]) {
      const pp=clip(points,side);if(pp.length<3)continue;
      const projected=pp.map(project),area=Math.abs(projected.reduce((a,p,i)=>{const q=projected[(i+1)%projected.length];return a+p[0]*q[1]-q[0]*p[1];},0));
      if(area<.03)continue;
      push(pp,`<path d="M${pp.map(coords).join(' L')}Z" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" ${attrs}/>`,side);
    }
  };
  const segment=(a,b,color='url(#rv-rib)',width=2,attrs='')=>{
    const da=relativeDepth(a),db=relativeDepth(b);
    if(da*db<0) {const k=da/(da-db),mid=a.map((v,j)=>v+(b[j]-v)*k);segment(a,mid,color,width,attrs);segment(mid,b,color,width,attrs);return;}
    push([a,b],`<path d="M${coords(a)} L${coords(b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${attrs}/>`,da+db>=0?1:-1);
  };
  const lineStrip=(points,color,width,attrs='')=>{
    // A rib remains one path on each side of the driver, rather than adding a
    // separate DOM element for every short section of its projected curve.
    let run=[],runSide=0;
    const flush=()=>{if(run.length>1)push(run,`<path d="M${run.map(coords).join(' L')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`,runSide);run=[];};
    const append=(a,b)=>{
      const side=relativeDepth(a)+relativeDepth(b)>=0?1:-1;
      if(run.length&&side!==runSide)flush();
      if(!run.length){run=[a];runSide=side;}run.push(b);
    };
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],da=relativeDepth(a),db=relativeDepth(b);
      if(da*db<0){const k=da/(da-db),mid=a.map((v,j)=>v+(b[j]-v)*k);append(a,mid);append(mid,b);}else append(a,b);
    }
    flush();
  };
  const box=(x1,x2,y1,y2,z1,z2,fill='url(#rv-silver)',attrs='')=>{
    const a=[x1,y1,z1],b=[x2,y1,z1],c=[x2,y1,z2],d=[x1,y1,z2],e=[x1,y2,z1],g=[x2,y2,z1],j=[x2,y2,z2],k=[x1,y2,z2];
    for(const face of [[e,g,j,k],[a,e,g,b],[b,g,j,c],[c,j,k,d],[d,k,e,a]])polygon(face,fill,'#617d89',.8,attrs);
    polygon([a,b,c,d],'url(#rv-deck)','#c1cfcc',1,attrs);
  };
  const circlePoints=(center,ax,ay,r,n=24)=>Array.from({length:n},(_,i)=>{const a=i*2*Math.PI/n;return center.map((v,j)=>v+r*(Math.cos(a)*ax[j]+Math.sin(a)*ay[j]));});
  // Four volumetric tires: axle direction follows the steering rack on the front pair.
  for(const z of [-210,37])for(const side of [-1,1]) {
    const turn=z>0?steer:0,cs=Math.cos(turn),ss=Math.sin(turn),center=[side*91,457,z],ax=[cs,0,-ss],radial=[ss,0,cs],vertical=[0,1,0];
    const outer=center.map((v,j)=>v+ax[j]*side*8),inner=center.map((v,j)=>v-ax[j]*side*7);
    const op=circlePoints(outer,radial,vertical,23),ip=circlePoints(inner,radial,vertical,23);
    for(let j=0;j<24;j++)polygon([ip[j],op[j],op[(j+1)%24],ip[(j+1)%24]],'#15262f','#263c46',.4,'class="vehicle-wheel-tread"');
    polygon(ip,'#152832','#0a1720',1,'class="vehicle-wheel"');
    polygon(op,'url(#rv-tire)','#061017',1.5,`class="vehicle-wheel" data-axle="${z>0?'front':'rear'}" data-steering="${f(turn)}"`);
    polygon(circlePoints(outer,radial,vertical,12),'#536b77','#839ba2',.8,'class="vehicle-wheel-hub"');
    for(let j=0;j<5;j++) {
      const a=spin+j*2*Math.PI/5,end=outer.map((v,k)=>v+10*(Math.cos(a)*radial[k]+Math.sin(a)*vertical[k]));
      segment(outer,end,'#c0d1d0',1.1,`class="vehicle-wheel-spoke" data-wheel="${f(spin)}"`);
    }
    polygon(circlePoints(outer,radial,vertical,3,12),'#c6d5d0','#5b737f',.5);
  }
  // Rear passenger deck is raised; the front driver's footwell is at Robby's soles.
  box(-87,87,430,459,-252,-82,'url(#rv-silver)','class="vehicle-chassis"');
  box(-87,87,448,477,-82,-53,'url(#rv-silver)','class="vehicle-chassis vehicle-step"');
  const floor=[[-88,476,-65],[88,476,-65],...Array.from({length:19},(_,i)=>{const a=-Math.PI/2+i*Math.PI/18;return [90*Math.sin(a),476,90*Math.cos(a)];}).reverse()];
  polygon(floor,'url(#rv-deck)','#c6d3d0',1.4,'class="vehicle-footwell"');
  lineStrip(floor.concat([floor[0]]),'#526f7c',3,'class="vehicle-footwell-rim"');
  // Low sculpted side panels keep the long body legible in profile and from the rear.
  for(const side of [-1,1]) {
    const x=side*89;
    polygon([[x,431,-248],[x,404,-238],[x,403,-213],[x,419,-177],[x,424,-97],[x,451,-65],[x,465,-65],[x,456,-248]],'url(#rv-silver)','#8ba2aa',1.2,'class="vehicle-side"');
    lineStrip([[x,432,-247],[x,411,-234],[x,411,-215],[x,427,-180],[x,432,-98],[x,455,-66]],'#d1ded9',2,'class="vehicle-side-trim"');
    segment([x,450,-246],[x,456,-68],'#4d6c7c',1.2);
    box(side<0?-102:80,side<0?-80:102,430,441,12,61,'url(#rv-silver)','class="vehicle-front-fender"');
  }
  box(-87,87,416,451,-255,-249,'url(#rv-silver)','class="vehicle-rear-panel"');
  segment([-83,418,-255],[83,418,-255],'#d8e4dd',2.2);
  for(const x of [-68,68])polygon([[x-7,427,-255.5],[x+7,427,-255.5],[x+7,435,-255.5],[x-7,435,-255.5]],'#64432d','#b89b6c',.8,'class="vehicle-rear-reflector"');
  // Paired seats have solid cushions, transparent backs and slim supports.
  for(const x of [-44,44]) {
    box(x-23,x+23,399,407,-208,-157,'url(#rv-silver)','class="vehicle-seat"');
    for(const dx of [-16,16])segment([x+dx,407,-184],[x+dx,430,-195],'#aac0c4',2,'class="vehicle-seat-support"');
    polygon([[x-25,399,-208],[x-25,355,-224],[x-19,350,-226],[x+19,350,-226],[x+25,355,-224],[x+25,399,-208]],'url(#rv-glass)','#bfd6d9',1.1,'class="vehicle-seat-back"');
    segment([x-20,392,-211],[x-20,359,-223],'#d3e6e6',1,'opacity=".6"');
    // Each windshield stands ahead of its passenger, sweeping back at the crown.
    const shield=[[x-29,409,-126],[x-34,388,-127],[x-32,357,-132],[x-23,334,-140],[x-10,322,-145],[x+6,322,-145],[x+23,334,-140],[x+32,357,-132],[x+34,388,-127],[x+29,409,-126]];
    polygon(shield,'url(#rv-glass)','#cce2e2',1.2,'class="vehicle-windscreen"');
    lineStrip([[x-26,385,-128],[x-24,361,-133],[x-17,343,-139],[x-8,334,-143]],'#e7f6f2',1.8,'opacity=".62" class="vehicle-windscreen-highlight"');
    segment([x-26,410,-126],[x-26,430,-125],'#9eb7c1',2.5);
    segment([x+26,410,-126],[x+26,430,-125],'#9eb7c1',2.5);
    segment([x-28,407,-126],[x+28,407,-126],'#526d7d',2.3);
  }
  // Two tiers of open silver ribs. Rear halves stay fixed; front quarter leaves
  // swing in local 3D about the same side hinge axes, leaving a clear +z entrance.
  const swingPoint=(p,side)=>{
    const a=side*opened*1.75,dx=p[0]-side*92,cs=Math.cos(a),ss=Math.sin(a);
    return [side*92+dx*cs+p[2]*ss,p[1],-dx*ss+p[2]*cs];
  };
  for(const upper of [false,true]) {
    const r=upper?70:90,start=upper?260:367,end=upper?353:470,count=upper?16:18;
    for(let j=0;j<count;j++) {
      const y=start+(end-start)*j/(count-1),attrs=`class="vehicle-grille vehicle-grille-${upper?'upper':'lower'}"`;
      const rear=Array.from({length:19},(_,i)=>{const a=Math.PI/2+i*Math.PI/18;return [r*Math.sin(a),y,r*Math.cos(a)];});
      lineStrip(rear,'#3b5663',upper?3:3.5,attrs);
      lineStrip(rear,'url(#rv-rib)',upper?1.9:2.3,attrs);
      for(const side of [-1,1]) {
        const leaf=Array.from({length:10},(_,i)=>{const a=.014+(Math.PI/2-.014)*i/9;return swingPoint([side*r*Math.sin(a),y,r*Math.cos(a)],side);});
        const leafAttrs=`class="vehicle-grille vehicle-grille-${upper?'upper':'lower'} vehicle-gate-leaf" data-side="${side}" data-gate="${f(opened)}"`;
        lineStrip(leaf,'#425d69',upper?3.1:3.6,leafAttrs);
        lineStrip(leaf,'url(#rv-rib)',upper?2:2.5,leafAttrs);
      }
    }
    for(const side of [-1,1]) {
      const support=[swingPoint([side*r*.06,start,r*.998],side),swingPoint([side*r*.06,end,r*.998],side)];
      segment(...support,'#c7d7d5',upper?3:3.4,`class="vehicle-gate-support" data-side="${side}"`);
      segment([side*r,start,0],[side*92,start,0],'#b5c9cb',2.4);
      segment([side*r,end,0],[side*92,end,0],'#b5c9cb',2.4);
    }
  }
  for(const side of [-1,1]) {
    segment([side*92,258,0],[side*92,474,0],'#b2c7cb',3,'class="vehicle-gate-hinge"');
    segment(swingPoint([side*4.2,353,69.85],side),swingPoint([side*5.4,367,89.82],side),'#b7cbd0',2.8,'class="vehicle-gate-link"');
  }
  surfaces.sort((a,b)=>a.depth-b.depth);
  const shadowOutline=[[-110,482,-267],[110,482,-267],[115,482,35],[83,482,107],[-83,482,107],[-115,482,35]];
  const shadow=`<path class="vehicle-shadow" d="M${shadowOutline.map(coords).join(' L')}Z" fill="#06131a" opacity=".19"/>`;
  const layer=side=>surfaces.filter(s=>s.side===side).map(s=>`<path data-surface-depth="${f(s.depth)}" ${s.markup.slice(6)}`).join('');
  return {defs,back:`<g class="vehicle-back" aria-hidden="true" data-heading="${f(h)}">${shadow}${layer(-1)}</g>`,front:`<g class="vehicle-front" aria-hidden="true" data-gate="${f(opened)}" data-heading="${f(h)}">${layer(1)}</g>`};
}

return renderVehicle;})();
const {routeSample,routeLength,routeStartDistance,routeGuidePath,projectLocal,scenePosition,VEHICLE_SCALE,GROUND_PITCH}=(()=>{
/** Ground-plane route in world units. Distance, not angle, is the clock. */
const VEHICLE_SCALE=.7;
const GROUND_PITCH=.5;
const WIDTH=390,DEPTH=280,CORNER=260,STEPS=1024,HALF_PI=Math.PI/2;
const smooth=t=>t*t*(3-2*t);
const curve=[{x:0,z:0}];
for(let i=1;i<=STEPS;i++){
  const heading=HALF_PI*smooth((i-.5)/STEPS),last=curve[i-1],ds=CORNER/STEPS;
  curve.push({x:last.x+Math.sin(heading)*ds,z:last.z+Math.cos(heading)*ds});
}
const inset=(curve[STEPS].x+curve[STEPS].z)/2;
const horizontal=2*(WIDTH-inset),vertical=2*(DEPTH-inset);
const segments=[];
let distance=0,x=-WIDTH,z=-DEPTH+inset;
for(let side=0;side<4;side++){
  const heading=side*HALF_PI,length=side%2?horizontal:vertical;
  segments.push({start:distance,length,x,z,heading,corner:false});
  x+=Math.sin(heading)*length;z+=Math.cos(heading)*length;distance+=length;
  segments.push({start:distance,length:CORNER,x,z,heading,corner:true});
  x+=inset*(Math.cos(heading)+Math.sin(heading));z+=inset*(Math.cos(heading)-Math.sin(heading));distance+=CORNER;
}
const routeLength=distance;
// Start at a three-quarter view on the lower-left bend, facing into the field.
const routeStartDistance=vertical+CORNER*.5;

function routeSample(distance=0){
  const wrapped=((Number(distance)||0)%routeLength+routeLength)%routeLength;
  const segment=segments.find(s=>wrapped<s.start+s.length)||segments.at(-1);
  const at=wrapped-segment.start;
  if(!segment.corner)return {x:segment.x+Math.sin(segment.heading)*at,z:segment.z+Math.cos(segment.heading)*at,
    heading:segment.heading,dx:Math.sin(segment.heading),dz:Math.cos(segment.heading),curvature:0,distance:wrapped};
  const u=at/CORNER,index=Math.min(STEPS-1,Math.floor(u*STEPS)),fraction=u*STEPS-index;
  const a=curve[index],b=curve[index+1],cx=a.x+(b.x-a.x)*fraction,cz=a.z+(b.z-a.z)*fraction;
  const c=Math.cos(segment.heading),s=Math.sin(segment.heading),heading=segment.heading+HALF_PI*smooth(u);
  return {x:segment.x+cx*c+cz*s,z:segment.z-cx*s+cz*c,heading,dx:Math.sin(heading),dz:Math.cos(heading),
    curvature:HALF_PI*6*u*(1-u)/CORNER,distance:wrapped};
}

function projectLocal(x,z,heading,pitch=GROUND_PITCH){
  const c=Math.cos(heading),s=Math.sin(heading),depth=-x*s+z*c;
  return {x:x*c+z*s,y:depth*pitch,depth};
}

function scenePosition(sample){
  return {x:sample.x,y:480+sample.z*GROUND_PITCH-480*VEHICLE_SCALE,scale:VEHICLE_SCALE};
}

function routeGuidePath(){
  const count=320,points=[];
  for(let i=0;i<count;i++){
    const p=routeSample(routeLength*i/count);points.push((i?'L':'M')+p.x.toFixed(2)+' '+(480+p.z*GROUND_PITCH).toFixed(2));
  }
  return points.join(' ')+' Z';
}

return {routeSample,routeLength,routeStartDistance,routeGuidePath,projectLocal,scenePosition,VEHICLE_SCALE,GROUND_PITCH};})();
const RobbyRobot=(()=>{




const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;
const yawDelta=(a,b)=>((b-a+540)%360)-180;
const OUTSIDE={x:0,depth:170,yaw:0};
const WHEEL_RADIUS=25*VEHICLE_SCALE,CRUISE_SPEED=150,ACCELERATION=180,GROUND_PATH=routeGuidePath();

class RobbyRobot extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML='<style>:host{display:block;width:100%;height:100%;min-height:300px;touch-action:pan-y}svg{width:100%;height:100%;overflow:visible;display:block;cursor:grab}svg:active{cursor:grabbing}:host([hidden]){display:none}</style><svg role="img" aria-label="Animated Robby the Robot with transparent dome, blue voice tubes and articulated legs" xmlns="http://www.w3.org/2000/svg"></svg>';
    this.svg=this.shadowRoot.querySelector('svg');this.controller=new PerformanceController();this.renderer=new RobbyRenderer(this.svg);
    this.vehicleTime=null;this.vehicleAction=null;this.angle=-12;this.speed=1;this.zoom=1;
    this._tick=this._tick.bind(this);this._change=()=>{this._reduceVehicle();this._emit()};
    this.controller.addEventListener('change',this._change);
    this._visibility=()=>{if(document.hidden)this.stop();this.last=0;};
    this.addEventListener('keydown',e=>{if(e.key==='Escape'){this.stop();e.preventDefault()}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){this.face(this.angle+(e.key==='ArrowLeft'?-15:15));e.preventDefault();}});
    this._drag=null;this.svg.addEventListener('pointerdown',e=>{this._drag={x:e.clientX,angle:this.angle,id:e.pointerId};this.svg.setPointerCapture(e.pointerId)});
    this.svg.addEventListener('pointermove',e=>{if(this._drag)this.face(this._drag.angle+(e.clientX-this._drag.x)*.55)});
    const end=()=>{this._drag=null};this.svg.addEventListener('pointerup',end);this.svg.addEventListener('pointercancel',end);
  }
  connectedCallback(){if(this._disposed){this.controller=new PerformanceController();this.controller.addEventListener('change',this._change);if(this.clipUrl)this.controller.setClip(this.clipUrl,this.clipCaption);this._disposed=false}this.setAttribute('tabindex','0');this.setAttribute('aria-label','Robby viewer. Drag or use left and right arrows to turn. Escape stops the performance.');document.addEventListener('visibilitychange',this._visibility);this.last=0;cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(this._tick)}
  disconnectedCallback(){cancelAnimationFrame(this.raf);document.removeEventListener('visibilitychange',this._visibility);this.controller.removeEventListener('change',this._change);this.controller.destroy();this._clearVehicle();this._disposed=true}
  destroy(){this.remove();if(!this._disposed)this.disconnectedCallback()}
  _clearVehicle(){this.vehicleTime=null;this.vehicleAction=null;this._vehiclePose=null;this._exit=null;this._outsideWalk=false;this._vehicleOutside=false;this._parkWalkTime=0;this._wheelDistance=0;this._driveSpeed=0;this._vehicleRenderKey=null}
  _phase(){
    if(!this.vehicleAction)return null;
    if(this.vehicleAction==='parked')return this._outsideWalk&&!this.controller.state.reducedMotion?'walking outside':'parked';
    if(this.vehicleAction==='exit'){
      const e=this._exit;
      return e.elapsed<e.openFor?'opening for exit':e.elapsed<e.openFor+e.turnFor?'turning outward':'walking out';
    }
    if(this.controller.state.reducedMotion)return 'parked';
    const v=this.vehicleTime;
    return v<1.4?'opening gate':v<4.4?'boarding':v<5.3?'turning into position':v<6.7?'closing gate':'driving';
  }
  _emit(){this._lastVehiclePhase=this._phase();this.dispatchEvent(new CustomEvent('robotstatechange',{detail:this.debugState(),bubbles:true}))}
  debugState(){
    const p=this._vehiclePose;
    const offset=p?projectLocal(p.x,p.depth,p.heading):null;
    return {...this.controller.state,vehicleAction:this.vehicleAction,vehiclePhase:this._phase(),vehicleElapsed:this.vehicleTime,
      vehiclePosition:p?{...p.position}:null,vehicleWorldPosition:p?{...p.world}:null,vehicleGate:p?.gate??null,vehicleWheel:p?.wheel??null,
      vehiclePathAngle:p?.heading??null,vehicleHeading:p?.heading??null,vehicleSteering:p?.steering??null,
      vehicleDistance:p?.routeDistance??null,vehicleSpeed:p?(this._driveSpeed||0)*this.speed:0,
      robotPosition:p?{x:p.x,depth:p.depth,yaw:p.yaw,heading:p.heading+p.yaw*Math.PI/180}:null,
      robotGroundPosition:p?{x:p.world.x+offset.x*VEHICLE_SCALE,z:p.world.z+offset.depth*VEHICLE_SCALE}:null,vehicleOutside:!!this._vehicleOutside,
      angle:this.angle,speed:this.speed,zoom:this.zoom};
  }
  perform(mode){
    if(mode==='walk'&&this.vehicleAction){this._startExit();return}
    if(mode==='drive'){this.drive();return}
    this._clearVehicle();this.controller.setMode(mode);this._emit();
  }
  walk(){this.perform('walk')} talk(){this.perform('talk')} mechanisms(){this.perform('lights')} showcase(){this.perform('showcase')}
  drive(){
    if(this.vehicleAction==='drive')return;
    const previous=this._vehiclePose;
    this._driveFrom=previous?{x:previous.x,depth:previous.depth,yaw:previous.yaw,gate:previous.gate,inFront:previous.inFront}:{x:0,depth:170,yaw:180,gate:0,inFront:true};
    this._routeDistance=previous?.routeDistance??routeStartDistance;this._wheelDistance=(previous?.wheel||0)*WHEEL_RADIUS;this._driveSpeed=0;
    const aboard=previous&&Math.hypot(previous.x,previous.depth)<.001&&previous.gate<.001&&Math.abs(yawDelta(previous.yaw,0))<.01;
    this.vehicleTime=aboard||(!previous&&this.controller.state.reducedMotion)?6.7:0;this.vehicleAction='drive';this._exit=null;this._outsideWalk=false;this._vehicleOutside=false;
    this._vehiclePose=this._drivePose(this.vehicleTime);this.controller.setMode('drive');this._reduceVehicle();this._emit();
  }
  _drivePose(v){
    const from=this._driveFrom,board=ease((v-1.4)/3),road=routeSample(this._routeDistance);
    return {position:scenePosition(road),world:{x:road.x,z:road.z},routeDistance:this._routeDistance,heading:road.heading,
      steering:Math.atan(110*road.curvature),wheel:(this._wheelDistance||0)/WHEEL_RADIUS,
      gate:v<1.4?mix(from.gate,1,ease(v/1.4)):v<5.3?1:1-ease((v-5.3)/1.4),
      x:from.x*(1-board),depth:from.depth*(1-board),
      yaw:v<1.4?from.yaw+yawDelta(from.yaw,180)*ease(v/1.4):180*(1-ease((v-4.4)/.9)),
      inFront:v<1.4?from.inFront:v<4.4,walkWeight:v>=1.4&&v<4.4?.8:0};
  }
  _startExit(){
    if(this.vehicleAction==='exit')return;
    if(this.vehicleAction==='parked'&&this._vehicleOutside){
      if(!this._outsideWalk){this._outsideWalk=true;this._parkWalkOrigin={x:this._vehiclePose.x,depth:this._vehiclePose.depth};this._parkWalkTime=0;this.controller.setMode('walk');this._emit()}
      return;
    }
    const p=this._vehiclePose;
    this._exit={elapsed:0,from:{x:p.x,depth:p.depth,yaw:p.yaw,gate:p.gate},
      openFor:1.4*(1-p.gate),turnFor:Math.abs(yawDelta(p.yaw,OUTSIDE.yaw))/180*.9,
      walkFor:Math.max(.8,2.6*Math.hypot(OUTSIDE.x-p.x,OUTSIDE.depth-p.depth)/Math.hypot(OUTSIDE.x,OUTSIDE.depth))};
    this.vehicleAction='exit';this._outsideWalk=false;this._driveSpeed=0;
    // Capture the displayed vehicle/wheel pose before changing performance.
    this.controller.setMode('walk');this._reduceVehicle();this._emit();
  }
  _finishExit(){
    Object.assign(this._vehiclePose,OUTSIDE,{gate:1,inFront:true,walkWeight:0});
    this.vehicleAction='parked';this._vehicleOutside=true;this._outsideWalk=true;
    this._parkWalkTime=0;this._parkWalkOrigin={x:OUTSIDE.x,depth:OUTSIDE.depth};this._exit=null;
  }
  _reduceVehicle(){
    if(!this.controller.state.reducedMotion||!this._vehiclePose)return;
    if(this.vehicleAction==='exit')this._finishExit();
    else if(this.vehicleAction==='drive')this._driveSpeed=0;
  }
  stop(){
    // Freeze an interrupted gate/exit in place; do not remove the parked car.
    if(this.vehicleAction){this.vehicleAction='parked';this._exit=null;this._outsideWalk=false;this._vehiclePose.walkWeight=0;this._driveSpeed=0}
    this.controller.stop();this.renderer.offset=0;this._emit();
  }
  show(){this.hidden=false;this._emit()} hide(){this.stop();this.hidden=true;this._emit()}
  face(degrees){this.angle=Math.max(-180,Math.min(180,degrees));this.renderer.yaw=this.angle*Math.PI/180;this._emit()}
  setMotion(enabled){this.controller.setReducedMotion(!enabled);this._reduceVehicle();this._emit()}
  setVoice(enabled){this.controller.setMuted(!enabled);this._emit()}
  setClip(url,caption){this.clipUrl=url;this.clipCaption=caption;this.controller.setClip(url,caption)}
  setSpeed(speed){this.speed=Math.max(.4,Math.min(1.5,Number(speed)));this._emit()}
  setZoom(zoom){this.zoom=Math.max(.65,Math.min(1.15,Number(zoom)));this._emit()}
  _stepVehicle(step,s){
    const p=this._vehiclePose;
    if(s.reducedMotion){this._reduceVehicle();return}
    if(this.vehicleAction==='drive'){
      const before=this.vehicleTime;this.vehicleTime+=step;
      const moving=Math.max(0,this.vehicleTime-6.7)-Math.max(0,before-6.7);
      const accelerating=Math.min(moving,(CRUISE_SPEED-this._driveSpeed)/ACCELERATION);
      const traveled=this._driveSpeed*accelerating+.5*ACCELERATION*accelerating*accelerating+CRUISE_SPEED*(moving-accelerating);
      this._driveSpeed=Math.min(CRUISE_SPEED,this._driveSpeed+ACCELERATION*moving);
      this._routeDistance+=traveled;this._wheelDistance+=traveled;this._vehiclePose=this._drivePose(this.vehicleTime);
    }else if(this.vehicleAction==='exit'){
      const e=this._exit;e.elapsed+=step;
      p.gate=e.openFor?mix(e.from.gate,1,ease(e.elapsed/e.openFor)):1;p.walkWeight=0;
      const turning=e.elapsed-e.openFor;
      if(turning>=0)p.yaw=e.from.yaw+yawDelta(e.from.yaw,OUTSIDE.yaw)*(e.turnFor?ease(turning/e.turnFor):1);
      const walking=turning-e.turnFor;
      if(walking>=0){
        const fraction=ease(walking/e.walkFor);p.x=mix(e.from.x,OUTSIDE.x,fraction);p.depth=mix(e.from.depth,OUTSIDE.depth,fraction);p.walkWeight=.8;p.inFront=true;
        if(walking>=e.walkFor)this._finishExit();
      }
    }else if(this._outsideWalk){
      this._parkWalkTime+=step;const a=this._parkWalkTime*.65,origin=this._parkWalkOrigin;
      p.x=origin.x+38*Math.sin(a);p.depth=origin.depth+9*(1-Math.cos(a));
      const heading=Math.atan2(38*Math.cos(a),9*Math.sin(a))*180/Math.PI;
      p.yaw+=yawDelta(p.yaw,heading)*Math.min(1,step*3);p.walkWeight=s.walkWeight;
    }
  }
  _renderVehicle(s){
    const p=this._vehiclePose;
    const walking=s.reducedMotion?0:p.walkWeight,phase=this.vehicleAction==='drive'?this.vehicleTime*5:s.phase;
    const key=[p.position.x,p.position.y,p.position.scale,p.heading,p.steering,p.wheel,p.gate,p.x,p.depth,p.yaw,walking,walking?phase:0].join('|');
    if(key===this._vehicleRenderKey)return;
    this.renderer.zoom=1;this.renderer.offset=0;this.renderer.groundPitch=GROUND_PITCH;this.renderer.yaw=p.heading+p.yaw*Math.PI/180;
    this.renderer.render({...s,phase,walkWeight:walking,
      lightLevel:0,speechLevel:0,registerLevel:0,speaking:false});
    const offset=projectLocal(p.x,p.depth,p.heading);
    const vehicle=renderVehicle({gate:p.gate,wheel:p.wheel,heading:p.heading,steering:p.steering,pitch:GROUND_PITCH,robotDepth:offset.depth}),robot=this.svg.innerHTML;
    this.svg.setAttribute('viewBox','-620 -90 1240 850');
    const robotMarkup='<g class="boarding-robot" data-depth="'+p.depth.toFixed(2)+'" data-camera-depth="'+offset.depth.toFixed(2)+'" transform="translate('+offset.x+' '+offset.y+')">'+robot+'</g>';
    const loop='<g class="vehicle-ground-loop" aria-hidden="true"><path d="'+GROUND_PATH+'" fill="#94b6b4" fill-opacity=".035" stroke="#d8e2c9" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="5 9"/></g>';
    this.svg.innerHTML='<defs>'+(vehicle.defs||'')+'</defs>'+loop+'<g transform="translate('+p.position.x+' '+p.position.y+') scale('+p.position.scale+')">'+vehicle.back+robotMarkup+vehicle.front+'</g>';
    this._vehicleRenderKey=key;
  }
  _tick(now){
    // Advance by real visible elapsed time; slow rendering must not slow the car.
    // Visibility handling resets last after stopping the scene on a hidden tab.
    const dt=this.last?Math.max(0,(now-this.last)/1000):0;this.last=now;
    const raw=this.controller.update(dt,this.speed);
    if(!raw.reducedMotion&&(raw.mode!=='idle'||this.vehicleAction==='drive'||this.vehicleAction==='exit'))this.animationTime=(this.animationTime||0)+dt*this.speed;
    const s={...raw,time:this.animationTime||0};this.renderer.zoom=this.zoom;this.renderer.offset=(s.walkWeight||0)*Math.sin((s.time||0)*.42)*40;
    if(this.vehicleAction){this._stepVehicle(dt*this.speed,s);this._renderVehicle(s);if(this._phase()!==this._lastVehiclePhase)this._emit()}
    else{this.renderer.groundPitch=null;this.renderer.yaw=this.angle*Math.PI/180;this.svg.setAttribute('viewBox','-300 -24 600 554');this.renderer.render(s)}
    this.raf=requestAnimationFrame(this._tick);
  }
}
if(!customElements.get('robby-robot'))customElements.define('robby-robot',RobbyRobot);

return RobbyRobot;})();
})();