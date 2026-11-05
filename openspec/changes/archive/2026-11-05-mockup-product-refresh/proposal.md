# Mockup product refresh

## Why

Replace the navigation experiments with the supplied Home, Stream, Settings, USB and Network mockups. Consolidate persistence and interactions rather than layering more alternate flows onto the existing controllers.

## What changes

- Home aggregates pins and up to ten unfinished files or queues, including unavailable sources.
- Long OK opens a context menu without activating the item. Roots, folders and URLs can be pinned.
- Stream uses saved and recent cards, automatic names with rename, and a QR listening modal.
- Settings is reduced to language, casting, logging and honest device/capability information.
- USB lists device cards and a deliberate empty state. Network lists individually saved SMB, WebDAV and DLNA sources plus Add, supporting multiple simultaneous connections.
- Remove background audio and the mini-player. Confirmed: Back saves progress, stops either media type and returns to its origin.
- Adopt OpenSpec, shorten the README, consolidate useful docs and tests, audit prior work, and publish a fresh-root independent repository with required attribution retained.

## Status

Implementation is in progress. Main specs cover established behavior only. The tasks record owns completion and verification. The user approved a fresh history root, an offline recovery bundle, and deletion of both existing releases and their tags.

## Preserved behavior

Keep playback controls, subtitles, track preferences, resume, LAN-only casting, media-only browsing, SamsungOne-first typography and the monochrome palette. Do not remove licenses or claim hardware verification from the simulator.
