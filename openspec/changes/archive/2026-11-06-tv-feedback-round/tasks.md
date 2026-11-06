# Tasks

- [x] 1. Remove the ".." rows from SMB, WebDAV and DLNA browsing and verify Up/Back still restores the parent folder and focus.
- [x] 2. Sort folders before files in SMB, WebDAV and DLNA listings; extend simulator network fixtures with more file examples.
- [x] 3. Hide empty Saved streams and Recent sections on Stream, matching the Home optional-section rule.
- [x] 4. Add card-row overflow affordance and look-ahead scrolling; reveal the complete top of a scrollable view.
- [x] 5. Reuse the shared card structure for browse tiles so Home, Stream and explorer cards render with one component and one metric set.
- [x] 6. Remove the loader panel background and stop focusing inputs when a view opens.
- [x] 7. Make focus moves immediate, reduce entrance animation to the view container and shorten the shared cadence.
- [x] 8. Add optional interface sounds with a Settings switch and translated label.
- [x] 9. Proxy DLNA header and subtitle reads through the loopback service and verify embedded MKV tracks are listed and extractable.
- [x] 10. Cache DLNA discovery and folder listings for re-entry without a new search.
- [x] 11. Translate every remaining string into every offered language.
- [x] 12. Run tests, strict OpenSpec validation, package build and MCP Chromium checks; deploy to the TV and record evidence.

Verification notes:
- MCP Chromium 1920x1080: Network browse lists Films, Music, Series before the files, with no ".." row; Up/Back still returns to the parent.
- Home with an eight-card fixture reports `data-overflow="end"`, shows the chevron after its fade, and five Right presses leave the next card visible with the row scrolled 726px. Returning Up from a scrolled Home restores `scrollTop` 0 and the heading to y=81.
- Stream with empty stores hides both section headings and tiles; Stream focus lands on Play, not the URL field.
- The loading state has a transparent spinner with no panel background or outline.
- The Settings switch toggles `uiSounds` and repaints its checked state.
- 386/386 tests pass, including locale completeness (289 keys in every file), the DLNA range proxy's CORS/range forwarding and rejection of non-http targets, and the player's probe-URL header read.
- Physical-TV checks for the DLNA range proxy and the discovery/listing reuse remain pending deployment.

Physical verification (TV, after the service restart):
- Opening Jane the Virgin S03E03 from DLNA now lists the embedded English (CC) and French tracks and paints their cues.
- The TV rejected the range proxy with HTTP 404 while the previous service process was still running. The app falls back to the server URL, but a service-code update needs the TV service restarted (a full power cycle) before the proxy is available; the old app session also had to be reopened so the header read ran against the new service.
- Debug log publishing now targets the LAN service listener (port 8129) where `/debug/log` exists; it previously posted to 8127 and was dropped.
