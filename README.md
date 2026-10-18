# Tessel

A remote-first media player for Samsung Tizen TVs. Play video, music and playlists from USB, SMB, WebDAV, DLNA or a stream URL, with subtitles, queues and automatic resume.

This independently maintained MIT-licensed fork of [tessel-tizen-tv](https://github.com/PatrickSt1991/tessel-tizen-tv) focuses on a monochrome interface, in-player controls and LAN-only casting. It removes the companion transcode server, image/text viewers, backup tools and donation UI. Codec support depends on the TV.

## Try or build

- Serve `tizen-app/` with a static HTTP server and open `demo.html` for a simulated experience without a TV. Use arrows, Enter and Escape.
- Run `bash tizen-app/build.sh` to create unsigned `dist/tessel.wgt`. Re-sign with a Samsung distributor certificate for your TV, then install with `sdb install dist/tessel.wgt`.
- CI provides unsigned build artifacts. This fork is not distributed through the original project's installation channel.

The mockup-driven library redesign is in progress. See [development and current work](openspec/README.md) for requirements, tests and remaining tasks. See [playback and diagnostics](openspec/references/runtime.md) for practical limits.

Original code © 2026 Patrick. Fork changes © 2026 Milosz Kolber. [MIT license](LICENSE). Third-party asset notices remain with their assets.
