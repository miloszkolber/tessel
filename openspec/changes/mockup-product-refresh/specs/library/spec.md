## MODIFIED Requirements

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
Long OK SHALL open contextual actions for pins, saved streams, sources, folders, devices and recommendations without also activating the selected item. Repeated keydowns SHALL not duplicate an action. Back SHALL close the modal and restore focus to the originating item when it still exists.

#### Scenario: Release a held OK
- **WHEN** a viewer holds OK to open a context menu and releases it
- **THEN** neither the item nor a menu command is activated by that release

#### Scenario: Remove recommendation
- **WHEN** the viewer holds OK on a recommendation and chooses Remove
- **THEN** the recommendation is removed without deleting the media or its pin

### Requirement: Stream library and URL receipt
Stream SHALL display saved and recent cards, derive default names from URLs with a rename action, and receive URLs through a QR listening modal. Simulator receipt SHALL be clearly identified as simulated.

#### Scenario: Cancel URL receipt
- **WHEN** the viewer opens Get from device and presses Back
- **THEN** polling stops and focus returns to Get from device

### Requirement: Saved network sources
Network SHALL display separately configured SMB, WebDAV and DLNA source cards plus Add. Adding a source SHALL select the method before configuration. Saved connections SHALL initialize in the background at launch, with at most two concurrent SMB/WebDAV connection attempts.

#### Scenario: Add one DLNA device
- **GIVEN** two discoverable DLNA devices
- **WHEN** the viewer adds one device
- **THEN** only that device appears as a configured card
- **AND** subsequent connections target that device ID

### Requirement: Settings capability reporting
Settings SHALL show compact switches for casting and logging, with the corresponding URL toasted when enabled. Device information, browser codec probes and protocol notes SHALL be separated. Protocol notes SHALL not assert hardware acceptance from browser hints or simulator behavior.

#### Scenario: Inspect capability panels
- **WHEN** the viewer navigates down from the Settings controls
- **THEN** each information panel can receive focus and scroll into view using the remote
