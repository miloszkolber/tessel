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

Serve `tizen-app/` statically and open `demo.html` for the interactive simulator, or `dev-player.html` for isolated interface states. Neither decoder validates real media playback. The package script emits unsigned `dist/tessel.wgt`. Re-sign with a Samsung distributor certificate matching the target TV before installing.

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
