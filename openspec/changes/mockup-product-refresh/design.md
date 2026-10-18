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
