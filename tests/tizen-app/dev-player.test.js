'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var vm = require('node:vm');
var path = require('node:path');
var ROOT = path.join(__dirname, '../../tizen-app');

function decoder(scene) {
    var tick, events = [];
    var context = {
        URLSearchParams: URLSearchParams,
        location: { search: '?state=' + scene },
        I18n: { t: function (key) { return key; } },
        setInterval: function (fn) { tick = fn; }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'dev/backend.js'), 'utf8'), context);
    ['onstatechange', 'onbuffering'].forEach(function (name) {
        context.Player.setListener(name, function (value) { events.push([name, value]); });
    });
    context.Player.open();
    return { player: context.Player, tick: tick, events: events };
}

test('loading preview remains pending instead of starting playback', function () {
    var h = decoder('loading');
    for (var i = 0; i < 60; i++) h.tick();
    assert.equal(h.player.state(), 'READY');
    assert.equal(h.player.isBuffering(), true);
    assert.equal(h.player.currentTime(), 0);
    assert.deepEqual(h.events, []);
});

test('buffering preview emits the real buffering event and holds its playhead', function () {
    var h = decoder('buffering'), before = h.player.currentTime();
    h.tick();
    assert.deepEqual(h.events, [['onstatechange', 'playing'], ['onbuffering', true]]);
    assert.equal(h.player.currentTime(), before);
});

test('audio preview has a progressing four-minute timeline', function () {
    var h = decoder('audio');
    assert.equal(h.player.duration(), 240000);
    assert.equal(h.player.currentTime(), 62000);
    h.tick();
    assert.equal(h.player.currentTime(), 62500);
    assert.equal(h.player.getTracks().audio.length, 1);
    assert.equal(h.player.getTracks().subtitle.length, 0);
    assert.equal(Object.keys(h.player.describe().video).length, 0);
});

test('video preview retains multiple audio tracks, subtitles and video metadata', function () {
    var h = decoder('video');
    assert.equal(h.player.getTracks().audio.length, 2);
    assert.equal(h.player.getTracks().subtitle.length, 2);
    assert.equal(h.player.describe().video.width, 1920);
});

test('laid-out descendants of an exiting OSD are excluded from remote focus', function () {
    var focused = null, focusOptions, scrollOptions, resize;
    function element(hidden) {
        return {
            tagName: 'BUTTON', offsetParent: {},
            closest: function () { return hidden ? {} : null; },
            classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
            focus: function (options) { focused = this; focusOptions = options; }, scrollIntoView: function (options) { scrollOptions = options; }
        };
    }
    var hidden = element(true), visible = element(false);
    var view = element(false);
    view.querySelectorAll = function (selector) { return selector === '[data-focus]' ? [] : [hidden, visible]; };
    var context = { window: { matchMedia: function () { return { matches: true }; }, addEventListener: function (type, fn) { if (type === 'resize') resize = fn; } }, document: {
        activeElement: null,
        body: { classList: { toggle: function () {} } },
        getElementById: function (id) { return id === 'view-player' ? view : null; },
        querySelectorAll: function (selector) { return selector === '.view' ? [view] : []; }
    } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8'), context);
    context.UI.showView('view-player');
    assert.equal(focused, visible);
    assert.equal(focusOptions.preventScroll, true, 'native focus must not jump before smooth scrolling');
    assert.equal(scrollOptions.inline, 'nearest');
    assert.equal(scrollOptions.behavior, 'auto', 'reduced motion also disables smooth focus scrolling');
    context.document.activeElement = visible;
    visible.classList.contains = function (name) { return name === 'focused'; };
    focused = null; scrollOptions = null; resize();
    assert.equal(focused, null, 'resize reveals without refocusing');
    assert.equal(scrollOptions.behavior, 'auto');
    visible.offsetParent = null; scrollOptions = null; resize();
    assert.equal(scrollOptions, null, 'resize cannot reveal a hidden control');
});

test('stopping playback clears the OSD and queue layout state before returning to the library', function () {
    var app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    var start = app.indexOf('    function clearPlaybackChrome()');
    var end = app.indexOf('    /* Back to the list', start);
    assert.ok(start >= 0 && end > start);
    var removed = [], osd = [], stopped = false, saved = false;
    function noop() {}
    vm.runInNewContext(app.slice(start, end) + '\nstopPlayback();', {
        playbackGeneration: 0, standbySnapshot: {}, pendingResume: {}, openWatchdog: 1, osdHideTimer: 2, playerPopupReturn: 'more',
        state: { playingUri: 'file:///example.mp3' }, lastProgress: { time: 10, duration: 100 },
        clearInterval: noop, clearTimeout: noop, closePicker: noop, closeMore: noop, resetScrub: noop, hideError: noop, hideSpinner: noop, closeTrackMenu: noop,
        markWatched: noop, saveResumePos: function () { saved = true; },
        Player: { stop: function () { stopped = true; } },
        showOSD: function (visible) { osd.push(visible); },
        document: { body: { classList: { remove: function () { removed = Array.from(arguments); } } } }
    });
    assert.ok(stopped && saved, 'decoder release and resume bookkeeping are preserved');
    assert.deepEqual(osd, [false], 'use the shared OSD cleanup, including native focus');
    assert.deepEqual(removed, ['has-queue', 'up-next-open']);
});

test('simulator uses production markup without painting an unsupported AVPlay plugin', async function () {
    var entry = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8');
    var production = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    var written, complete;
    var ready = new Promise(function (resolve) { complete = resolve; });
    var scope = { fetch: async function () { return { ok: true, text: async function () { return production; } }; },
        XMLHttpRequest: function () {}, document: { body: {}, open: function () {},
            write: function (html) { written = html; }, close: complete } };
    scope.XMLHttpRequest.prototype.open = function () {};
    vm.runInNewContext(entry.slice(entry.indexOf('<script>') + 8, entry.lastIndexOf('</script>')), scope);
    await ready;
    assert.ok(production.includes('<object id="player-object"'), 'installed application retains its native target');
    assert.ok(!written.includes('<object id="player-object"'), 'simulator must not display Chromium plugin failure UI');
    assert.ok(written.includes('src="demo/player.js?demo='));
    assert.ok(written.includes('id="home-library"'), 'production library markup is retained');
});
