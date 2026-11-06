## Purpose

Describe the implemented Home library, source configuration and remote-first browsing contract. Simulated checks establish interface behavior, not physical Samsung acceptance.

## Requirements

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

### Requirement: Subtitle sidecar compatibility
External subtitles SHALL use bounded encoding-aware reads where byte readers are available, with a 16 MiB limit and a UTF-8 fallback for unavailable readers. Supported TXT subtitles SHALL include MicroDVD, MPL2, TMPlayer and renamed SRT.

#### Scenario: Headerless MicroDVD file
- **WHEN** a MicroDVD subtitle has no explicit FPS header
- **THEN** its timing uses the documented 23.976 FPS fallback
- **AND** plain notes without supported timecodes produce no cues

### Requirement: Simultaneous subtitle positioning
Overlapping ASS cues SHALL render together using style or inline alignment. Unpositioned dialogue SHALL follow the user's subtitle position. Bottom cues SHALL retain queue/OSD clearance.

#### Scenario: Sign and dialogue overlap
- **WHEN** a top-aligned ASS sign and unpositioned dialogue are active simultaneously
- **THEN** both appear in their respective position bands
- **AND** changing subtitle position moves unpositioned dialogue without moving the sign

### Requirement: Automatic sidecar fallback
Automatic subtitle selection SHALL preserve app-language preference, explicit Off and per-file choices.

#### Scenario: Automatic sidecar fallback
- **GIVEN** no explicit global or per-file subtitle preference
- **WHEN** no available track matches the app language
- **THEN** an untagged sidecar or the sole sidecar may be selected without seeking playback
- **AND** explicit Off and per-file choices remain authoritative

### Requirement: Recursive music playback
USB, SMB and WebDAV folder context menus SHALL offer Play all music and Shuffle all music including subfolders. Scanning SHALL use the shared cancellable dialog, at most three concurrent listings, 5000 tracks, 2000 folders and depth 16. Cancellation SHALL suppress late results. Unreadable subfolders SHALL be skipped with partial-result feedback. Results SHALL use ordinary playback queue, next/previous and repeat behavior without changing the saved shuffle preference.

#### Scenario: Cancel a folder scan
- **WHEN** the viewer presses Back while a folder scan is pending
- **THEN** the originating card regains focus
- **AND** late results do not start playback or reopen a dialog

### Requirement: Folder focus continuity
Up navigation SHALL restore the child folder just left in USB, SMB and WebDAV. Fresh folder entry SHALL focus the most recently played item, or its next sibling after completion when one exists. Explicit playback-return and Up focus SHALL take precedence over history-based selection.

#### Scenario: Reopen a series folder
- **GIVEN** its most recently played episode is complete and another episode follows
- **WHEN** the folder is entered without an explicit focus target
- **THEN** focus selects the following episode without starting playback

### Requirement: Bounded browsing metadata
USB listings SHALL show cached durations in the existing metadata line without moving focus or adding a row. Cache validity SHALL depend on URI, size and modification time. Background probes SHALL be limited to two concurrent readers, 15 seconds, 256 reads and 20 MiB per file, matching the bounded Matroska header and track-element readers. Navigation and playback SHALL cancel pending probes. The disposable cache SHALL retain at most 400 records and 131072 serialized characters.

#### Scenario: Leave during metadata probing
- **WHEN** the viewer leaves a USB listing while a header read is pending
- **THEN** the reader is closed and unstarted probes are dropped
- **AND** late results do not change the new listing or write stale cache records

### Requirement: Folder history reset
USB, SMB and WebDAV folder context menus SHALL offer playback-history reset with confirmation defaulting to Cancel. Reset SHALL clear watched marks, resume positions and matching queue snapshots under that folder, including descendants. Sibling prefixes, other servers, media, pins, unrelated queue progress and playback preferences SHALL be preserved. Storage failure SHALL report failure and attempt rollback.

#### Scenario: Reset a series folder
- **GIVEN** history for Show, Show-2 and another server's Show
- **WHEN** reset is confirmed for Show on the current source
- **THEN** only that folder's history and queue progress are removed
- **AND** Back or Cancel without confirmation leaves all history unchanged

### Requirement: Compatible service startup
Packaging SHALL wrap the self-contained service and preserve lifecycle exports. Tizen 9+ SHALL attempt the service module with a bounded wait and legacy launch fallback. Older runtimes SHALL not load that module. Startup requests SHALL be coalesced and service listeners SHALL start only once. The credential proxy SHALL remain loopback-only and reject foreign or unidentified peers before route dispatch. No additional privileges SHALL be introduced.

#### Scenario: Modern module fails
- **WHEN** the service module fails to load or start
- **THEN** legacy application-control or application launch is attempted
- **AND** readiness is checked against the existing loopback ping endpoint with bounded retries
- **AND** software checks do not establish physical Tizen 10 acceptance

### Requirement: Shared content-card geometry
Home, Stream, Network, USB device roots and playback queue cards SHALL share a 16:9 outer rectangle. Rows SHALL use five equal columns inside the page insets at 1920×1080 and 1153×1297. Optional secondary labels SHALL NOT change card height. Form controls, information panels and empty-state messages are not content cards.

#### Scenario: Overflowing carousel
- **GIVEN** more than five cards in a row
- **WHEN** remote focus moves to the first or last card
- **THEN** the complete focused card and focus treatment fit inside the carousel
- **AND** idle rows settle on whole-card boundaries

### Requirement: Complete playback queue
The queue SHALL show full cards while it holds focus and a peek at the bottom of the OSD otherwise. The control bar SHALL reserve only the peek while the queue is closed and the full cards while it holds focus, so closing the queue frees the strip's unused height. Bottom-positioned subtitles SHALL follow that reserve and keep clearance above the current timeline and queue. Hiding the OSD SHALL NOT introduce a page scrollbar or shrink playback controls.

#### Scenario: Return focus to transport
- **WHEN** the viewer navigates from the queue to transport controls
- **THEN** the strip collapses to its peek and the control bar reserves only that peek
- **AND** the transport and timeline settle above the peek, freeing the height between the peek and the full strip
- **AND** the queue shows the top of its cards rather than a cropped sliver of its titles
- **AND** bottom subtitles remain clear of the current timeline

#### Scenario: Enter the queue
- **WHEN** the viewer moves focus onto a queue card
- **THEN** the strip grows to the full cards and the control bar makes room for it
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
Playlist groups and channels SHALL share an icon slot and title alignment. Compact landscape lists and playback menus SHALL use restrained density without shrinking their focused hit regions below 50px. Playlist filtering SHALL expose a live visible result count, including empty results, without adding a second filtering pass. Reflow SHALL reveal the current visible focused control without changing focus ownership.

#### Scenario: Filter a large playlist
- **WHEN** a viewer filters channels across groups
- **THEN** a visible live status reports the number of matches relative to the full playlist
- **AND** playing a match and returning retains the filter, result count and originating channel focus

#### Scenario: Resize a focused playback menu
- **WHEN** viewport reflow moves the focused option outside its scrolling body
- **THEN** the shared focus manager immediately reveals that option without refocusing it

Short landscape layouts SHALL retain readable audio metadata without overlap with the timeline, transport or queue. They MAY place artwork beside metadata while taller layouts retain the centred column. Artwork and fallback geometry SHALL agree, and OSD/queue focus changes SHALL NOT move the audio presentation. Short-screen headings MAY reduce their vertical margins while retaining shared type and horizontal insets.

#### Scenario: Audio queue in a 720px-high landscape frame
- **WHEN** audio playback presents a queue at 1280×720 or 1920×720
- **THEN** cover and metadata remain above the visible timeline with positive clearance
- **AND** moving focus into and out of the queue does not move the audio presentation

Home SHALL omit empty Continue playing and Pinned sections, including their headings and reserved space. Stream SHALL likewise omit empty Saved streams and Recent sections. The music card SHALL sit still on the screen's centre line.

#### Scenario: Empty library section
- **GIVEN** a library with no pins
- **WHEN** Home renders
- **THEN** the Pinned heading and row are absent
- **AND** Sources follows the remaining populated section, or the page heading when both optional sections are empty

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
Library pages SHALL paint the baked halftone field over the #0A0A0A page colour without a live blended layer. At reference scale, the fixed remote-hint footer SHALL fade the page into a 128px scrim and place 28px key chips 50px above the bottom edge. Key-and-label pairs SHALL stay together when hints wrap. Modals SHALL be 678px wide at reference scale with a 16px radius over a 50% scrim, and source dialogs SHALL keep their action at the bottom of the panel.

#### Scenario: Footer over the page field
- **WHEN** a library page is shown
- **THEN** the last 128px fade from the page colour into the footer colour
- **AND** the key chips sit 50px above the bottom edge

#### Scenario: Source configuration dialog
- **WHEN** a source configuration dialog opens
- **THEN** the panel keeps its action button at the bottom
- **AND** the list of discovered sources stays at the top

### Requirement: Shared wide scale
Wide viewports SHALL apply shared proportional modal, field, action, settings, browse-row, playback-overlay and status scales rather than per-form or per-page variants, without losing viewport bounds or moving discovery actions when results arrive.

#### Scenario: Wide source and management dialogs
- **WHEN** source or management dialogs render at widths of at least 2400px
- **THEN** shared panels measure 840px with 78px fields/actions and 26px field/action text
- **AND** reference and compact viewports retain their existing 678px panels and 64px controls

#### Scenario: Wide settings and remote hints
- **WHEN** Settings and its fixed remote hints render at widths of at least 2400px
- **THEN** rows measure 98px with 30px labels and 76×44 switches, and info rows and remote hints grow with them
- **AND** anchored option panels measure 675px with 34px titles and 98px rows using 30px text
- **AND** widths below 2400px retain the reference row, switch, info, hint and picker sizes

#### Scenario: Wide playback overlays
- **WHEN** playback menus or File info render at widths of at least 2400px
- **THEN** More and track panels measure 675px with 32px headings and 70px rows using 30px text
- **AND** File info measures 950px with 30px table text and retains its close action
- **AND** reference and short-frame playback retain 540px panels and their existing row heights

#### Scenario: Wide browse rows and notices
- **WHEN** non-grid browse lists, playlist counts or notices render at widths of at least 2400px
- **THEN** rows use 30px names with 80×50 icon slots and 24px metadata, counts use 20px and notices use 25px
- **AND** reference and short-frame lists retain their existing row type and count sizes

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

### Requirement: Network folder ordering
SMB, WebDAV and DLNA browsers SHALL list folders before files, each group ordered by name, and SHALL not add a synthetic ".." row. Up and Back SHALL restore the parent folder and its focused child.

#### Scenario: Browse a share with mixed entries
- **WHEN** a folder holds files and subfolders
- **THEN** every subfolder precedes every file
- **AND** no ".." row appears in the grid
- **AND** Up returns to the parent folder with the left folder focused

### Requirement: Card-row overflow
Card rows SHALL indicate horizontal overflow with a visible fade or chevron, and remote focus SHALL scroll the row with look-ahead instead of only when the focused card reaches the edge.

#### Scenario: Focus the fourth card of an overflowing row
- **WHEN** focus moves past the third visible card
- **THEN** the row scrolls so the next cards are revealed
- **AND** an overflow indicator remains visible until the row reaches its end

### Requirement: Complete page-top restoration
When the main view scrolls, moving focus to its first item SHALL scroll the view to its start so the page heading is visible.

#### Scenario: Return to the top of Settings
- **WHEN** the viewer scrolls down and moves focus back to the first settings row
- **THEN** the view scrolls to the top completely

### Requirement: Hidden empty stream sections
Stream SHALL omit the Saved streams and Recent sections, including their headings, when they hold no items.

#### Scenario: Empty stream library
- **WHEN** Stream opens with no saved and no recent streams
- **THEN** neither section heading nor empty tile is rendered

### Requirement: Shared card component
Home, Stream and explorer tiles SHALL use the same card structure and tokens for picture, title, metadata, padding, radius, focus ring and baseline.

#### Scenario: Compare a Home card with an explorer tile
- **WHEN** a Home continue card and an explorer file tile render at the same viewport
- **THEN** their padding, title baseline, disc size and focus ring agree

### Requirement: Responsive navigation motion
Focus movement SHALL not wait for animated scrolling, and view entrance SHALL animate one container rather than every child. Reduced motion SHALL keep disabling motion.

#### Scenario: Hold Down on a card row
- **WHEN** the viewer repeats Down through a long grid
- **THEN** focus moves on every keypress without queueing scroll animations

### Requirement: Interface sounds
The app SHALL offer subtle focus and activation sounds synthesized in the WebView, controlled by a Settings switch, with no audio asset download.

#### Scenario: Navigate with sounds enabled
- **WHEN** the viewer moves focus with the remote
- **THEN** a short quiet tick plays
- **AND** turning the switch off silences it immediately

### Requirement: No keyboard on view entry
Opening a view SHALL NOT focus a text field automatically; the viewer SHALL reach the field with the remote.

#### Scenario: Open Stream
- **WHEN** Stream opens
- **THEN** focus lands on Play rather than the URL field
- **AND** the on-screen keyboard stays closed

### Requirement: Network source reuse
DLNA discovery and folder listings SHALL be reused briefly after a successful read so returning to a source does not restart discovery or show an avoidable loading state.

#### Scenario: Re-enter DLNA after Home
- **WHEN** the viewer leaves a DLNA folder for Home and returns within the reuse window
- **THEN** the folder renders from the cached listing without a new SSDP search
