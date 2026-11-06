## ADDED Requirements

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
