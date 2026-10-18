# Implementation audit

This is an evidence-based audit of the source and conversation record available at adoption, not a complete inventory of inaccessible prior conversations. Superseded requirements are not counted as omissions.

## Confirmed omissions or incomplete delivery

| Earlier request | Finding | Evidence and repair owner |
| --- | --- | --- |
| Cast switch disables the LAN listener | The switch wrote Settings but called nonexistent `CastLink`, while the implementation is `UrlDrop.setEnabled`. Local polling could stop while the listener still accepted links. | Repaired in the first slice with service acknowledgement, startup synchronization, rejection/timeout unit tests and simulated acceptance checks. Physical listener acceptance remains unverified. |
| Cast row should show only URL and status dot | The old label was explicitly retained despite the request. Localization was cited as a reason, although the label could be removed from markup. | `index.html` cast row and prior delivery response. Superseded by switch/toast mockup. |
| No Ko-fi/support block | Removed from the interface, but the README still carries the origin donation link. | README Support section. Remove in task 4. |
| Standalone simulated end-to-end experience | Static demo still requires a server, shares storage with the fixture preview, has timing-based shortcut navigation and does not validate real decoding. Its phone pages are simulated, not usable external addresses. | `demo.html`, `demo/boot.js`, `demo/world.js`. Improve isolation and task-state navigation in task 14. |
| Accurate live preview page links | The fixture preview follows views, but simulator links track shortcut clicks rather than all remote navigation. | `dev/start.js:watchViewChanges` versus `demo/boot.js:chrome`. Repair in task 14. |
| Remember specific DLNA device | Settings persistence was repaired, but `choice` can replace a missing pin with the only other discovered device. Back also exposes all discovered servers. | `dlna.js:choice`, `goUp`. Replace with explicit saved-device identity in tasks 12–13. |
| Remove redundant feature documentation | README still promises resume prompts, Favorites Home, recent-history controls and origin installation/release channels absent from the fork. | README Features and Install. Replace with current concise documentation. |
| Native focus agrees with visual focus | Browse rows could receive `.focused` without being focusable, leaving native focus on the body after playback. | Repaired in `ui.js:focusOn` by making list rows focusable. Audio/video return paths verified in MCP Chromium. |
| Silent successful settings changes | Cast/debug toggles still use general setting toasts, and shuffle/repeat have mode toasts. | `app.js` toggle handlers. New switch URL notifications are now explicitly requested. Review remaining successful-setting toasts in task 15. |

## Superseded direction, not omissions

- Four-card-only Home, folder pins only sorting lists, single active network method, no recent section and background audio were explicit earlier choices. The new mockups replace these decisions.
- The previous USB-only Continue playing rule is replaced by an aggregate Home library. Missing sources now remain visibly marked instead of being hidden.

## Acceptance gaps

- Physical-TV long-OK delivery, native video-plane blur, real AVPlay resume/track behavior, DLNA captions and LAN casting/log listener acceptance require device testing.
- Prior 269 passing unit tests did not establish those outcomes. Many interface tests inspect source strings or use lightweight mocks rather than driving the complete workflow.
- No measured performance baseline supports a speed-improvement claim yet. Profile startup requests and card/focus rendering before adding caches or concurrency machinery.

## Test simplification direction

Retain binary parser and network protocol tests. Replace obsolete mini-player tests with playback-exit tests. Consolidate source-string UI assertions into a small set of rendered workflow checks. Do not delete a regression merely to reduce the reported count.
