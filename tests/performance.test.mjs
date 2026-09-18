import assert from 'node:assert/strict';
import test from 'node:test';
import { PerformanceController } from '../src/performance.js';

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

async function withBrowserMocks(run, { rejectPlayback = false, gesture = true, webAudio = false } = {}) {
  const keys = ['document', 'Audio', 'navigator', 'AudioContext'];
  const previous = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const document = new EventTarget();
  document.hidden = false;
  const instances = [];
  const pending = [];
  const oscillators = [];
  class MockAudioContext {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
    }
    createOscillator() {
      const oscillator = {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        starts: [], stops: [], disconnected: false,
        start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); },
        connect() {}, disconnect() { this.disconnected = true; },
      };
      oscillators.push(oscillator);
      return oscillator;
    }
    createMediaElementSource() { throw new Error('Use direct mock media playback'); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  class MockAudio extends EventTarget {
    constructor() {
      super();
      this.paused = true;
      this.currentTime = 0;
      this.playbackRate = 1;
      this.duration = 4;
      instances.push(this);
    }
    play() {
      if (rejectPlayback) return Promise.reject(new Error('Playback blocked'));
      this.paused = false;
      return new Promise(resolve => pending.push(resolve));
    }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
    finish() { this.paused = true; this.dispatchEvent(new Event('ended')); }
  }
  const values = { document, Audio: MockAudio, navigator: { userActivation: { isActive: gesture } }, AudioContext: webAudio ? MockAudioContext : undefined };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] });
  try { await run({ document, instances, pending, oscillators }); }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('tempo changes walking cadence but leaves real-time durations unchanged', () => {
  const slow = new PerformanceController();
  const fast = new PerformanceController();
  slow.setMode('walk');
  fast.setMode('walk');
  slow.update(0.2, 0.5);
  fast.update(0.2, 1.5);
  assert.ok(Math.abs(fast.state.phase - slow.state.phase * 3) < 1e-10);
  assert.equal(slow.state.modeTime, fast.state.modeTime);
  for (const mode of ['talk', 'lights', 'showcase']) {
    slow.setMode(mode);
    fast.setMode(mode);
    slow.update(2, 0.5);
    fast.update(2, 1.5);
    assert.equal(slow.state.mode, fast.state.mode);
    assert.equal(slow.state.modeTime, 2);
    assert.equal(fast.state.modeTime, 2);
    assert.equal(slow.state.lightLevel, fast.state.lightLevel);
  }
  slow.destroy();
  fast.destroy();
});

test('scene transitions follow elapsed time, including a delayed frame', () => {
  const performance = new PerformanceController();
  performance.setMode('showcase');
  performance.update(6.4, 3);
  assert.equal(performance.state.activeMode, 'walk');
  performance.update(0.2, 3);
  assert.equal(performance.state.activeMode, 'talk');
  performance.update(10.3, 3);
  assert.equal(performance.state.activeMode, 'lights');
  performance.update(5.5, 3);
  assert.equal(performance.state.mode, 'idle');
  performance.setMode('lights');
  performance.update(7);
  assert.equal(performance.state.mode, 'idle');
  performance.destroy();
});

test('reduced motion freezes walking and registers and keeps speaking lights steady', () => {
  const performance = new PerformanceController();
  performance.setReducedMotion(true);
  for (const mode of ['walk', 'talk', 'lights']) {
    performance.setMode(mode);
    const phase = performance.state.phase;
    performance.update(0.2);
    const lightLevel = performance.state.lightLevel;
    performance.update(1);
    assert.equal(performance.state.phase, phase);
    assert.equal(performance.state.walkWeight, 0);
    assert.equal(performance.state.registerLevel, 0);
    assert.equal(performance.state.lightLevel, lightLevel);
  }
  performance.destroy();
});

test('Stop immediately resets visible performance and frame updates do not emit UI changes', () => {
  const performance = new PerformanceController();
  performance.setMode('walk');
  performance.update(1);
  performance.stop();
  assert.equal(performance.state.mode, 'idle');
  assert.equal(performance.state.walkWeight, 0);
  assert.equal(performance.state.speechLevel, 0);
  assert.equal(performance.state.registerLevel, 0);
  let changes = 0;
  performance.addEventListener('change', () => changes++);
  for (let i = 0; i < 60; i++) performance.update(1 / 60);
  assert.equal(changes, 0);
  performance.destroy();
});

test('actual original-clip ending completes Talk; tempo cannot truncate its playback', async () => {
  await withBrowserMocks(async ({ instances, pending }) => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3', 'Original clip transcript.');
    const audio = instances[0];
    audio.dispatchEvent(new Event('loadedmetadata'));
    performance.setMuted(false);
    performance.setMode('talk');
    performance.update(0.7, 3); // The register cue must precede the original clip.
    performance.update(0.5, 3); // Simulate a short media start delay.
    pending.shift()();
    await flushPromises();
    assert.equal(performance.state.audioStatus, 'playing-original');
    performance.update(3.7, 3);
    assert.equal(performance.state.mode, 'talk', 'do not stop from nominal metadata duration before ended');
    assert.equal(audio.paused, false);
    audio.finish();
    assert.equal(performance.state.mode, 'idle');
    assert.equal(performance.state.speechLevel, 0);
    performance.setMode('talk');
    performance.update(0.7, 0.2);
    performance.update(9.5, 0.2);
    assert.equal(performance.state.mode, 'idle', 'the voice cap excludes its required 0.7-second register cue');
    assert.equal(audio.paused, true);
    while (pending.length) pending.shift()();
    await flushPromises();
    performance.destroy();
  });
});

test('Stop, mute, mode changes, hidden page, and destruction cancel pending playback', async () => {
  await withBrowserMocks(async ({ document, instances, pending }) => {
    const actions = [
      performance => performance.stop(),
      performance => performance.setMuted(true),
      performance => performance.setMode('lights'),
      () => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
      performance => performance.destroy(),
    ];
    for (const action of actions) {
      document.hidden = false;
      const performance = new PerformanceController();
      performance.setClip('./original.mp3');
      performance.setMuted(false);
      performance.setMode('talk');
      performance.update(0.7);
      const audio = instances.at(-1);
      assert.equal(audio.paused, false);
      action(performance);
      assert.equal(audio.paused, true);
      pending.shift()();
      await flushPromises();
      assert.equal(audio.paused, true, 'a late play promise cannot resurrect cancelled audio');
      performance.destroy();
    }
  });
});

test('a stale play promise does not pause a newer valid Talk activation', async () => {
  await withBrowserMocks(async ({ instances, pending }) => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3');
    performance.setMuted(false);
    performance.setMode('talk');
    performance.update(0.7);
    performance.setMode('walk');
    performance.setMode('talk');
    performance.update(0.7);
    while (pending.length) pending.shift()();
    await flushPromises();
    assert.equal(instances[0].paused, false);
    assert.equal(performance.state.audioStatus, 'playing-original');
    performance.destroy();
  });
});

test('late unmute restarts the showcase speech window and preserves the entire clip', async () => {
  await withBrowserMocks(async ({ instances, pending }) => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3', 'Original clip transcript.');
    const audio = instances[0];
    audio.duration = 8.59;
    audio.dispatchEvent(new Event('loadedmetadata'));
    performance.setMode('showcase');
    performance.update(6.5);
    performance.update(7.5);
    assert.equal(performance.state.activeMode, 'talk');
    assert.equal(audio.paused, true);
    performance.setMuted(false);
    assert.equal(performance.state.modeTime, 6.5);
    assert.equal(performance.state.speaking, false);
    assert.match(performance.state.caption, /Registers cycling/);
    performance.update(0.7);
    pending.shift()();
    await flushPromises();
    performance.update(2.1, 3);
    assert.equal(performance.state.activeMode, 'talk', 'the old Lights deadline must not cut off the clip');
    assert.equal(audio.paused, false);
    performance.update(6.49, 3);
    assert.equal(performance.state.activeMode, 'talk');
    assert.equal(audio.paused, false);
    audio.finish();
    assert.equal(performance.state.audioStatus, 'clip-complete');
    performance.update(0.92);
    assert.equal(performance.state.activeMode, 'lights');
    performance.destroy();
  });
});

test('playback failure is visible in both audio status and caption', async () => {
  await withBrowserMocks(async () => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3', 'Original transcript.');
    performance.setMuted(false);
    performance.setMode('talk');
    performance.update(0.7);
    await flushPromises();
    assert.equal(performance.state.audioStatus, 'playback-unavailable');
    assert.match(performance.state.caption, /could not play/);
    assert.match(performance.state.caption, /Original transcript/);
    performance.setReducedMotion(true);
    assert.match(performance.state.caption, /could not play/);
    performance.destroy();
  }, { rejectPlayback: true });
});

test('audio never starts without a user gesture; absent film media stays explicit', async () => {
  await withBrowserMocks(async ({ instances, pending }) => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3');
    performance.setMuted(false);
    performance.setMode('talk');
    performance.update(0.7);
    assert.equal(instances[0].paused, true);
    assert.equal(pending.length, 0);
    performance.setClip('');
    performance.setMode('talk');
    performance.update(0.7);
    assert.match(performance.state.caption, /Original film clip unavailable/);
    performance.destroy();
  }, { gesture: false });
});

test('seven dry register clicks precede unchanged original audio with no lamp illumination', async () => {
  await withBrowserMocks(async ({ instances, pending, oscillators }) => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3', 'Original clip transcript.');
    performance.setMuted(false);
    performance.setMode('talk');
    assert.equal(oscillators.length, 7);
    assert.ok(oscillators.every((node, i) => Math.abs(node.starts[0] - i * 0.1) < 1e-10));
    assert.ok(oscillators.at(-1).stops[0] < 0.65);
    assert.equal(performance.state.registerLevel, 1);
    assert.equal(performance.state.speaking, false);
    assert.match(performance.state.caption, /Registers cycling/);
    performance.update(0.65, 3);
    assert.equal(instances[0].paused, true);
    assert.equal(pending.length, 0);
    assert.equal(performance.state.speechLevel, 0);
    assert.equal(performance.state.lightLevel, 0);
    performance.update(0.05, 3);
    assert.equal(pending.length, 1);
    assert.equal(performance.state.registerLevel, 0);
    assert.equal(performance.state.speaking, false, 'loading audio is not speaking');
    assert.equal(performance.state.lightLevel, 0);
    assert.ok(oscillators.every(node => node.disconnected));
    pending.shift()();
    await flushPromises();
    assert.equal(performance.state.speaking, true);
    assert.equal(instances[0].playbackRate, 1, 'original voice pitch and rate remain unchanged');
    assert.match(performance.state.caption, /Original clip transcript/);
    performance.update(0.1);
    assert.ok(performance.state.speechLevel > 0);
    assert.equal(performance.state.lightLevel, performance.state.speechLevel);
    performance.destroy();
  }, { webAudio: true });
});

test('every non-speaking mode turns lamps completely off without a residual fade', () => {
  const performance = new PerformanceController();
  performance.setClip('./original.mp3', 'Original transcript.');
  for (const reduced of [false, true]) {
    performance.setReducedMotion(reduced);
    for (const mode of ['idle', 'walk', 'lights', 'drive']) {
      performance.setMode('talk');
      performance.update(1);
      assert.equal(performance.state.speaking, true);
      assert.ok(performance.state.lightLevel > 0);
      performance.setMode(mode);
      assert.equal(performance.state.speaking, false);
      assert.equal(performance.state.lightLevel, 0);
      performance.update(1);
      assert.equal(performance.state.speechLevel, 0);
      assert.equal(performance.state.lightLevel, 0);
    }
  }
  performance.destroy();
});

test('cancelling the preroll removes every queued click and prevents delayed original voice', async () => {
  await withBrowserMocks(async ({ document, instances, pending, oscillators }) => {
    const actions = [
      performance => performance.stop(),
      performance => performance.setMuted(true),
      performance => performance.setMode('walk'),
      () => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
      performance => performance.destroy(),
    ];
    for (const action of actions) {
      document.hidden = false;
      const performance = new PerformanceController();
      performance.setClip('./original.mp3');
      performance.setMuted(false);
      const firstNode = oscillators.length;
      performance.setMode('talk');
      performance.update(0.2);
      const cue = oscillators.slice(firstNode);
      assert.equal(cue.length, 7);
      assert.equal(instances.at(-1).paused, true);
      action(performance);
      assert.ok(cue.every(node => node.disconnected && node.stops.at(-1) === undefined));
      performance.update(1);
      await flushPromises();
      assert.equal(pending.length, 0, 'the original clip must never be queued after cancellation');
      assert.equal(instances.at(-1).paused, true);
      performance.destroy();
    }
  }, { webAudio: true });
});

test('muted preview follows registers then speech without creating any audio nodes', async () => {
  await withBrowserMocks(async ({ pending, oscillators }) => {
    const performance = new PerformanceController();
    performance.setClip('./original.mp3', 'Original transcript.');
    performance.setMode('talk');
    performance.update(0.6);
    assert.equal(performance.state.registerLevel, 1);
    assert.equal(performance.state.speaking, false);
    assert.equal(performance.state.lightLevel, 0);
    performance.update(0.3);
    assert.equal(performance.state.registerLevel, 0);
    assert.equal(performance.state.speaking, true);
    assert.ok(performance.state.lightLevel > 0);
    assert.equal(pending.length, 0);
    assert.equal(oscillators.length, 0);
    performance.setReducedMotion(true);
    const steadyLight = performance.state.lightLevel;
    performance.update(0.5);
    assert.equal(performance.state.lightLevel, steadyLight);
    performance.destroy();
  }, { webAudio: true });
});
