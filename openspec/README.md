# Development

Current contracts live in `specs/`. The mockup refresh is tracked in [changes/mockup-product-refresh/tasks.md](changes/mockup-product-refresh/tasks.md). Unchecked tasks are not implemented, even when the proposed specs describe them.

## Commands

Run these in the development container from the repository root. OpenSpec tooling baseline: 1.14.1.

```sh
node --test tests/tizen-app/*.test.js
bash tizen-app/build.sh
openspec validate --all --strict --no-interactive
git diff --check
```

Serve `tizen-app/` statically and open `demo.html` for the interactive simulator. `dev-player.html` redirects to that same harness rather than maintaining different interface fixtures. Simulator storage is namespaced separately from the installed application. The fake decoder does not validate real media playback. The package script emits unsigned `dist/tessel.wgt`. Re-sign with a Samsung distributor certificate matching the target TV before installing.

For annotated visual corrections, inspect the actual layout at the annotation's CSS viewport as well as 1920×1080. Check the computed cascade for normal, focus and hover states, the complete focus ring inside each scroll owner, mixed folder/file title alignment and the last focused item after scrolling. Wait for the requested route, fonts and finite transitions to settle. Source-string assertions and resized screenshots do not establish these conditions. Record any forced-state checks separately from real pointer or keyboard input.

For aesthetic polishing, compare rendered before/after images against the references first. Judge type scale, spacing, hierarchy, density and balance at each affected viewport before running regression gates. Passing tests do not establish visual quality.

Stress nested menus with long unbroken labels and enough rows to require scrolling. Confirm fixed headings cannot shrink, multiline clamps do not expose partial extra lines inside padded options, and pending discovery keeps visible native focus before results arrive. Playlist files must remain browseable without entering the folder's audio/video playback queue.

Cancel and reopen source forms while discovery is pending. An old reply must not reopen a picker, show a stale error or clear the newer request's pending state. Editing connection fields also invalidates their pending discovery. Inspect translated feedback and long hostnames inside the toast, not only inside full error dialogs.

For large-playlist navigation, check adjacent moves, the filter boundary, hidden/disabled rows and grid neighbours. Keep browser timing separate from deterministic work-count assertions and physical-TV performance. URL playlists must start a Stream trail rather than inherit the last device folder. Check icon-control names and state at initial load as well as after activation.

For card mutations, verify focus against the card that opened the menu rather than the render-time cursor. Rename keeps that card, removal selects an adjacent surviving card, and the final removal retains the empty row's height and a visible fallback. Check RTL geometry independently from script/font acceptance. Labels mirror, technical address fields and transport order do not.

The audio and video demo routes offer `default`, `queue`, `loading`, `buffering` and `error` states. Default plays one item. Queue plays the folder queue. Loading and buffering hold the simulated decoder until playback is resumed or the route changes. Error drives the application's normal playback-error callback. Scenario selection applies only to the next simulated open, so a later ordinary launch is not forced to fail. These states exercise production markup and recovery code, not a second interface fixture.

## Code map

| Concern | Owner |
| --- | --- |
| Navigation, playback orchestration, menus | `tizen-app/js/app.js` |
| Decoder and subtitle overlay | `tizen-app/js/player.js` |
| Remote dispatch and focus | `tizen-app/js/remote.js`, `ui.js` |
| USB and network browsing | `browser.js`, `smb.js`, `webdav.js`, `dlna.js` |
| LAN listeners and file proxies | `tizen-app/service/service.js` |
| Strings and visual tokens | `tizen-app/i18n/`, `css/style.css` |

The [implementation audit](references/implementation-audit.md) records confirmed gaps in prior delivery. Physical-TV checks remain separate from simulated checks.
