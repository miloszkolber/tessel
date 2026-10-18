# Implementation audit

This is an evidence-based audit of the source and conversation record available at adoption, not a complete inventory of inaccessible prior conversations. Superseded requirements are not counted as omissions.

## Confirmed omissions or incomplete delivery

| Earlier request | Finding | Evidence and repair owner |
| --- | --- | --- |
| Cast switch disables the LAN listener | The switch wrote Settings but called nonexistent `CastLink`, while the implementation is `UrlDrop.setEnabled`. Local polling could stop while the listener still accepted links. | Repaired in the first slice with service acknowledgement, startup synchronization, rejection/timeout unit tests and simulated acceptance checks. Physical listener acceptance remains unverified. |
| Cast row should show only URL and status dot | The old label was explicitly retained despite the request. Localization was cited as a reason, although the label could be removed from markup. | `index.html` cast row and prior delivery response. Superseded by switch/toast mockup. |
| No Ko-fi/support block | Removed from the interface, but the README still carried the origin donation link. | Removed during documentation consolidation in the first slice. |
| Standalone simulated end-to-end experience | The original demo shared storage with the fixture preview and used timing-based shortcut navigation. Its phone pages do not exist outside the simulator. | Repaired with namespaced simulator storage, direct production routes and explicit simulated phone receipt. `dev-player.html` now redirects to the same harness. Static HTTP serving and physical decoding checks are still required. |
| Accurate live preview page links | Simulator links originally tracked shortcut clicks rather than all remote navigation. | Repaired in `demo/boot.js` with view observation and current page/state links. Deleted the redundant `dev/start.js` fixture coordinator. |
| Remember specific DLNA device | `choice` could replace a missing pin with the only other discovered device. | Repaired with exact device-ID selection and individually saved sources. The regression test now rejects substitution. MCP Chromium verified adding one of two devices saves only that one, then permits adding the second separately. |
| Remove redundant feature documentation | README promised resume prompts, Favorites Home, recent-history controls and origin installation/release channels absent from the fork. | Replaced with concise current product/build documentation. Operational limits now live in `runtime.md`. |
| Native focus agrees with visual focus | Browse rows could receive `.focused` without being focusable, leaving native focus on the body after playback. | Repaired in `ui.js:focusOn` by making list rows focusable. Audio/video return paths verified in MCP Chromium. |
| Silent successful settings changes | Shuffle/repeat still used success toasts. | Repaired with silent icon/pressed-state updates and accessible value labels. Requested cast/debug URL notifications remain. Error and transport feedback remain intentional. |
| Browse configured WebDAV files | A render-time call to undefined `isPlayable` failed on files. The JSON helper misreported callback exceptions as malformed service responses. | Repaired with `FileTypes.isPlayable` and parsing-only exception handling. A rendered browser regression checks media-only rows, queue identity and sidecars. MCP Chromium verified playback and Back restoring the selected WebDAV file. |

## Superseded direction, not omissions

- Four-card-only Home, folder pins only sorting lists, single active network method, no recent section and background audio were explicit earlier choices. The new mockups replace these decisions.
- The previous USB-only Continue playing rule is replaced by an aggregate Home library. Missing sources now remain visibly marked instead of being hidden.

## Acceptance gaps

- Physical-TV long-OK delivery, native video-plane blur, real AVPlay resume/track behavior, DLNA captions and LAN casting/log listener acceptance require device testing.
- Prior 269 passing unit tests did not establish those outcomes. Many interface tests inspect source strings or use lightweight mocks rather than driving the complete workflow.
- No measured performance baseline supports a speed-improvement claim. Startup now has a tested limit of two concurrent SMB/WebDAV connection attempts, shared service startup, per-source connection coalescing and coalesced DLNA discovery. QR receipt has only one outstanding poll and cancels on close. These are bounded-work guarantees, not a throughput claim.

## Test simplification direction

Retained binary parser and network protocol tests. Removed five obsolete USB/Network-only Continue tests because that product contract was explicitly superseded. Their current replacement tests exercise persisted aggregate queues, completion, deduplication, the ten-item limit, dismissal and source availability. Replaced the unused preview source-string inventory assertion with a storage-isolation behavior test. Added remote hold/release/cancellation tests and a rendered WebDAV playback-handoff regression. Remaining parser and focused source-contract tests are retained rather than deleted to reach a smaller count.

## Quality-of-life follow-ups

- A per-source Retry command could expose the existing reconnect behavior more directly. It is not required to open an available source or reconnect at launch.
- Full translations of the new library copy should be reviewed by native speakers. Missing entries currently use the established English fallback rather than showing raw keys. Other-script glyph and RTL visual acceptance remain separate checks.
- Source credentials remain in the application's private local storage under the existing contract. Do not expose them in pins, queue snapshots or logs.
