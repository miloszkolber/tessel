# Playback and diagnostics

## Playback limits

Tessel uses Samsung AVPlay with an HTML5 fallback. Available codecs depend on model, firmware, container and transport. No companion transcoding service is included. Unsupported files may need conversion with an external tool before playback.

Subtitle support includes text sidecars and embedded MP4/MKV text tracks. Burned-in captions are part of the image and cannot be shifted. Blur over the native AVPlay video plane is device-dependent.

Surround output depends on the TV and HDMI/optical connection. AVPlay does not provide general passthrough or channel-layout control. Interface codec probes describe browser capability, not proof that a particular file will decode.

## Logs and casting

The app writes diagnostics to DevTools. Enabling Debug logging publishes a live log on the TV's LAN service at `http://<tv-ip>:8129/debug`. No PC collector or USB log-export workflow is maintained.

The same LAN listener serves `http://<tv-ip>:8129/cast` for sending a media URL. Treat that network as trusted: the listener has no internet relay or account-based access control. Turning casting off must stop URL acceptance, not just hide the address.

## Installation identity

This fork uses its own application/package identity and does not update the original app in place. Existing data in the original app's private storage is not automatically transferred. The source-level storage keys remain compatible inside this fork.

Physical Samsung acceptance remains required for native playback, remote key delivery, LAN listeners and network sessions. A successful simulator run is not a substitute.
