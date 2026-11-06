## ADDED Requirements

### Requirement: Embedded network subtitle discovery
For media served by a DLNA server, the app SHALL read the container header through the loopback service's range proxy so embedded text subtitle tracks are listed and extractable despite the server's missing CORS headers.

#### Scenario: Open a Matroska file from DLNA
- **GIVEN** a DLNA video with two embedded ASS subtitle tracks
- **WHEN** the file is opened for playback
- **THEN** both tracks appear in the subtitle menu with their container names
- **AND** selecting one paints its cues without leaving playback
