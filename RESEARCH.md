# Reference and implementation notes

## What informed the demo

- **Shape:** the user's full-body museum photo establishes the clear bell dome, broad neck hood, dark rounded body, segmented legs, and heavy feet. The user's publicity photograph and [Silodrome vehicle article](https://silodrome.com/jeep-robby-robot-forbidden-planet/) establish the two grille tiers, paired transparent passenger screens, and standing front bay. The latest user correction is **front entry**, superseding the earlier rear-entry idea.
- **Walking:** short alternating steps, small foot lift, body sway, and opposing arm motion. The default 0.8 stride cycles/second is an animation choice, not a measured film value.
- **Voice and mechanisms:** [Fred Barton Productions' licensed replica specifications](https://the-robotman.com/robby-the-robot) describe speech-linked blue neon, rotating side scanners, gyros, and moving relays. The demo models these as separate moving parts. The horizontal speaking tubes are under the dome hood; the upper vertical details remain mechanical.
- **Original voice:** [AFI's film record](https://catalog.afi.com/Film/51831-FORBIDDEN-PLANET) identifies Marvin Miller as Robby's speaking voice. `assets/voice.mp3` contains the short self-introduction from the original performance. No speech synthesis or voice imitation is used.

## Refined model

The latest supplied frontal photograph supersedes the museum photo as the main model reference: shorter broad torso, large smooth pelvis, thick telescoping arms, six registers in one row, an arched hood, and broad flat-soled boots. Vehicle motion is substantially faster than the first version.

## Supplied videos

The primary agent inspected the user's [Robothut vehicle discussion](https://www.youtube.com/watch?v=i6tdWV1sY7I) and [original-film arrival excerpt](https://www.youtube.com/watch?v=6fw7PcJcufM) through the browser after text fetching failed. The user also provided [the Jean Cocteau Cinema short](https://www.youtube.com/shorts/WhrRIER2L4g), used as a supplementary mechanism reference. Selected visible frames, not a frame-by-frame motion capture, informed the work:

- Arrival excerpt around 1:13: Robby upright in the moving vehicle.
- Around 1:30: front grille open with Robby outside the vehicle.
- Around 1:42: close view of the head mechanisms and horizontal neon area beneath the dome.

The front opens, Robby enters standing, and the enclosure closes around him in the demo. The vehicle follows a broad perimeter route with smooth bends across the test ground. Movement advances by ground distance with gentle acceleration; the chassis follows the route tangent, the front wheels steer into bends, and the tires roll with distance. The car is drawn from projected three-dimensional surfaces, so its front, sides, and rear change naturally with its heading. Choosing Walk stops it at its current position and heading, opens the grille, and brings Robby out through the local front opening, including when the vehicle faces away from the viewer. The route and choreography are animation interpretations, not measured film reconstruction or a full tire-and-suspension simulation.

## Audio provenance

Source: [101soundboards original Robby self-introduction](https://www.101soundboards.com/sounds/260718-for-your-convenience-i-am-monitored-to-respond-to-the-name-robby). Downloaded from the page's public audio URL on 2026-09-18. The file is 139,060 bytes, 8.588821 seconds, and contains one 13-word dialogue excerpt. The same line is attributed to film time 00:13:36 by [Movie-Sounds](https://movie-sounds.org/sci-fi/forbidden-planet-1956/107680).

The MP3 decoded successfully in the browser. Archive provenance supports its original-performance attribution; the agent did not independently audition the spoken content. Availability from an archive does not establish a redistribution license. This local fan study is not an official or licensed Robby product. Retain these credits when sharing the project and obtain any needed permissions before public distribution.

Sound is muted by default. The original recording plays at its original rate. Blue mouth-tube brightness follows audio amplitude when analysis is available; muted playback uses a clearly documented stylized visual preview. A 0.70-second synthesized mechanical register cue precedes the unchanged film clip. This nonverbal effect approximates the pre-speech activity the user identified; it is not claimed to be an original film recording. The lamps remain dark throughout the register cue and all non-speaking modes.
