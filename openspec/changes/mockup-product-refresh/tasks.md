# Tasks

## Foundation and audit

- [x] 1. Inspect mockups, source, history, releases and current documentation. Confirm Back stops audio and approve fresh-root history/release cleanup.
- [x] 2. Initialize OpenSpec without generated agent tooling and record baseline contracts, proposed requirements, design and this ledger.
- [x] 3. Back up complete Git history and release metadata outside the repository before destructive changes.
- [x] 4. Shorten README, remove stale origin explorations and preserve current operational guidance and licenses.

## Shared interactions and playback

- [x] 5. Implement and verify long-OK context menus with no accidental activation, repeat handling, blur cancellation and focus restoration.
- [x] 6. Remove mini-player/background audio code, markup, styles and stale tests. Verify Back stops audio/video and restores origin.

## Product screens

- [x] 7. Implement Home pins for roots, folders, network sources and URLs, with unavailable-source indicators.
- [x] 8. Persist unfinished queues and aggregate Home recommendations across all sources, deduplicated and capped at ten, removable via context menu.
- [x] 9. Rebuild Stream saved/recent cards, automatic names, rename/manage/pin menus and QR listening modal with cancellation.
- [x] 10. Rebuild Settings to match mockups. Remove permanent cast/log link rows, use switches, show URLs in enable toasts, repair actual listener toggling and verify failure states.
- [x] 10.1. Deliver switch controls, enable URL toasts, acknowledged listener setting, startup synchronization, left-aligned heading/copy and removal of old link rows. Verify simulator toggles and unit-test service acknowledgement, timeout and rejection.
- [x] 10.2. Finish separate device/codec/protocol panel styling, capability-claim review and keyboard-only scroll acceptance at both target viewports.
- [x] 11. Rebuild USB device cards and empty state, root/folder context menus and launch-origin restoration.
- [x] 12. Replace single-method Network navigation with multiple saved-source cards and Add method/configuration modal. Migrate old credentials and DLNA selection without dropping sources.
- [x] 13. Connect saved sources at launch without blocking Home. Verify separate DLNA device identity and missing-source recovery.
- [x] 14. Apply shared card/form/focus styles and compact page copy, update translations, simulator states and preview navigation. New copy uses the established English fallback where a reviewed translation is absent.

## Review and publication

- [x] 15. Complete source/runtime audit and list prior skipped requirements separately from superseded decisions and hardware acceptance gaps.
- [x] 16. Consolidate redundant tests around observable contracts. Keep parser, network, remote and persistence regression coverage. Record before/after test scope and performance evidence.
- [ ] 17. Verify complete flows and mockup fidelity at 1920×1080 and the annotated viewport in MCP Chromium. Run tests, package build and OpenSpec validation.
- [x] 18. Replace inherited release workflow/install links and deployment bindings. Publish the authorized fresh-root snapshot using a guarded push, delete old releases/tags, verify remote ancestry and independence.
- [ ] 19. Sync verified requirements into main specs and archive only when the entire change is complete.

## Verified checkpoint

The foundation is published. The product implementation now includes Home pins and persisted queue recommendations, shared long-OK/dialog handling, saved/recent Stream cards and cancellable URL receipt, USB root cards, multiple Network sources and per-device DLNA persistence. Software checks below passed. Final visual acceptance and archival remain open rather than treating simulated checks as physical-TV acceptance.

- Unit suite: 280 passing. From the 270-test first-slice checkpoint, removed five obsolete per-source Continue assertions and replaced the unused preview source inventory assertion with a storage-isolation behavior test. Added queue/recents persistence, pin identity, source availability, bounded startup, remote hold lifecycle and rendered WebDAV regressions. Parser/network coverage was retained. No measured speed-improvement claim is made.
- MCP Chromium: Back after seeking audio returns to `/removable1/Music` with decoder IDLE and native focus on the originating file. Video similarly returns to `/removable1/Films`. No mini-player element exists. Settings contains exactly three controls. Casting off rejects simulated sends. Enabling casting/logging toasts their URLs.
- Package build and strict OpenSpec validation pass. Physical TV acceptance remains unverified.
- MCP Chromium integration: short OK launches once on release. A hold opens one menu, release leaves it open, and Back restores the same card. Home playback returns Home with decoder IDLE. Stream Save derives a name, Rename persists it, and URL pins retain the full address. Cancelling QR receipt stops polling. Receipt plays a simulated sent URL and Back returns Stream. Network permits separate addition of two discovered DLNA devices, multiple SMB sources and WebDAV. WebDAV playback returns to the selected file with decoder IDLE.
- Layout inspection covered Home, Stream, USB, Network, Settings and dialogs across 1920×1080 and 1153×1297 in MCP Chromium. Repaired Home source-row flex clipping and aligned source icons after inspection. Settings information panels are reachable with Down and scroll above the footer at both viewports. Exact final mockup acceptance, other-script glyph/RTL review and physical-TV checks remain open under task 17.
- Synced implemented library requirements into `openspec/specs/library/spec.md`. The active delta is retained as a modification for final acceptance. Task 19 remains open because this change has not been archived.
- Repository reset: `3bbbbbd` is a new parentless baseline. A guarded force push replaced the old main. GitHub reports `isFork=false` and no parent. Both releases and remote tags were deleted. The complete old history, release metadata and binaries were retained in an offline recovery backup. MIT attribution remains. Existing clones must re-clone or deliberately reset rather than merge old ancestry back into main.
