# Interaction and data decisions

## Screens and copy

| Page | Title | Description |
| --- | --- | --- |
| Home | Your media | Pick up where you left off, or open a source. |
| Stream | Play a link | Open a stream or send one from another device. |
| Settings | Settings | Make Tessel work your way. |
| USB | USB devices | Browse media on a connected drive. |
| Network | Network sources | Connect your media servers and shared folders. |

Use the mockups' left-aligned headers, consistent horizontal card rows, restrained borders, inset focus and fixed bottom hints. Empty rows disappear. Keep real item titles, source labels and unavailable-source icons inside cards rather than blank placeholders. Do not duplicate the player redesign.

## Card geometry and motion

Content cards use a shared outer 16:9 rectangle. Five equal columns fit inside the page's 60-pixel side insets with 24-pixel gaps at both review viewports. Home recommendations and pins, source shortcuts, saved/recent streams, network sources, device roots and queue cards use the same dimensions. Settings information panels, form controls and empty-state messages are not media cards. Settings content spans four grid columns rather than an unrelated fixed width.

Use explicit calculated width and height for TV engines without CSS aspect-ratio. Do not let optional subtitles or flex intrinsic sizing change card height. Reserve the secondary line in library cards so names line up. Carousels have focus-ring clearance and snap to whole cards. The player's queue stays fully visible while the OSD is visible rather than showing a cropped sliver. Raise subtitles above the full queue and timeline even when transport controls hold focus.

Use one 240-millisecond eased focus/motion cadence, subtle two-pixel card lift and restrained borders. Native focus must not jump before smooth nearest-edge scrolling. Reduced motion disables animations and smooth focus scrolling. Animate view contents, never the opaque view backdrop above the native video plane. Library pages use flat surfaces and a flat footer. Playback retains a softer gradient for readability over video.

The supplied `01.svg`–`13.svg` references were rendered and compared directly after they became available in `examples/`. References 01–02 and 06 define Stream and QR receipt. References 03 and 13 show Home at different scroll positions. References 04–05 and 07 define Settings controls and information panels. References 08–10 show Network cards and configuration. References 11–12 show USB empty and device states. Follow their centered circular source glyphs, restrained surfaces and borders, five-column card rhythm and QR-first modal hierarchy. Keep real titles and honest capability labels rather than copying placeholder content or green unsupported hardware claims. Omit the grain texture and keep a more compact header so complete rows clear the footer instead of copying the examples' cropped Sources/Recent rows.

## Input and lifecycle

Long OK uses a single remote-owned threshold. Short OK activates on release, holding opens one context menu, and release after a hold must not activate the item or a menu option. Ignore key repeats, cancel pending holds on blur and view changes, and preserve normal text-input behavior. Back closes a modal before navigating. Context menus restore focus to the originating item or its nearest surviving neighbor.

Back from audio and video saves progress, stops playback and restores the launch page, row, folder and focus. No background playback remains.

## Persistence

Reuse the saved-stream, favorite and server storage owners with explicit migrations. Pins reference stable source identity plus relative folder path or URL. Unavailable sources retain their pins and progress. Removing a server configuration is separate from removing its pin. Do not persist credentials into queue snapshots or display them in labels, toasts or logs.

Queues retain enough stable identity and ordering to resume an unfinished item or recommend the next unwatched item. A queue and its current file should not produce duplicate Home recommendations. Cap the aggregate at ten, newest first. Removing a recommendation must not delete the media or pin. Avoid crawling whole shares at launch.

## Availability and startup

Connect configured SMB and WebDAV sessions independently with bounded timeouts. Run one shared DLNA discovery and match only saved device IDs. Unconfigured discovered devices appear only in Add. A missing saved DLNA device must not silently select a different device. Opening a source uses its session/readiness state without blocking Home.

## Casting

Get from device opens a modal and polls only while the modal is open. Back cancels polling and restores focus. A received valid URL closes the modal and follows the normal URL launch path. Casting disabled in Settings prevents the listener from accepting links. Simulator addresses must be identified as simulated rather than presented as working external phone URLs.
