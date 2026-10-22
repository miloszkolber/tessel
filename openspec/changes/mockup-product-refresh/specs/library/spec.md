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

#### Scenario: Replace a name
- **WHEN** the viewer opens Rename
- **THEN** the existing value is selected for replacement
- **AND** the field and primary action use the shared dialog text scale and monochrome selection treatment

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

#### Scenario: Discovery results arrive
- **WHEN** a source search changes from pending to empty or populated results
- **THEN** the discovery panel and its refresh action retain their positions
- **AND** the pending state uses the shared inline activity ring
- **AND** long results scroll within the bounded panel

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
The queue SHALL show full cards while it holds focus and a peek at the bottom of the OSD otherwise. The transport controls and timeline SHALL keep their place in both states by reserving the expanded queue height. Bottom-positioned subtitles SHALL retain clearance above that stationary timeline and the complete queue. Hiding the OSD SHALL NOT introduce a page scrollbar or shrink playback controls.

#### Scenario: Return focus to transport
- **WHEN** the viewer navigates from the queue to transport controls
- **THEN** the transport controls stay where they were
- **AND** the queue shows the top of its cards rather than a cropped sliver of its titles
- **AND** bottom subtitles remain clear of the timeline

#### Scenario: Enter the queue
- **WHEN** the viewer moves focus onto a queue card
- **THEN** the strip grows to the full cards
- **AND** the queue heading stays visible at the top of the strip

#### Scenario: Identify the playing item
- **WHEN** a queue of multiple items is visible
- **THEN** the heading shows the playing position and total count
- **AND** the playing card has a marker distinct from the navigation focus ring
- **AND** its fallback glyph uses the shared responsive icon disc

### Requirement: Readable playback popups
Playback menus and pickers SHALL use opaque shared surfaces so video, subtitles and timeline details cannot show through their options. They SHALL anchor above the transport row with a visible gap and constrain long lists inside the viewport. Nested menu levels SHALL use the shared finite entrance fade and honor reduced motion.

#### Scenario: Open a menu above a queue
- **WHEN** the viewer opens More during queued playback
- **THEN** the panel clears the transport controls
- **AND** opening a nested level preserves that anchor and a visible focus ring on the selected option

### Requirement: Stable page rhythm
A section that has no items SHALL keep its place on the page and name its empty state instead of disappearing. The music card SHALL sit still on the screen's centre line.

#### Scenario: Empty library section
- **GIVEN** a library with no pins
- **WHEN** Home renders
- **THEN** the Pinned heading and its empty row keep the same height as a filled one
- **AND** the sections below do not move

#### Scenario: Music playback
- **WHEN** an audio file plays without cover art
- **THEN** the cover, the title and the album share the screen's centre line
- **AND** the card does not drift over time

#### Scenario: Audio opening status
- **WHEN** a centred opening or buffering status is visible
- **THEN** the album column is hidden rather than protruding from behind the status
- **AND** it returns at the same position when playback resumes

### Requirement: Playback failure hierarchy
Playback failures SHALL show a short translated heading, the failure detail as secondary text and any diagnostic hint separately. They SHALL preserve the recovery action and scrolling for long details. The warning glyph SHALL use the bundled icon treatment rather than a text character.

#### Scenario: Inspect a playback failure
- **WHEN** playback reports a technical failure
- **THEN** the alert is named by the translated playback-error heading
- **AND** its description includes the original failure detail and any available hint

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

#### Scenario: Pointer over a content card
- **WHEN** a pointer hovers a card or choice without moving remote focus
- **THEN** the hovered surface shows restrained fill and border feedback without scaling
- **AND** the remotely focused card retains the stronger hard ring

### Requirement: Page field, footer strip and modal
Library pages SHALL paint the baked halftone field over the #0A0A0A page colour without a live blended layer. At reference scale, the fixed remote-hint footer SHALL fade the page into a 128px scrim and place 28px key chips 50px above the bottom edge. Key-and-label pairs SHALL stay together when hints wrap. Modals SHALL be 678px wide with a 16px radius over a 50% scrim, and source dialogs SHALL keep their action at the bottom of the panel.

#### Scenario: Footer over the page field
- **WHEN** a library page is shown
- **THEN** the last 128px fade from the page colour into the footer colour
- **AND** the key chips sit 50px above the bottom edge

#### Scenario: Source configuration dialog
- **WHEN** a source configuration dialog opens
- **THEN** the panel keeps its action button at the bottom
- **AND** the list of discovered sources stays at the top

### Requirement: Storage recovery
An empty or failed USB root listing SHALL offer an actionable refresh tile. Refresh SHALL keep its status geometry and visible focus while pending, suppress duplicate activation and replace the status with current roots when available. Error messages SHALL render as text rather than markup.

#### Scenario: Refresh after connecting a drive
- **GIVEN** the USB root listing shows no accessible storage
- **WHEN** the viewer activates Refresh devices and a drive is found
- **THEN** the current root listing replaces the empty state
- **AND** focus selects the discovered drive

### Requirement: One icon disc
Every glyph that stands for a card, a source or a file SHALL use the shared responsive disc scale, and a focused card SHALL invert it. The reference disc is 80px at 1920px viewport width, grows to 112px at widths of at least 2400px and uses the compact 40px scale at widths of at most 1400px. Poster art replaces the disc when a file carries artwork.

#### Scenario: Focused card glyph
- **WHEN** a content card takes focus
- **THEN** its glyph disc turns light and the glyph turns dark
- **AND** the disc is the same size as the one on the source and device tiles

#### Scenario: Mixed artwork and fallback cards
- **WHEN** library or queue cards contain loaded, absent or failed artwork
- **THEN** loaded artwork uses the same rounded picture treatment
- **AND** a fallback glyph remains available until artwork loads successfully
- **AND** failed artwork leaves the fallback rather than a broken image
- **AND** friendly titles without file extensions do not prevent the queue from deriving its fallback glyph from the media URL
- **AND** Continue progress lines remain clear of their glyph discs without changing card or section height
