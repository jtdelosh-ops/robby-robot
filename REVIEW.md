# Independent peer review

Final verdict: **Ready**. The personal reviewer independently ran all 37 tests, inspected the current route and exit renders, and verified that the standalone builds match the source. No actionable material defects remain in the driving revision. Earlier supported findings were corrected and checked again by the same reviewer.

The reviewer found four supported defects across the revisions:

1. The initial boarding path moved sideways through a hinge. It now approaches between the open gates, enters the standing bay, turns into position, and waits for closure before driving.
2. Unmuting late in the showcase restarted the film clip without restarting its time window. The full speech window now restarts, preserving the original clip.
3. Removing the reusable element left controller listeners and audio resources alive. Removal now disposes them; reconnection creates a fresh muted controller with its original clip preserved.
4. The Mechanisms action did not move every advertised part. It now moves the relays and both side scanners. Idle and reduced motion remain still, and non-speaking lamps stay dark.

The reviewer confirmed those corrections and checked the earlier circular-driving and exit additions. The current revision replaces the fixed viewing orientation and small ellipse with projected vehicle geometry and a broad route with smooth bends. Ground distance drives position and wheel rotation; the chassis, standing driver, and front wheels turn with the route. Choosing Walk preserves the vehicle's position, heading, and wheel rotation, opens the front grille, and lets Robby walk through the local front opening at every heading. The open vehicle remains parked.

## Verification

- **37 Node tests pass:** 14 controller, 13 widget, 4 route, and 6 vehicle-renderer tests. Coverage includes audio timing, speech-only lighting, cancellation, cleanup, boarding, turning, steering, distance-linked wheels, route bounds, front exits at every heading, stop/resume, reduced motion, and irregular frame timing. An unchanged parked pose skips SVG reconstruction.
- Eight robot poses and eight route/exit frames rendered successfully. Exit snapshots preserve identical vehicle position, heading, and wheel values through the full exit.
- Both standalone HTML files are identical and contain the current source. The component bundle contains the same implementation. Bundled voice bytes match the source audio asset.
- The standalone browser demo loads with no observed console errors.
- The final browser timing sample averaged about **39 frames/second** across 300 driving frames on this machine, with steady 150-unit ground speed. Renderer generation alone improved from roughly 9–12 ms to 3.7–3.9 ms per frame; six comparison poses remained pixel-identical. These measurements are local observations, not a frame-rate guarantee.
- Original MP3 decodes in the browser: **8.588821 seconds**. The latest playback check showed dark lamps during the register cue, original playback beginning after about 0.70 seconds, waveform-driven speech illumination, and a return to idle with lights off. Maximum observed normalized speech level was 0.7796. No synthetic speech is present.
- Desktop interaction checked: turning, broad-route driving, front exit, parked-scene continuity, stop, and smooth restart. Earlier checks cover speech, reduced motion, and mechanisms.
- Phone layout checked in a 390px iframe, with 375px of content after its scrollbar; no horizontal overflow. Expanded driving controls and Exit & walk were exercised. The reviewer did not independently repeat this phone check.
- The reviewer independently repeated the tests, renderer checks, and build verification, but did not repeat live browser frame-rate or auditory checks.

## Limits

Neither the primary agent nor reviewer independently auditioned the spoken content; its attribution relies on archive provenance and the corroborating film-line record. This is procedural 2.5D artwork, not a scanned model or frame-accurate reconstruction. Driving follows an automatic route with smooth steering; it is not a tire-and-suspension physics simulation or manual driving game. Frame rate depends on the browser and device, while distance-based timing preserves travel speed. The register sound is a synthesized nonverbal approximation; the spoken excerpt is an unchanged original-film recording. No public deployment or existing-site replacement was performed.
