'use strict';

/* The mockup reference (examples/*.svg) defines one visual contract:
 * a textured #0A0A0A page, 2px surface outlines, a hard 4px focus ring,
 * a 128px footer scrim with 28px key chips and a 678px modal.  These tests
 * hold that contract so a later tweak does not quietly drift from it. */

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var path = require('node:path');
var ROOT = path.join(__dirname, '../../tizen-app');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function css() { return read('css/style.css'); }
function rule(source, selector, length) {
    var at = source.indexOf('\n' + selector);
    at = at >= 0 ? at + 1 : (source.startsWith(selector) ? 0 : -1);
    assert.ok(at >= 0, 'missing rule ' + selector);
    return source.slice(at, at + (length || 400));
}

test('the page carries the reference halftone field as a baked image', function () {
    var texture = path.join(ROOT, 'assets/texture-halftone.png');
    assert.ok(fs.existsSync(texture), 'texture asset present');
    var view = rule(css(), '.view {', 800);
    assert.ok(view.indexOf('url("../assets/texture-halftone.png")') >= 0, 'view paints the texture');
    assert.ok(view.indexOf('/ 100% 100%') >= 0, 'texture fills the page');
    assert.ok(css().indexOf('mix-blend-mode') < 0, 'no live blend layer over the page');
});

test('every focusable surface shares one hard ring, not a soft halo', function () {
    var source = css();
    assert.ok(source.indexOf('--focus-halo') < 0, 'the soft halo token is gone');
    assert.ok(source.indexOf('--focus-ring:  #f4f4f4') >= 0, 'one focus colour');
    var card = rule(source, '.media-card.focused,');
    assert.ok(card.indexOf('border-color: var(--focus-ring)') >= 0, 'light border');
    assert.ok(card.indexOf('background: var(--bg-card-h)') >= 0, 'focused fill');
    assert.ok(card.indexOf('box-shadow: 0 0 0 2px var(--focus-ring)') >= 0, '2px ring outside the border');
});

test('surfaces carry the reference 2px outline', function () {
    var source = css();
    assert.ok(source.indexOf('--surface-border: #303030') >= 0, 'surface outline colour');
    assert.ok(source.indexOf('--input-border:   #464646') >= 0, 'input outline colour');
    assert.ok(rule(source, '.media-card {').indexOf('border: 2px solid var(--surface-border)') >= 0, 'card outline');
    assert.ok(rule(source, '.dialog-option {').indexOf('border: 2px solid var(--surface-border)') >= 0, 'option outline');
    assert.ok(rule(source, '.settings-row {').indexOf('border: 2px solid var(--surface-border)') >= 0, 'row outline');
});

test('the five-column card grid keeps the reference geometry', function () {
    var source = css();
    assert.ok(source.indexOf('--page-inset: 65px') >= 0, 'page inset');
    assert.ok(source.indexOf('--card-gap: 26px') >= 0, 'card gap');
    assert.ok(source.indexOf('--card-width: calc((100vw - 130px - 104px) / 5)') >= 0, 'five columns');
    assert.ok(source.indexOf('--card-height: calc((100vw - 130px - 104px) / 80 * 9)') >= 0, '16:9 card');
    assert.ok(Math.abs(337.2 - (1920 - 130 - 104) / 5) < 0.01, 'card width at 1920');
    assert.ok(Math.abs(1.7778 - 337.2 / ((1920 - 130 - 104) / 80 * 9)) < 0.001, 'card ratio');
});

test('the footer is a 128px scrim with 28px key chips', function () {
    var hint = rule(css(), '.hint {', 600);
    assert.ok(hint.indexOf('padding: 50px 64px 50px 0') >= 0, 'chips sit 50px above the bottom edge');
    assert.ok(hint.indexOf('linear-gradient(to bottom, rgba(10,10,10,0), rgba(10,10,10,1))') >= 0, 'scrim');
    var key = rule(css(), '.key {', 400);
    assert.ok(key.indexOf('height: 28px') >= 0, 'chip height');
    assert.ok(key.indexOf('border-radius: 4px') >= 0, 'chip radius');
    assert.ok(key.indexOf('background: rgba(255,255,255,.078)') >= 0, 'chip fill');
});

test('the page heading uses the reference type scale', function () {
    var source = css();
    assert.ok(rule(source, '.page-heading h1').indexOf('font-size: 52px') >= 0, 'title size');
    assert.ok(rule(source, '.page-heading h1').indexOf('font-weight: 600') >= 0, 'title weight');
    assert.ok(source.indexOf('font-weight: 700') < 0, 'no weight above 600 anywhere');
    assert.ok(rule(source, '.page-heading p').indexOf('font-size: 28px') >= 0, 'description size');
    assert.ok(rule(source, '.page-heading p').indexOf('color: var(--fg-soft)') >= 0, 'description colour');
    assert.ok(source.indexOf('#view-home .page-heading {') < 0, 'one heading rhythm for every page');
});

test('dialogs use the reference 678px modal', function () {
    var dialog = rule(css(), '.dialog-card {', 400);
    assert.ok(css().includes('--dialog-width: 678px'), 'reference modal width');
    assert.ok(dialog.includes('width: var(--dialog-width)'), 'shared responsive modal width');
    assert.ok(css().includes('--dialog-width: 840px'), 'wide modal scale');
    assert.ok(dialog.indexOf('border-radius: 16px') >= 0, 'modal radius');
    assert.ok(rule(css(), '.dialog-scrim {').indexOf('rgba(0,0,0,.5)') >= 0, 'scrim opacity');
});

test('the receipt dialog waits with a ring, like the reference', function () {
    var source = read('js/library-ui.js');
    assert.ok(source.indexOf("el('span', 'spinner-ring')") >= 0, 'waiting ring');
    assert.ok(css().indexOf('.status-line .spinner-ring') >= 0, 'receipt and discovery share inline ring styling');
});

test('the receipt dialog carries no simulator form', function () {
    var source = read('js/library-ui.js');
    assert.ok(source.indexOf('Simulator.castSend') < 0, 'the app does not build a send form');
    assert.ok(source.indexOf("'input'") < 0, 'the receipt dialog has no input');
    var demo = read('demo/boot.js');
    assert.ok(demo.indexOf('Simulator.castSend') >= 0, 'the simulator phone sends instead');
});

test('the music card sits still on the centre line', function () {
    var source = css();
    assert.ok(source.indexOf('audio-drift') < 0, 'the cover does not drift');
    var card = rule(source, '.audio-card {', 400);
    assert.ok(card.indexOf('left: 50%') >= 0, 'centred horizontally');
    assert.ok(card.indexOf('translate(-50%, -50%)') >= 0, 'centred vertically');
    assert.ok(card.includes('width: 600px'), 'track metadata has a bounded reading column');
    assert.ok(rule(source, '.audio-title {', 250).includes('text-overflow: ellipsis'), 'long titles cannot grow into the controls');
});

test('opening playback presents one readable status surface over album metadata', function () {
    var spinner = rule(css(), '.spinner {', 500).split('}')[0];
    assert.ok(spinner.includes('background: var(--bg-card)'), 'opening status does not collide with underlying text');
    assert.ok(read('index.html').includes('id="spinner" role="status" aria-live="polite"'), 'status is announced without announcing the decorative ring');
});

test('the queue is a peek until it holds focus', function () {
    var source = css();
    var up = rule(source, '.up-next {', 600);
    assert.ok(up.indexOf('position: absolute') >= 0, 'out of the transport flow');
    assert.ok(up.indexOf('max-height: var(--queue-peek)') >= 0, 'peek by default');
    assert.ok(source.indexOf('.up-next:focus-within { max-height: var(--queue-open); }') >= 0, 'opens on focus');
    assert.ok(source.includes('body.has-queue { --queue-reserve: var(--queue-open); }'), 'both states reserve the full strip so transport does not move');
    assert.ok(!source.includes('body.has-queue.up-next-open { --queue-reserve:'), 'queue focus cannot change transport reservation');
    assert.ok(source.includes('--queue-open: calc(var(--card-height) + 66px)'), 'large-viewport cards fit in the open queue');
    var special = source.indexOf('body.player-osd-visible .audio-card');
    assert.ok(special < 0, 'the album cover does not jump when the OSD fades in');
});

test('an empty section keeps its place on the page', function () {
    var source = css();
    assert.ok(source.indexOf('.card-row.empty') >= 0, 'empty row styling');
    assert.ok(source.indexOf('min-height: calc(var(--card-height) + 24px)') >= 0, 'same height as a filled row');
    var ui = read('js/library-ui.js');
    assert.ok(ui.indexOf("list.classList.toggle('empty', empty)") >= 0, 'the row says it is empty');
    assert.ok(ui.includes("el('p', 'empty-state', message)"), 'the empty message is real readable content rather than a CSS pseudo-element');
    assert.ok(!source.includes('.card-row.empty::after'), 'no duplicate generated message');
    var empty = rule(source, '.empty-state {', 500).split('}')[0];
    assert.ok(empty.includes('height: var(--card-height)') && empty.includes('width: var(--card-width)'), 'the status tile uses the same geometry as a populated card');
    assert.ok(ui.indexOf('saved.noSaved') >= 0, 'the saved section names its empty state');
});

test('one button component, not a pill with a scale', function () {
    var source = css();
    var btn = rule(source, '.btn {', 500);
    assert.ok(btn.indexOf('border: 2px solid var(--input-border)') >= 0, 'the reference outline');
    assert.ok(btn.indexOf('border-radius: 8px') >= 0, 'the reference radius');
    assert.ok(btn.indexOf('min-height: 62px') >= 0, 'the reference height');
    assert.ok(source.indexOf('transform: scale(') < 0, 'no scale on focus');
    assert.ok(rule(source, '.btn.primary {', 200).indexOf('background: var(--focus-ring)') >= 0, 'the primary fills with the focus colour');
});

test('the picker is a modal whose action stays at the bottom', function () {
    var source = css();
    var picker = rule(source, '.picker {', 700);
    assert.ok(picker.includes('width: var(--dialog-width)'), 'picker shares the reference modal width token');
    assert.ok(picker.indexOf('border: 2px solid var(--surface-border)') >= 0, 'the surface outline');
    assert.ok(picker.indexOf('display: flex; flex-direction: column') >= 0, 'the panel is a column');
    assert.ok(rule(source, '.picker ul {', 300).indexOf('overflow-y: auto') >= 0, 'the list scrolls');
    assert.ok(rule(source, '.picker li {', 300).indexOf('min-height: 78px') >= 0, 'the reference row height');
});

test('the removed duplicate surfaces are gone', function () {
    var source = css();
    assert.ok(source.indexOf('.brand') < 0, 'the brand block is gone');
    assert.ok(source.indexOf('.support-block') < 0, 'the cast support block is gone');
    assert.ok(source.indexOf('.presets') < 0, 'the preset chips are gone');
    assert.ok(source.indexOf('#view-image') < 0, 'the picture viewer is gone');
    assert.ok(source.indexOf('#view-text') < 0, 'the text viewer is gone');
    assert.ok(read('index.html').indexOf('view-cast') < 0, 'the cast page is gone');
});

test('resume cards lead with the progress line, so titles align', function () {
    var source = css();
    assert.ok(rule(source, '.continue-card .card-description', 300).indexOf('order: -1') >= 0, 'the meta line sits above the picture');
    assert.ok(source.indexOf('.media-card .card-description:empty { display: none; }') >= 0, 'an absent subtitle reserves nothing');
    var ui = read('js/library-ui.js');
    assert.ok(ui.indexOf("c.classList.add('continue-card')") >= 0, 'the continue row marks its cards');
});

test('the page title stays put; the row heading carries the trail', function () {
    ['app.js', 'smb.js', 'webdav.js', 'dlna.js'].forEach(function (f) {
        var src = read('js/' + f);
        assert.ok(src.indexOf("browse-title').textContent =") < 0, f + ' does not own the page title');
    });
    var app = read('js/app.js');
    assert.ok(app.indexOf("usbBreadcrumbs(dir)") >= 0, 'the USB flow passes its trail');
    assert.ok(read('js/smb.js').indexOf("setBrowsePage('network', crumbs)") >= 0, 'SMB names its surface');
    assert.ok(read('js/webdav.js').indexOf("setBrowsePage('network', crumbs)") >= 0, 'WebDAV names its surface');
    assert.ok(read('js/dlna.js').indexOf("setBrowsePage('network', crumbs)") >= 0, 'DLNA names its surface');
    var heading = rule(css(), '.device-heading {', 240).split('}')[0];
    assert.ok(heading.includes('display: block'), 'the heading shows on every browse page');
    assert.ok(heading.includes('text-overflow: ellipsis'), 'a long trail cannot overflow the page');
    assert.ok(app.includes('heading.title = heading.textContent'), 'the complete trail stays available');
});

test('playlist rows bound long names and reuse the Stream field geometry', function () {
    var source = css();
    var input = rule(source, '#view-url .url-input-wrap input, .playlist-filter input {', 500).split('}')[0];
    assert.ok(input.includes('height: 78px') && input.includes('border: 2px solid var(--input-border)'), 'one field silhouette');
    ['.browse-list {', '.playlist-filter {'].forEach(function (selector) {
        assert.ok(rule(source, selector, 400).split('}')[0].includes('max-width: var(--form-width)'), 'list and filter follow the shared form column');
    });
    ['.browse-list:not(.grid) .name {', '.browse-list:not(.grid) .meta {'].forEach(function (selector) {
        var row = rule(source, selector, 300).split('}')[0];
        assert.ok(row.includes('min-width: 0') && row.includes('text-overflow: ellipsis'), 'long labels cannot widen the row');
    });
    assert.ok(read('index.html').includes('data-i18n-aria-label="playlist.filter"'), 'filter has a translated accessible name beyond its placeholder');
});

test('playback option rows share bounded multiline labels and announced selection', function () {
    var source = css(), start = source.indexOf('#view-player .track-level li, #view-player .track-section li, .player-view #picker li {');
    var labels = source.slice(start, source.indexOf('}', start));
    assert.ok(labels.includes('white-space: normal'), 'long track and option labels can wrap');
    var text = rule(source, '.option-label {', 400).split('}')[0];
    assert.ok(text.includes('-webkit-line-clamp: 3') && text.includes('overflow: hidden'), 'the unpadded inner label owns the three-line clamp, avoiding partial-line bleed');
    assert.ok(rule(source, '.track-level > h2, #view-player .track-menu > h2 {', 400).split('}')[0].includes('flex: 0 0 auto'), 'long lists cannot collapse the menu heading');
    var html = read('index.html');
    ['audio-tracks', 'subtitle-tracks', 'more-level-options', 'track-level-options'].forEach(function (id) {
        assert.ok(html.includes('id="' + id + '" role="menu" aria-labelledby='), 'choice lists have an accessible name');
    });
    assert.ok(html.includes('id="toast" class="toast hidden" role="status"'), 'form feedback is announced without taking focus');
});

test('playback popups follow the wide shell while reference menus keep their rhythm', function () {
    var source = css();
    var wide = source.slice(source.indexOf('@media (min-width: 2400px)'));
    assert.ok(wide.indexOf('#view-player .track-menu { width: 675px; padding: 30px; }') >= 0, 'wide popup width');
    var wideRowsAt = wide.indexOf('#view-player .track-level li, #view-player .track-section li, .player-view #picker li {');
    assert.ok(wideRowsAt >= 0, 'wide popup row selector');
    var wideRows = wide.slice(wideRowsAt, wide.indexOf('}', wideRowsAt));
    assert.ok(wideRows.includes('min-height: 70px') && wideRows.includes('font-size: 30px'), 'wide popup rows');
    assert.ok(wide.indexOf('#view-player .more-option { min-height: 70px; padding: 16px 22px; font-size: 30px; }') >= 0, 'wide More rows');
    assert.ok(wide.indexOf('#view-player .sync-control { min-height: 70px; padding: 16px 22px; font-size: 30px; }') >= 0, 'wide sync control');
    assert.ok(wide.indexOf('#view-player .track-menu.file-info { width: 950px; padding: 40px; }') >= 0, 'wide info panel');
    assert.ok(wide.indexOf('#view-player .file-info dl { font-size: 30px; gap: 16px 50px; }') >= 0, 'wide info table');
    var referenceRows = rule(source, '#view-player .track-section li, #view-player .more-option, .player-view #picker li,', 280).split('}')[0];
    assert.ok(referenceRows.includes('min-height: 56px') && referenceRows.includes('font-size: 26px'), 'reference popup rows');
    assert.ok(rule(source, '#view-player .track-menu {', 180).includes('width: 540px'), 'reference popup width');
    assert.ok(rule(source, '.track-menu {', 300).includes('padding: 24px'), 'reference popup padding');
});

test('status feedback wraps long diagnostics and uses shared reduced-motion-aware entrance styling', function () {
    var source = css(), toast = rule(source, '.toast {', 800).split('}')[0];
    assert.ok(toast.includes('overflow-wrap: break-word') && toast.includes('word-break: break-word'), 'an unbroken host name cannot paint outside the notice');
    assert.ok(toast.includes('width: max-content') && toast.includes('max-width: 70%'), 'centred notices use their available reading width rather than shrink-to-fit half the screen');
    assert.ok(toast.includes('pointer-events: none'), 'noninteractive status cannot steal a pointer action');
    assert.ok(source.includes('.toast:not(.hidden) { animation: view-enter var(--motion) var(--ease); }'), 'notices share the existing finite entrance fade');
});

test('reading-direction styles mirror labels without reversing technical inputs or transport', function () {
    var source = css(), html = read('index.html');
    ['.browse-list {', '.settings-row {', '.picker {'].forEach(function (selector) {
        assert.ok(rule(source, selector, 600).split('}')[0].includes('text-align: start'), 'labels follow the reading direction');
    });
    ['smb-host', 'smb-port', 'dav-url', 'url-input', 'saved-url'].forEach(function (id) {
        assert.ok(html.includes('id="' + id + '" dir="ltr"'), 'technical input keeps its left-to-right editing direction');
    });
    assert.ok(source.includes('[dir="rtl"] .browse-list li > * + * { margin-left: 0; margin-right: 24px; }'), 'playlist row spacing mirrors with its icons');
    assert.ok(source.includes('[dir="rtl"] .browse-list.grid li > * + * { margin-right: 0; }'), 'grid children do not inherit row spacing');
    assert.ok(source.includes('[dir="rtl"] .picker li.active::before { margin-right: 0; margin-left: 8px; }'), 'the selected marker keeps its inner gap in RTL');
    assert.ok(rule(source, '.controls {', 400).includes('direction: ltr'), 'transport order stays unchanged');
});

test('a toggle row paints itself as a switch', function () {
    var source = css();
    var html = read('index.html');
    assert.ok(rule(source, '.settings-switch {', 400).indexOf('border-radius: 24px') >= 0, 'the track shape');
    assert.ok(rule(source, '.settings-switch.on {', 200).indexOf('background: var(--accent)') >= 0, 'lit when on');
    ['smb-anon', 'dav-insecure'].forEach(function (id) {
        assert.ok(html.indexOf('id="' + id + '" role="switch"') >= 0, id + ' is a switch');
    });
});

test('the language choice opens a menu under its row', function () {
    var source = css();
    var anchored = rule(source, '.picker.anchored {', 500);
    assert.ok(anchored.indexOf('transform: none') >= 0, 'no centring transform');
    assert.ok(source.indexOf('.picker.anchored > .btn.ghost { display: none; }') >= 0, 'no footer button');
    var app = read('js/app.js');
    assert.ok(app.indexOf("document.querySelector('[data-action=\"setting-ui-lang\"]')") >= 0, 'the row is the anchor');
    assert.ok(app.indexOf("panel.classList.toggle('anchored', !!anchorRow)") >= 0, 'openPicker mounts the anchored mode');
});

test('explorer pictures fill the card above the name instead of hugging its corner', function () {
    var source = css();
    var icon = rule(source, '.browse-list.grid .icon {', 300);
    assert.ok(icon.includes('flex: 1 1 0'), 'picture area uses the available card height');
    assert.ok(icon.includes('width: 100%'), 'disc is centred across the card');
    assert.ok(source.includes('.browse-list.grid .icon::before'), 'disc is independent of picture layout');
    assert.ok(rule(source, '.browse-list.grid .name {', 500).includes('margin-bottom: calc(var(--card-meta-size) * 1.25 + 6px)'), 'folders reserve the same responsive metadata line as files');
    var meta = rule(source, '.browse-list.grid .meta {', 500).split('}')[0];
    assert.ok(meta.includes('font-size: var(--card-meta-size)') && meta.includes('line-height: 1.25'), 'metadata occupies one bounded responsive line');
    assert.ok(source.includes('.browse-list:not(.grid) li:last-child { border-bottom: 0; }'), 'last tile keeps all four borders');
    assert.ok(!source.includes('.browse-list li.watched-item .icon { opacity:'), 'watched focus disc retains its contrast');
});

test('unavailable-source badges use the card corner rather than covering shortcut glyphs', function () {
    var source = read('js/library-ui.js');
    assert.ok(source.includes('b.appendChild(warning)'), 'warning is positioned against the card');
    assert.ok(!source.includes('image.appendChild(warning)'), 'warning cannot cover the centred icon disc');
    assert.ok(css().includes('.missing-source,\n.browse-list.grid li.is-fav .fav-mark,'), 'availability and explorer marks share the badge geometry');
});

test('scroll owners reserve space for the outside focus ring', function () {
    var source = css();
    ['.browse-list.grid {', '.dialog-body {'].forEach(function (selector) {
        var block = rule(source, selector, 650).split('}')[0];
        assert.ok(block.includes('padding: 4px'), selector + ' has a ring gutter');
        assert.ok(block.includes('margin: -4px'), selector + ' preserves content alignment');
    });
    assert.ok(rule(source, '.settings-content {', 650).includes('padding: 4px 4px 24px'), 'settings focus also clears the scrollport');
});

test('source forms size to content and use one label/input scale', function () {
    var source = css();
    assert.ok(rule(source, '.source-dialog .dialog-card {', 200).includes('height: auto'), 'no fixed-height empty form body');
    assert.ok(rule(source, '.dialog-body > .settings-group {', 100).includes('flex: 0 0 auto'), 'long forms scroll rather than compress');
    assert.ok(source.includes('--dialog-field-size: 22px'), 'reference field scale');
    assert.ok(source.includes('--dialog-field-height: 64px'), 'reference field height');
    assert.ok(rule(source, '.source-dialog .settings-row-input .settings-label', 200).includes('font-size: var(--dialog-field-size)'), 'label matches input');
    assert.ok(rule(source, '.dialog-body input, .dialog-body .settings-row-input input', 500).split('}')[0].includes('font-size: var(--dialog-field-size)'), 'one input scale for source and management forms');
    assert.ok(!source.includes('.settings-row:hover {\n'), 'field labels do not inherit button hover');
    assert.ok(rule(source, '.dialog-footer > button.primary,', 300).split('}')[0].includes('font-weight: 400'), 'actions use regular weight even when they share the primary button class');
    var primaryFocus = rule(source, '.dialog-footer > .primary:focus', 400).split('}')[0];
    assert.ok(primaryFocus.includes('background: var(--focus-ring)') && primaryFocus.includes('color: #151515'), 'focused filled actions retain dark-on-light contrast');
});

test('settings group boundaries do not add a second inter-row gap', function () {
    var source = css();
    assert.ok(source.includes('.settings-group { margin-bottom: 12px; }'), 'one row gap between groups');
    assert.ok(source.includes('.settings-group > .settings-row:last-child { margin-bottom: 0; }'), 'last row does not double the group gap');
});

test('queue resizing preserves the OSD fade and popup motion honours reduced motion', function () {
    var source = css();
    var osd = rule(source, '.osd-bottom { transition:', 300).split('}')[0];
    ['opacity', 'transform', 'padding-bottom'].forEach(function (property) {
        assert.ok(osd.includes(property), 'OSD transitions ' + property);
    });
    assert.ok(source.includes('.picker:not(.hidden), .track-menu:not(.hidden)'), 'menus use the shared entrance fade');
    assert.ok(source.includes('animation: none !important; transition: none !important;'), 'reduced-motion covers every animated component');
});

test('shared overlays bound long headings and keep diagnostics scrollable without hiding recovery', function () {
    var source = css();
    var headings = rule(source, '.dialog-card h2, .picker h2', 450).split('}')[0];
    assert.ok(headings.includes('-webkit-line-clamp: 3') && headings.includes('word-break: break-word'), 'unbroken names cannot force a modal outside its viewport');
    var error = rule(source, '.error-overlay {', 700).split('}')[0];
    assert.ok(error.includes('overflow-y: auto') && error.includes('scroll-padding: 80px'), 'long diagnostics leave room for the focus ring');
    assert.ok(error.includes('background: var(--bg)'), 'album text and the video plane cannot bleed through the error message');
    assert.ok(source.includes('.error-overlay > :first-child { margin-top: auto; }'), 'short errors centre while long errors begin at the top');
    assert.ok(rule(source, '.picker {', 800).includes('z-index: 400'), 'pickers sit above the source dialog at layer 300');
    assert.ok(read('index.html').includes('id="error-overlay" role="alertdialog"'), 'the error announces its recovery context');
});
