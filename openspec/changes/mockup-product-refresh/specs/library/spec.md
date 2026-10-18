## ADDED Requirements

### Requirement: Home library
Home SHALL display Continue playing, Pinned and Sources rows in the supplied mockup order. Continue playing SHALL aggregate unfinished files and queues across sources with at most ten deduplicated recommendations. Pins SHALL support device roots, saved network sources, folders and stream URLs.

#### Scenario: Next episode after completed episodes
- **GIVEN** a saved queue with episodes one through three finished and episode four unwatched
- **WHEN** Home renders recommendations
- **THEN** it recommends episode four rather than restarting the finished episodes

#### Scenario: Unavailable source
- **WHEN** a pinned or unfinished item's source is unavailable
- **THEN** its card remains with an unavailable-source icon
- **AND** no other server is substituted

### Requirement: Context actions
Long OK SHALL open contextual actions for pins, saved streams, sources, folders, devices and recommendations without also activating the selected item.

#### Scenario: Remove recommendation
- **WHEN** the viewer holds OK on a recommendation and chooses Remove
- **THEN** the recommendation is removed without deleting the media or its pin

### Requirement: Stream library and URL receipt
Stream SHALL display saved and recent cards, resolve names automatically with a rename action, and receive URLs through a QR listening modal.

#### Scenario: Cancel URL receipt
- **WHEN** the viewer opens Get from device and presses Back
- **THEN** polling stops and focus returns to Get from device

### Requirement: Saved network sources
Network SHALL display separately configured SMB, WebDAV and DLNA source cards plus Add. Adding a source SHALL select the method before configuration. Saved connections SHALL initialize at launch without blocking Home.

#### Scenario: Add one DLNA device
- **GIVEN** two discoverable DLNA devices
- **WHEN** the viewer adds one device
- **THEN** only that device appears as a configured card
- **AND** subsequent connections target that device ID

### Requirement: Settings and playback exit
Settings SHALL show compact switches for casting and logging, with the corresponding URL toasted when enabled. Back from playback SHALL save progress, stop audio or video, and restore its launch location without a mini-player.

#### Scenario: Leave audio playback
- **WHEN** the viewer presses Back with no player modal open
- **THEN** audio stops and its launching folder or row regains focus
