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

## ADDED Requirements

### Requirement: Shared content-card geometry
Home, Stream, Network, USB device roots and playback queue cards SHALL share a 16:9 outer rectangle. Rows SHALL use five equal columns inside the page insets at 1920×1080 and 1153×1297. Optional secondary labels SHALL NOT change card height. Form controls, information panels and empty-state messages are not content cards.

#### Scenario: Overflowing carousel
- **GIVEN** more than five cards in a row
- **WHEN** remote focus moves to the first or last card
- **THEN** the complete focused card and focus treatment fit inside the carousel
- **AND** idle rows settle on whole-card boundaries

### Requirement: Complete playback queue
The queue SHALL remain fully visible whenever the OSD is visible, including when focus returns to transport controls. Bottom-positioned subtitles SHALL remain above the timeline and complete queue. Hiding the OSD SHALL NOT introduce a page scrollbar or shrink playback controls.

#### Scenario: Return focus to transport
- **WHEN** the viewer navigates from the queue to transport controls
- **THEN** queue cards are not vertically cropped to a sliver
- **AND** bottom subtitles remain clear of the timeline

### Requirement: Restrained motion
Card and control transitions SHALL use a consistent eased cadence. Content surfaces SHALL NOT carry decorative gradients. Reduced-motion preference SHALL disable decorative animations and smooth focus scrolling. View transitions SHALL preserve the opaque non-player background above the native video plane.

#### Scenario: Reduced-motion focus
- **GIVEN** reduced motion is enabled
- **WHEN** remote focus moves to an offscreen card
- **THEN** scrolling brings the card into view without animated movement

### Requirement: Reference surface and focus treatment
Library surfaces SHALL use the reference outline and fill values. Content cards, rows, options and information panels SHALL use a 2px #303030 outline on a #151515 fill. Inputs and secondary buttons SHALL use a 2px #464646 outline on a #202020 fill. A focused surface SHALL use a #F4F4F4 outline on a #202020 fill. Focus SHALL read as a hard ring rather than a soft glow. Cards, tiles and device shortcuts SHALL add a 2px ring outside the outline; rows, options and inputs SHALL not.

#### Scenario: Focused content card
- **WHEN** a content card takes focus
- **THEN** it shows a 2px light outline, a 2px light ring outside it and a lighter fill
- **AND** no blurred or translucent halo surrounds it

#### Scenario: Focused settings row
- **WHEN** a settings row takes focus
- **THEN** it shows a 2px light outline and a lighter fill
- **AND** its height and neighbours' positions do not change

### Requirement: Page field, footer strip and modal
Library pages SHALL paint the baked halftone field over the #0A0A0A page colour without a live blended layer. The fixed remote-hint footer SHALL fade the page into a 128px scrim and place 28px key chips 50px above the bottom edge. Modals SHALL be 678px wide with a 16px radius over a 50% scrim, and source dialogs SHALL keep their action at the bottom of the panel.

#### Scenario: Footer over the page field
- **WHEN** a library page is shown
- **THEN** the last 128px fade from the page colour into the footer colour
- **AND** the key chips sit 50px above the bottom edge

#### Scenario: Source configuration dialog
- **WHEN** a source configuration dialog opens
- **THEN** the panel keeps its action button at the bottom
- **AND** the list of discovered sources stays at the top
