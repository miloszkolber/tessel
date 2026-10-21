'use strict';

/* The simulator is what makes the product demoable without a TV: a virtual
 * tizen.filesystem, a virtual background service and a decoder that replaces
 * AVPlay.  These tests hold the contracts the app's own modules rely on —
 * callback shapes, reply shapes, subtitle sidecars — plus the wiring that
 * keeps demo.html driving the real index.html instead of a copy. */

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var vm = require('node:vm');
var path = require('node:path');
var ROOT = path.join(__dirname, '../../tizen-app');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* The world boots itself on load, so it needs a window to install into. */
function world() {
    var win = { setTimeout: function (fn) { fn(); } };
    var context = { window: win, console: console, setTimeout: function (fn) { fn(); },
                    clearTimeout: function () {}, Promise: Promise, Response: Response,
                    Uint8Array: Uint8Array, atob: atob };
    vm.createContext(context);
    vm.runInContext(read('demo/world.js'), context);
    return { Simulator: context.Simulator, context: context };
}

function request(context, method, url) {
    var xhr = new context.window.XMLHttpRequest();
    var done = null;
    xhr.open(method, url, true);
    xhr.onload = function () { done = xhr; };
    xhr.send();
    assert.ok(done, 'reply should arrive for ' + url);
    return JSON.parse(done.responseText);
}

test('the simulator installs the TV platform before the app looks for it', function () {
    var w = world();
    assert.equal(typeof w.context.window.tizen.filesystem.resolve, 'function');
    assert.equal(typeof w.context.window.tizen.application.getCurrentApplication, 'function');
    assert.equal(w.context.window.tizen.application.getCurrentApplication().appInfo.id, 'sim.tessel');
    assert.equal(typeof w.context.window.webapis.productinfo.getRealModel, 'function');
});

test('the virtual USB drive lists folders, media and sidecar subtitles', function () {
    var w = world(), drive = null;
    w.context.window.tizen.filesystem.resolve('removable1', function (d) { drive = d; },
                                              function (e) { throw e; });
    var entries = [];
    drive.listFiles(function (items) { entries = items.map(function (f) { return f.name; }); });
    assert.deepEqual(Array.from(entries), ['Series', 'Films', 'Music', 'channels.m3u']);
});

test('direct folder shortcuts retain the same USB identity as browsing from the root', function () {
    var w = world(), filesystem = w.context.window.tizen.filesystem, direct, browsed;
    filesystem.resolve('/removable1/Films', function (dir) { dir.listFiles(function (items) { direct = items[0].toURI(); }); });
    filesystem.resolve('removable1', function (root) {
        root.listFiles(function (dirs) { dirs.filter(function (d) { return d.name === 'Films'; })[0].listFiles(function (items) { browsed = items[0].toURI(); }); });
    });
    assert.equal(direct, browsed);
    assert.ok(direct.startsWith('file:///removable1/Films/'));
});

test('a virtual file reads like a Tizen file: node-style size, ranged bytes, text stream', function () {
    var w = world(), music = null;
    w.context.window.tizen.filesystem.resolve('removable1/Music', function (dir) {
        dir.listFiles(function (items) {
            music = items.filter(function (f) { return f.name === 'Theme song.mp3'; })[0];
        });
    });
    var size = null;
    music.getSize(function (err, n) { assert.equal(err, null); size = n; });
    assert.equal(size, 8600000);

    var bytes = null;
    music.readRange(0, 3, function (err, buf) { bytes = new Uint8Array(buf); });
    assert.equal(String.fromCharCode.apply(null, bytes), 'ID3');

    var text = null;
    music.openStream('r', function (stream) { text = stream.read(stream.bytesAvailable); });
    assert.ok(text.length > 0);
});

test('the service answers the app the way the real one does', function () {
    var w = world();
    var ping = request(w.context, 'GET', 'http://127.0.0.1:8127/smb/ping');
    assert.equal(ping.ok, true);
    assert.deepEqual(ping.servers, []);          // none saved until the app saves one
    var shares = request(w.context, 'GET', 'http://127.0.0.1:8127/smb/shares');
    assert.deepEqual(shares.shares, [{ name: 'Media', remark: '' }, { name: 'Films', remark: '' }, { name: 'Music', remark: '' }]);

    var root = request(w.context, 'GET', 'http://127.0.0.1:8127/smb/list?path=');
    assert.equal(root.ok, true);
    assert.deepEqual(root.entries.map(function (e) { return e.name; }),
                     ['Films', 'Music', 'Big Buck Bunny.mp4', 'Big Buck Bunny.en.srt', 'Theme song.mp3']);

    var dav = request(w.context, 'GET', 'http://127.0.0.1:8127/dav/list?srv=&path=');
    assert.deepEqual(dav.entries.map(function (e) { return e.name; }),
                     ['Photos', 'Cloud film.mp4', 'Cloud film.en.srt']);

    var dlna = request(w.context, 'GET', 'http://127.0.0.1:8127/dlna/discover');
    assert.equal(dlna.servers.length, 2);

    var show = request(w.context, 'POST', 'http://127.0.0.1:8127/dlna/browse');
    assert.ok(show.entries.some(function (e) { return e.isDir; }));
    assert.ok(show.entries.some(function (e) { return !e.isDir && /\.mp4$/.test(e.title); }));

    var cast = request(w.context, 'GET', 'http://127.0.0.1:8127/cast/info');
    assert.match(cast.address, /\/cast$/);
});

test('a request for the service is answered without touching the network', function () {
    var w = world(), called = false;
    w.context.window.XMLHttpRequest = function () {
        called = true;
        throw new Error('the real transport must not be used');
    };
    // Re-installing keeps the wrapper around the (now failing) real transport.
    w.context.Simulator.install();
    var reply = request(w.context, 'GET', 'http://127.0.0.1:8127/cast/info');
    assert.equal(reply.ok, true);
    assert.equal(called, false);
});

/* ── the decoder the app drives instead of AVPlay ────────────────────────── */
function decoder(opts) {
    opts = opts || {};
    var overlay = {
        textContent: '', children: [],
        classList: {
            classes: {},
            add: function (c) { this.classes[c] = true; },
            remove: function (c) { delete this.classes[c]; },
            contains: function (c) { return !!this.classes[c]; }
        },
        appendChild: function (el) { this.children.push(el); }
    };
    var timers = {}, ticks = {}, nextTimer = 1;
    var context = {
        document: {
            getElementById: function (id) { return id === 'subtitle-overlay' ? overlay : null; },
            createElement: function () { return { className: '', textContent: '' }; }
        },
        Simulator: { DURATIONS: { 'Big Buck Bunny.mp4': 596000 } },
        Browser: opts.browser || undefined,
        setTimeout: function (fn, ms) { var id = nextTimer++; timers[id] = { fn: fn, ms: ms }; return id; },
        clearTimeout: function (id) { delete timers[id]; },
        setInterval: function (fn) { var id = nextTimer++; ticks[id] = fn; return id; },
        clearInterval: function (id) { delete ticks[id]; }
    };
    vm.createContext(context);
    vm.runInContext(read('demo/player.js'), context);
    return {
        player: context.Player, overlay: overlay,
        flush: function () { Object.keys(timers).forEach(function (id) { var t = timers[id]; if (t) { delete timers[id]; t.fn(); } }); },
        tick: function (n) { for (var i = 0; i < (n || 1); i++) Object.keys(ticks).forEach(function (id) { if (ticks[id]) ticks[id](); }); }
    };
}

test('the simulated decoder plays a file for its known length', function () {
    var h = decoder();
    h.player.open('file:///removable1/Films/Big Buck Bunny.mp4', { title: 'Big Buck Bunny.mp4' });
    assert.equal(h.player.state(), 'READY');
    assert.equal(h.player.duration(), 596000);
    h.flush();
    assert.equal(h.player.state(), 'PLAYING');
    h.tick(4);
    assert.equal(h.player.currentTime(), 1000);
});

test('the decoder reports the tracks a TV would, sidecar subtitles included', function () {
    var h = decoder({ browser: { readSubtitleText: function (s, cb) { cb(null, '1\n00:00:00,000 --> 00:00:04,000\nHello\n'); } } });
    h.player.open('file:///removable1/Films/Big Buck Bunny.mp4', {
        title: 'Big Buck Bunny.mp4',
        subtitles: [{ name: 'Big Buck Bunny.en.srt' }]
    });
    h.flush();
    var tracks = h.player.getTracks();
    assert.equal(tracks.audio.length, 2);
    assert.deepEqual(Array.from(tracks.subtitle).map(function (s) { return s.name; }), ['Off', 'Big Buck Bunny.en.srt']);

    h.player.setSubtitleTrack(tracks.subtitle[1]);
    h.tick(2);
    assert.equal(h.overlay.children[0].textContent, 'Hello');
    assert.equal(h.overlay.classList.contains('hidden'), false);

    h.player.setSubtitleTrack({ off: true });
    assert.equal(h.overlay.classList.contains('hidden'), true);
});

test('a URL the app was handed still gets a plausible timeline', function () {
    var h = decoder();
    h.player.open('https://example.com/demo-film.mp4', { title: 'demo-film.mp4' });
    h.flush();
    assert.equal(h.player.duration(), 1800000);
    assert.equal(h.player.describe().video.width, 1920);
    assert.equal(h.player.getBackend(), 'simulated');
});

test('simulated loading and buffering hold the clock and can resume through normal playback controls', function () {
    ['loading', 'buffering'].forEach(function (scene) {
        var h = decoder();
        h.player.setDemoState(scene);
        h.player.open('file:///example.mp4', { title: 'Example.mp4' }); h.flush();
        assert.equal(h.player.state(), scene === 'loading' ? 'READY' : 'PLAYING');
        assert.equal(h.player.isBuffering(), true);
        h.tick(4); assert.equal(h.player.currentTime(), 0);
        if (scene === 'buffering') h.player.pause();
        h.player.play(); h.tick(4);
        assert.equal(h.player.isBuffering(), false);
        assert.equal(h.player.currentTime(), 1000);
    });
});

test('a simulated failure uses the production error callback and does not poison later opens', function () {
    var h = decoder(), errors = [];
    h.player.setListener('onerror', function (text) { errors.push(text); });
    h.player.setDemoState('error');
    h.player.open('file:///example.mp4', { title: 'Example.mp4' }); h.flush();
    assert.equal(h.player.state(), 'ERROR');
    assert.match(errors[0], /Simulated playback failure/);
    h.player.open('file:///example.mp4', { title: 'Example.mp4' }); h.flush(); h.tick();
    assert.equal(h.player.state(), 'PLAYING');
    assert.ok(h.player.currentTime() > 0);
    assert.equal(errors.length, 1);
});

test('a cancelled simulated open cannot deliver a late failure into the next route', function () {
    var h = decoder(), failed = false;
    h.player.setListener('onerror', function () { failed = true; });
    h.player.setDemoState('error'); h.player.open('file:///example.mp4', { title: 'Example.mp4' });
    h.player.stop(); h.flush();
    assert.equal(h.player.state(), 'IDLE');
    assert.equal(failed, false);
});

/* ── the harness keeps driving the real app ─────────────────────────────── */
test('demo.html loads the real index.html and swaps in the simulator', function () {
    var html = read('demo.html');
    assert.match(html, /fetch\('index\.html'/);
    assert.match(html, /src="js\/player\.js"', 'src="demo\/player\.js"/);
    assert.match(html, /demo\/world\.js/);
    assert.match(html, /demo\/boot\.js/);
    // Writing the app's markup into a document at another path would break
    // every relative URL in it, so the harness has to sit at the app root.
    assert.ok(fs.existsSync(path.join(ROOT, 'demo.html')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'demo/index.html')));
});

test('the packaged app leaves the simulator out of the .wgt', function () {
    var build = read('build.sh');
    var zipped = /zip -rq "\$\{OUT\}" \\\n([\s\S]*?)\n\n/.exec(build)[1];
    assert.ok(!/demo/.test(zipped), 'demo files must not ship in the app package');
    ['config.xml', 'index.html', 'css', 'js', 'i18n', 'service'].forEach(function (part) {
        assert.ok(zipped.indexOf(part) >= 0, part + ' should still ship');
    });
});
