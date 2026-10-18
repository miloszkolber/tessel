## Purpose

Describe the maintained playback contract independently of the proposed browsing redesign.

## Requirements

### Requirement: Remote playback controls
The player SHALL expose round transport controls, a timeline, Info and More using the D-pad and OK without requiring optional remote keys.

#### Scenario: Inspect playback options
- **WHEN** the viewer opens More and chooses an option
- **THEN** its next card level opens and Back returns one level before leaving playback

### Requirement: Resume and track preferences
The player SHALL retain playback position and per-file audio, subtitle, speed, delay and aspect preferences. Unfinished files SHALL resume without a confirmation prompt.

#### Scenario: Reopen unfinished media
- **WHEN** a viewer reopens an unfinished file with stored progress
- **THEN** playback resumes without a Continue or Start-over prompt

### Requirement: Simulation boundary
The simulator SHALL run production markup and navigation with simulated platform, transport and decoder implementations.

#### Scenario: Simulated file playback
- **WHEN** a viewer chooses a virtual USB file in `demo.html`
- **THEN** production navigation opens the player with simulated progress
- **AND** this result does not establish hardware codec support

### Requirement: Playback exit
Back with no player modal open SHALL save progress, stop audio or video, and restore its launching folder or page. No mini-player or background audio mode SHALL remain.

#### Scenario: Return to an audio folder
- **WHEN** the viewer leaves audio playback with Back
- **THEN** the decoder stops and native focus returns to the originating file row
