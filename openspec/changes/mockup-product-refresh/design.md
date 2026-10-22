# Interaction and data decisions

## Screens and copy

| Page | Title | Description |
| --- | --- | --- |
| Home | Your media | Pick up where you left off, or open a source. |
| Stream | Play a link | Open a stream or send one from another device. |
| Settings | Settings | Make Tessel work your way. |
| USB | USB devices | Browse media on a connected drive. |
| Network | Network sources | Connect your media servers and shared folders. |

Use the mockups' left-aligned headers, consistent horizontal card rows, restrained borders, hard focus rings and fixed bottom hints. Empty sections retain their row height and name their state. Keep real item titles, source labels and unavailable-source icons inside cards rather than blank placeholders. Playback and library cards share their geometry, glyph scale and artwork treatment.

## Card geometry and motion

Content cards use a shared outer 16:9 rectangle. Five equal columns fit inside the page's 65-pixel side insets with 26-pixel gaps. At 1920px width, the cards measure approximately `337.2×189.7` and the four-column form width is `1426.8`. Home recommendations and pins, source shortcuts, saved/recent streams, network sources, device roots and queue cards use the same dimensions. Shared responsive tokens adjust their contents at wide and compact viewports. Settings information panels, form controls and empty-state messages are not media cards. Settings content spans four grid columns rather than an unrelated fixed width.

Use explicit calculated width and height for TV engines without CSS aspect-ratio. Do not let optional subtitles or flex intrinsic sizing change card height. Explorer folders reserve the same metadata baseline as files. Absent library captions collapse, while Continue queue metadata sits above the picture. Carousels have focus-ring clearance and snap to whole cards. The playback queue shows a peek until focused, then exposes full cards. Reserve its expanded height in both states so the transport and timeline stay stationary. Subtitles retain clearance above that timeline and the complete queue. Album position does not depend on OSD visibility.

Use one 240-millisecond eased focus/motion cadence, 2-pixel surface borders and hard light focus treatment. Cards add a 2-pixel outside ring with scroll-owner clearance. Pointer feedback is quieter than remote focus and never scales a surface. Native focus must not jump before smooth nearest-edge scrolling. Reduced motion disables animations and smooth focus scrolling. Animate view contents, never the opaque view backdrop above the native video plane. Playback retains a softer gradient for readability over video. Dialogs use the 678-pixel width with shared 64-pixel footer actions and 22-pixel input/action text. Configuration forms size to content. Discovery uses a stable 600-pixel panel bounded by the viewport, with a scrolling result body and fixed action. Footer hints use atomic key-and-label groups rather than independently wrapping chips and labels.

The supplied `01.svg`–`13.svg` references were rendered and compared directly after they became available in `examples/`. References 01–02 and 06 define Stream and QR receipt. References 03 and 13 show Home at different scroll positions. References 04–05 and 07 define Settings controls and information panels. References 08–10 show Network cards and configuration. References 11–12 show USB empty and device states. Follow their centered circular source glyphs, restrained surfaces and borders, five-column card rhythm and QR-first modal hierarchy. Keep real titles and honest capability labels rather than copying placeholder content or green unsupported hardware claims. The page uses their halftone field as a baked grayscale image, not a live blended layer. Focused content must scroll clear of the footer rather than copying the references' cropped rows.

## Input and lifecycle

Long OK uses a single remote-owned threshold. Short OK activates on release, holding opens one context menu, and release after a hold must not activate the item or a menu option. Ignore key repeats, cancel pending holds on blur and view changes, and preserve normal text-input behavior. Back closes a modal before navigating. Context menus restore focus to the originating item or its nearest surviving neighbor.

Back from audio and video saves progress, stops playback and restores the launch page, row, folder and focus. No background playback remains.

## Persistence

Reuse the saved-stream, favorite and server storage owners with explicit migrations. Pins reference stable source identity plus relative folder path or URL. Unavailable sources retain their pins and progress. Removing a server configuration is separate from removing its pin. Do not persist credentials into queue snapshots or display them in labels, toasts or logs.

Queues retain enough stable identity and ordering to resume an unfinished item or recommend the next unwatched item. A queue and its current file should not produce duplicate Home recommendations. Cap the aggregate at ten, newest first. Removing a recommendation must not delete the media or pin. Avoid crawling whole shares at launch.

## Availability and startup

Connect configured SMB and WebDAV sessions independently with bounded timeouts. Run one shared DLNA discovery and match only saved device IDs. Unconfigured discovered devices appear only in Add. A missing saved DLNA device must not silently select a different device. Opening a source uses its session/readiness state without blocking Home.

## Consolidated visual evidence

Task 31 extends the review to compact landscape. At heights up to 900px, audio uses a shared artwork/details row sized against the expanded queue reserve, even during single-item playback or hidden OSD. Cover and fallback share dimensions. Above that breakpoint the existing centred column remains. Short page headings reduce vertical margins rather than changing the reference-size typography or horizontal insets. Dialog fields now use the common input fill/border tokens, and labelled source fields keep 44px of scroll margin above the input so its label remains visible when focused.

The 1280×720 before image showed the timeline crossing the cover and transport obscuring metadata. After correction, the 216px cover and metadata occupy y=87.15625–303.15625 with 31.171875px clearance to the visible timeline. At 1920×720 clearance is 24.015625px. Native Down plus focus changes preserve identical album/timeline bounds through queue peek/open/return. At 1920×1080 the original y=217.390625–603.390625 album and approximately 19px clearance remain unchanged. Geometry was also checked at 1920×900, 1153×1297 and 3029×1704. Rendered fallback/long-title probes at compact size remain bounded and ellipsised. These are DOM fixtures, not decoded metadata failures. Short Settings and SMB forms were inspected before/after, including focused Share with its label retained after scrolling. Physical input/TV acceptance remains open.

Task 30 uses the production interface in MCP Chromium through `demo.html`, at 100% zoom in the monochrome theme. Reference, compact and wide CSS viewports are 1920×1080, 1153×1297 and 3029×1704. Short-height stress uses 1920×600. Tasks 27–29 retain preceding rendered comparisons. Screenshots were inspected during review, not committed as baselines. This is acceptance of the listed browser conditions, not whole-product or physical-TV acceptance.

| Active library requirement | Evidence and result | Limit |
| --- | --- | --- |
| Home library | Current reference Home review retains clear empty rows, centred shortcuts and card rhythm. Tasks 24–29 retain mutation and artwork comparisons. | No new pin mutation in task 30. |
| Context actions | Task 29 compares management/source forms, common field/action geometry and Rename selection. Earlier keyboard flows retain card identity. | Physical typing/VKB unverified. |
| Stream library and URL receipt | Current compact Stream and reference QR reviews retain action hierarchy, bounded address and shared waiting ring. | Real phone receipt not rechecked. |
| Saved network sources | Current compact Network proportions remain consistent. Deferred discovery keeps panel top 240, height 600 and action top 742 across pending/results. Fourteen long results scroll to the last row at short height. Empty compact state stays bounded. Cancel rejects a late reply. | Temporary simulator replies, not real LAN discovery. |
| Settings capability reporting | Current compact codec statuses stay on one line after column rebalancing. Tasks 27/21 retain hierarchy, row rhythm and scrolling evidence. | Not hardware capability certification. |
| Shared content-card geometry | Tasks 27–29 compare discs, artwork, text scale and proportions at three sizes. Current Home, Stream, Network and USB review preserves them. | Physical display/fonts unverified. |
| Complete playback queue | Current video probes preserve transport/timeline bounds across peek/focus/return at three sizes. Reference transport remains y=680.328125–776.328125. Actual USB → Music → audio flow keeps album y=217.390625–603.390625 and approximately 19px timeline clearance in both queue states. One Back restores Music/file focus and decoder IDLE. | Simulator decoder. Two-line subtitle clearance of 52px compact/reference and 23px wide is a forced DOM cue, not a decoded track. |
| Readable playback popups | Task 28 rendered comparisons cover opaque surfaces, transport-relative anchors, nested hierarchy and long labels. | Not a new menu walkthrough in task 30. |
| Stable page rhythm | Current discovery and USB refresh keep geometry/focus stationary. Compact English footer fits one row. French-label wrapping retains key/label pairs. | French probe changes temporary DOM labels only. |
| Playback failure hierarchy | Tasks 28/22 retain readable diagnostics, opaque failure and reachable recovery comparisons. | No hardware failure injection. |
| Restrained motion | Current rings/quiet hover reuse the shared cadence. Existing view/menu and reduced-motion software coverage passes. | Hover uses rendered selector emulation. OS preference and TV performance unverified. |
| Reference surface and focus treatment | Current explorer hover emulation remains quieter than remote focus without scaling. Native Enter exercises USB recovery. Tasks 20–29 retain ring/selection evidence. | Not physical pointer acceptance. |
| Page field, footer strip and modal | Current atomic footers remove inherited chip spacing and orphaned labels. Discovery stays bounded with a fixed action at short height. Tasks 27–29 retain field/modal comparisons. | Screen-reader acceptance unverified. |
| One icon disc | Tasks 27–29 retain common library/queue fallback, artwork and disc comparisons. Current cross-page review preserves them. | No additional icon inventory claimed. |
| Storage recovery | Native Enter shows Loading with stable top 437.390625/height 202 and busy focus, then focuses the returned drive. Compact failure probe renders angle-bracket diagnostics literally. Regression executes duplicate suppression and text handling. | Temporary root fixtures. Physical hotplug unverified. |

The software gate passes 346 tests, unsigned packaging, strict specification validation (3/3) and whitespace checks. Review-only styles are absent, playback flags are cleared, decoder is IDLE and four saved simulator storage keys are restored. Physical Samsung AVPlay/performance, OpenChamber desktop UI, screen readers, native-script/fonts, physical text entry and OS-level reduced motion remain open.

## Casting lifecycle

Get from device opens a modal and polls only while the modal is open. Back cancels polling and restores focus. A received valid URL closes the modal and follows the normal URL launch path. Casting disabled in Settings prevents the listener from accepting links. Simulator addresses must be identified as simulated rather than presented as working external phone URLs.
