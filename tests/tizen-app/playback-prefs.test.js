'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var I18n = require('./helpers/i18n.js');

var ROOT = path.join(__dirname, '../../tizen-app');
var en = require('../../tizen-app/i18n/en.json');

function loadApp() {
    var store = {};
    var context = {
        console: console,
        I18n: I18n,
        window: {},
        Playlist: { foldText: function (s) { return String(s || ''); } },
        document: { readyState: 'loading', addEventListener: function () {} },
        localStorage: {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
            setItem: function (k, v) { store[k] = String(v); },
            removeItem: function (k) { delete store[k]; }
        },
        setInterval: function () { return 0; }, clearInterval: function () {},
        setTimeout: function () { return 0; }, clearTimeout: function () {}
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../../tizen-app/js/app.js'), 'utf8'), context);
    return { app: context.window.VlcApp, store: store };
}

test('per-file playback memory round-trips and caps growth', function () {
    var loaded = loadApp();
    assert.equal(loaded.app.playbackPrefsFor('preview://sample'), null);
    loaded.app.savePlaybackPrefs('preview://sample', { audioLang: 'pl', speed: '1.5' });
    assert.equal(loaded.app.playbackPrefsFor('preview://sample').audioLang, 'pl');
    assert.equal(loaded.app.playbackPrefsFor('preview://sample').speed, '1.5');
    // A patch merges rather than replacing the entry.
    loaded.app.savePlaybackPrefs('preview://sample', { delay: 500 });
    var entry = loaded.app.playbackPrefsFor('preview://sample');
    assert.equal(entry.audioLang, 'pl');
    assert.equal(entry.delay, 500);
});

test('Info diagnostics and new player rows have English labels', function () {
    ['info.backend', 'player.autoplay', 'player.queue'].forEach(function (key) {
        assert.equal(typeof en[key], 'string', key);
        assert.ok(en[key].trim(), 'empty ' + key);
    });
});

test('Auto-play lives in More now, not in Settings', function () {
    assert.ok(!('settings.autoPlay' in en), 'settings.autoPlay removed');
    assert.ok(!('autoPlay.on' in en), 'autoPlay.on removed');
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.indexOf('data-action="toggle-autoplay"') >= 0, 'More autoplay row');
    assert.ok(html.indexOf('id="autoplay-value"') >= 0, 'More autoplay value');
    assert.ok(html.indexOf('setting-auto-play') < 0, 'Settings autoplay row removed');
    var src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    assert.ok(src.indexOf('openAutoPlayPicker') < 0, 'old autoplay picker removed');
    assert.ok(src.indexOf('openAutoplayOptions') >= 0, 'autoplay option list');
    assert.ok(src.indexOf('toggleAutoplay') >= 0, 'autoplay Left/Right stepping');
});

test('Up Next is a thumbnail carousel with progress, collapsing until focused', function () {
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    var osd = html.slice(html.indexOf('id="osd-bottom"'), html.indexOf('id="player-more"'));
    assert.ok(osd.indexOf('id="up-next"') >= 0, 'up-next inside osd-bottom');
    assert.ok(osd.indexOf('id="up-next-list"') >= 0, 'up-next list');
    var src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    assert.ok(src.indexOf('renderUpNext') >= 0, 'queue renderer');
    assert.ok(src.indexOf('playQueueIndex') >= 0, 'queue jump');
    assert.ok(src.indexOf('aria-current') >= 0, 'current row marked');
    assert.ok(src.indexOf('queueThumb') >= 0, 'queue thumbnails');
    assert.ok(src.indexOf('queueProgress') >= 0, 'queue progress');
    var css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(css.indexOf('.up-next {') >= 0, 'flat strip, no container card');
    assert.ok(css.indexOf('.up-next-card') >= 0, 'carousel cards');
    assert.ok(css.indexOf('.up-next:not(:focus-within)') >= 0, 'collapsed until focused');
    assert.ok(css.indexOf('background: transparent') >= 0, 'no container card');
});

test('queue artwork retains the URL-derived fallback through loading and failure', function () {
    function element() {
        var classes = {}, node = { children: [], style: {}, classList: {
            add: function (name) { classes[name] = true; },
            remove: function (name) { delete classes[name]; },
            contains: function (name) { return !!classes[name]; }
        } };
        node.appendChild = function (child) { node.children.push(child); child.parentNode = node; };
        node.removeChild = function (child) { node.children.splice(node.children.indexOf(child), 1); child.parentNode = null; };
        return node;
    }
    var context = { document: { createElement: element }, queueProgress: function () { return 25; } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/filetypes.js'), 'utf8'), context);
    var source = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    var start = source.indexOf('    function queueThumb('), end = source.indexOf('    function renderUpNext(', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
    var thumb = context.queueThumb({ title: 'Friendly film title', uri: 'https://example.com/movie.mp4?token=demo#part', art: 'cover.jpg' });
    var glyph = thumb.children[0], image = thumb.children[1];
    assert.ok(glyph.innerHTML.includes('file-video-fill.svg'), 'friendly title falls back to the media URL type');
    assert.equal(image.loading, 'lazy');
    assert.equal(image.className, 'card-art');
    assert.equal(thumb.classList.contains('has-art'), false, 'fallback stays visible until the image succeeds');
    image.onload();
    assert.equal(thumb.classList.contains('has-art'), true);
    image.onerror();
    assert.equal(thumb.classList.contains('has-art'), false);
    assert.equal(image.parentNode, null, 'failed image is removed');
    assert.equal(thumb.children[0], glyph, 'the original fallback survives');
    var audio = context.queueThumb({ title: 'Friendly music title', uri: 'https://example.com/song.mp3#track' });
    assert.ok(audio.children[0].innerHTML.includes('file-music-fill.svg'));
});

test('autoplay is silent and the scrub chip is white-on-black text', function () {
    assert.ok(!('toast.autoPlay' in en), 'autoplay toast removed');
    var css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    var chip = css.slice(css.indexOf('.scrub-delta {'), css.indexOf('.scrub-delta {') + 500);
    assert.ok(chip.indexOf('background: #fff') >= 0, 'white chip');
    assert.ok(chip.indexOf('color: #0e0e0e') >= 0, 'soft-black chip text');
    assert.ok(chip.indexOf('font-weight: 400') >= 0, 'regular chip weight');
    assert.ok(chip.indexOf('border: none') >= 0, 'no chip outline');
});

test('views sit on the reference dark page colour and subtitle boxes blur', function () {
    var css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    var view = css.slice(css.indexOf('.view {'), css.indexOf('.view {') + 700);
    assert.ok(view.indexOf('background: var(--bg)') >= 0, 'page colour');
    assert.ok(css.indexOf('--bg:        #0a0a0a') >= 0, 'mewa neutral-1000 base');
    assert.ok(css.indexOf('#subtitle-overlay.sub-bg .sub-line') >= 0, 'subtitle box rule');
    assert.ok(css.indexOf('backdrop-filter: blur(8px)') >= 0, 'subtitle box blur');
    assert.ok(fs.existsSync(path.join(ROOT, 'dev/preview-photo.jpg')), 'preview video backdrop present');
});

test('language defaults come from recent picks, falling back to the app language', function () {
    assert.ok(!('settings.audioLang' in en), 'audio Settings row removed');
    assert.ok(!('settings.subtitleLang' in en), 'subtitle Settings row removed');
    var src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    assert.ok(src.indexOf('openLangPicker') < 0, 'language pickers removed');
    assert.ok(src.indexOf('effectiveAudioLang') >= 0, 'audio fallback chain');
    assert.ok(src.indexOf('effectiveSubLang') >= 0, 'subtitle fallback chain');
    var settings = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8');
    assert.ok(/subtitleLang:\s*''/.test(settings), 'subtitle default follows the app language');
});

test('background audio and the mini-player have been removed', function () {
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.indexOf('mini-player') < 0);
    var css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(css.indexOf('.mini-player') < 0);
    var app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    assert.ok(app.indexOf('minimizePlayer') < 0);
    assert.ok(app.indexOf('state.background') < 0);
});

test('down from the transport reaches Up Next geometrically', function () {
    var src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    assert.ok(src.indexOf("UI.moveFocus('down')") >= 0, 'geometric down in player');
    assert.ok(src.indexOf('has-queue') >= 0, 'queue presence marker');
    assert.ok(src.indexOf('up-next-open') >= 0, 'tall-strip focus marker');
});

test('SamsungOne leads the font stacks and home has no brand header', function () {
    var css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(css.indexOf("font-family: 'SamsungOne'") >= 0, 'Samsung-first UI stack');
    var settings = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8');
    assert.ok(settings.indexOf("'SamsungOne'") >= 0, 'Samsung-first subtitle stack');
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    var home = html.slice(html.indexOf('id="view-home"'), html.indexOf('id="view-url"'));
    assert.ok(home.indexOf('class="brand"') < 0, 'no logo header on home');
    assert.ok(home.indexOf('home-tiles') >= 0, 'tiles remain');
});

test('simulator storage cannot overwrite or clear real application storage', function () {
    var data = { setting: 'real' };
    var native = { getItem: function (k) { return data[k] || null; }, setItem: function (k, v) { data[k] = String(v); },
        removeItem: function (k) { delete data[k]; }, key: function (i) { return Object.keys(data)[i]; }, get length() { return Object.keys(data).length; } };
    var context = { window: { localStorage: native }, location: { pathname: '/demo.html' } };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'dev/storage.js'), 'utf8'), context);
    context.window.localStorage.setItem('setting', 'simulated');
    assert.equal(native.getItem('setting'), 'real');
    assert.equal(context.window.localStorage.getItem('setting'), 'simulated');
    context.window.localStorage.clear();
    assert.equal(native.getItem('setting'), 'real');
    assert.equal(context.window.localStorage.getItem('setting'), null);
});
