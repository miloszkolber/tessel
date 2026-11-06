# TV feedback round

## Why

The in-app browser review and TV session found remaining navigation, layout, performance and subtitle defects. The library no longer needs a separate ".." row, card rows hide their overflow, empty Stream sections take space, network sources reload when revisited, the URL view opens the on-screen keyboard, card components still differ between screens, embedded DLNA subtitles are not listed, and many new strings have no translation.

## What changes

- Remove the ".." back rows from SMB, WebDAV and DLNA browsing; Up/Back already owns navigation.
- Sort folders before files in every network browser and add more simulator examples.
- Hide empty Saved streams and Recent sections on Stream.
- Add overflow affordance and look-ahead scrolling to card rows; restore complete top-of-page scroll.
- Reuse the shared card structure for browse tiles.
- Make focus movement immediate and limit entrance animation to the view container.
- Add optional interface sounds, synthesized in the WebView, with a Settings switch.
- Proxy DLNA byte-range reads through the loopback service so embedded subtitle headers and track extraction work despite missing CORS.
- Cache DLNA discovery and folder listings briefly so revisiting a source does not restart the search.
- Translate every remaining string into all offered languages.
- Remove the loading spinner panel background and stop opening the on-screen keyboard when a view opens.

## Status

Implementation is in progress. Main specs hold established behavior; this change records the proposed requirements and verification.

## Preserved behavior

Keep the monochrome visual system, remote-first focus ownership, playback, resume, pins, history, service binding and privilege set. Do not claim hardware acceptance from the simulator.
