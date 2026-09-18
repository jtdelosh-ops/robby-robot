# Independent peer review

Final verdict: **Ready**. The personal reviewer inspected the implementation, supplied photographs, rendered poses, vehicle sequence frames, and standalone builds. Supported findings were corrected and checked again by the same reviewer.

The reviewer found four supported defects across the revisions:

1. The initial boarding path moved sideways through a hinge. It now approaches between the open gates, enters the standing bay, turns into position, and waits for closure before driving.
2. Unmuting late in the showcase restarted the film clip without restarting its time window. The full speech window now restarts, preserving the original clip.
3. Removing the reusable element left controller listeners and audio resources alive. Removal now disposes them; reconnection creates a fresh muted controller with its original clip preserved.
4. The Mechanisms action did not move every advertised part. It now moves the relays and both side scanners. Idle and reduced motion remain still, and non-speaking lamps stay dark.

The reviewer confirmed the corrections and checked the later circular-driving and exit additions. Choosing Walk preserves the vehicle's position and wheel rotation, opens the front grille, and lets Robby walk out. The open vehicle remains parked. Interruptions, repeated Walk, restarting Drive, and reduced motion were included. No material issues remain from this review.

## Verification

- **23 Node tests pass:** 14 controller tests and 9 widget tests covering audio timing, register preroll, speech-only lighting, cancellation, unavailable playback, reduced motion, boarding, circular travel, exit transitions, interruptions, and cleanup.
- Eight robot/reference poses and eight circular-route/exit frames rendered successfully. Exit snapshots preserve identical vehicle position and wheel values through the full exit.
- Both standalone HTML files are identical and contain the current source. The component bundle contains the same implementation. Bundled voice bytes match the source audio asset.
- The standalone browser demo loads with no observed console errors.
- Original MP3 decodes in the browser: **8.588821 seconds**. The latest playback check showed dark lamps during the register cue, original playback beginning after about 0.70 seconds, waveform-driven speech illumination, and a return to idle with lights off. Maximum observed normalized speech level was 0.7796. No synthetic speech is present.
- Desktop interaction checked: circular driving, front exit, parked-scene continuity, speech, stop, reduced motion, and mechanisms.
- Phone layout checked in a 390px iframe, with 375px of content after its scrollbar; no horizontal overflow. Expanded driving controls and Exit & walk were exercised. The reviewer did not independently repeat this phone check.

## Limits

Neither the primary agent nor reviewer independently auditioned the spoken content; its attribution relies on archive provenance and the corroborating film-line record. This is procedural 2.5D artwork, not a scanned model or frame-accurate reconstruction. The vehicle follows a ground-plane ellipse while retaining its illustrated viewing orientation. The register sound is a synthesized nonverbal approximation; the spoken excerpt is an unchanged original-film recording. No public deployment or existing-site replacement was performed.
