# Robby Performance Lab

An interactive Robby the Robot study with walking, original film dialogue, speech-linked lights, moving head mechanisms, and a vehicle that opens for standing entry and exit.

Open `index.html` in a modern browser. The complete demo is self-contained, including the original voice excerpt and reference photo. No install or network connection is needed for the demo. Alternatively run `node serve.mjs` and visit http://127.0.0.1:4187.

## GitHub project

Repository: [jtdelosh-ops/robby-robot](https://github.com/jtdelosh-ops/robby-robot). Access requires permission to the private repository.

```sh
git clone https://github.com/jtdelosh-ops/robby-robot.git
cd robby-robot
node --test
node build.mjs
node serve.mjs
```

No dependency installation is required. GitHub Actions runs the tests, rebuilds the deliverables, and checks that committed builds match the source on Node.js 22 and 24. Generated `index.html` and `dist/` files are intentionally tracked so the offline demo is ready to open after cloning.

Use **Walk**, **Speak**, **Mechanisms**, or **Board & drive**. **Run sequence** runs the walking, registers, voice, and head mechanisms. Sound starts off; enable it explicitly to hear the film recording. Drag Robby or use the view slider to turn him. **Stop** cancels the performance; Escape also stops it when the robot viewer has focus.

The vehicle opens its front grille, Robby walks into the standing bay, turns into the driving position, and the grille closes around him before driving. The driving view expands across the page, with space for a continuous circular route shown in perspective. Choose **Walk** or the stage's **Exit & walk** button to stop at the current position, open the front grille, and have Robby step out. He continues walking outside while the vehicle remains parked. Reduced motion shows a stationary pose instead. The view angle is automatic throughout the vehicle scene.

## Scope and sources

This is original procedural 2.5D SVG artwork, proportioned from the supplied photographs. It works without WebGL. Walking cadence, register sounds, and boarding choreography are approximations. The original-film voice is an 8.59-second excerpt, not synthesized speech. See `RESEARCH.md` for sources and limits.

This separate demo does not replace B9 on an existing website. Its reusable component supports embedding, but does not include the B9 kit's autonomous page roaming or draggable remote.

## Reusable component

```html
<robby-robot id="robby" style="width:480px;height:520px"></robby-robot>
<script src="dist/robby-robot.js"></script>
<script>
  const robot = document.querySelector('#robby');
  robot.setClip('assets/voice.mp3', 'Original film self-introduction');
  document.querySelector('#your-button').addEventListener('click', () => {
    robot.setVoice(true); // explicit user action
    robot.talk();
  });
</script>
```

Public methods: `walk()`, `talk()`, `mechanisms()`, `showcase()`, `drive()`, `stop()`, `show()`, `hide()`, `face(degrees)`, `setMotion(enabled)`, `setVoice(enabled)`, `setClip(url, caption)`, `setSpeed(tempo)`, `setZoom(scale)`, `debugState()`, and `destroy()`. `robotstatechange` emits state in `event.detail`. Removal disposes audio and listeners; reattachment creates a fresh muted controller. `destroy()` removes the element and disposes its resources.

`setSpeed()` adjusts walking cadence and mechanical/vehicle animation without speeding up or truncating the voice. A brief synthesized mechanical register approximation precedes the original dialogue. Speaking tubes stay dark during that cue, idle, walking, mechanisms, and driving. Muted speech lights are a stylized preview; sound-enabled speech lights use the audio waveform when the browser supports analysis.

## Development and verification

Node.js 22+ is sufficient; no package installation is required.

```sh
node build.mjs
node --test
node serve.mjs
```

Source lives in `src/`; the build emits `index.html`, `dist/robby-demo.html`, and `dist/robby-robot.js`. The two HTML files are identical standalone deliverables. `tests/viewport.html` is a local 390px layout-check harness.

An independent reviewer inspected the code, actual renders, reference photos, and builds. Boarding, late-unmute timing, component cleanup, and mechanism-motion findings were corrected and rechecked. The circular route and vehicle-exit transitions were also reviewed. All 23 tests pass; the final verdict is **Ready**. See `REVIEW.md` for details and verification limits.
