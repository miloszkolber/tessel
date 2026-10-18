'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var vm = require('node:vm');
var I18n = require('./helpers/i18n.js');

// Exercise the real player wrapper with a simulated HTML5 decoder and clock.
function harness(read, avplay) {
    function element() {
        var classes = new Set();
        return {
            children: [], style: {}, _text: '',
            get firstChild() { return this.children[0] || null; },
            get textContent() { return this._text + this.children.map(function (c) { return c.textContent; }).join(''); },
            set textContent(value) { this._text = value; this.children = []; },
            appendChild: function (child) { this.children.push(child); },
            removeChild: function (child) { this.children.splice(this.children.indexOf(child), 1); },
            classList: { add: function (c) { classes.add(c); }, remove: function (c) { classes.delete(c); }, contains: function (c) { return classes.has(c); } }
        };
    }
    var video = Object.assign(element(), {
        currentTime: 0, duration: 20, textTracks: [], audioTracks: [],
        load: function () {}, pause: function () {}, play: function () {}, removeAttribute: function () {}
    });
    var overlay = element(), polls = new Map(), id = 0;
    var context = {
        I18n: I18n, console: console,
        window: { innerWidth: 1920, innerHeight: 1080 },
        screen: { width: 1920, height: 1080 },
        Browser: { readSubtitleText: read || function (sub, cb) { cb(null, '1\n00:00:01,000 --> 00:00:02,000\n' + sub.name); } },
        document: { getElementById: function (key) { return key === 'html5-video' ? video : key === 'subtitle-overlay' ? overlay : element(); }, createElement: element },
        setInterval: function (fn) { polls.set(++id, fn); return id; }, clearInterval: function (key) { polls.delete(key); },
        setTimeout: function () { return ++id; }, clearTimeout: function () {}
    };
    if (avplay) context.webapis = { avplay: avplay };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../../tizen-app/js/player.js'), 'utf8'), context);
    var player = context.Player;
    var sidecars = [{ name: 'English', lang: 'en', ext: 'srt' }, { name: 'Polish', lang: 'pl', ext: 'srt' }];
    player.open('/Movie.mp4', { subtitles: sidecars }); // AVPlay absent: exercises the real local-file fallback.
    return { player: player, video: video, overlay: overlay, tick: function () { polls.forEach(function (fn) { fn(); }); }, sidecars: sidecars };
}

test('positive delay shows a cue later, negative delay sooner, without seeking playback', function () {
    var h = harness();
    assert.equal(h.player.getBackend(), 'html5');
    h.player.setSubtitleTrack(0);
    h.video.currentTime = 1.25;
    h.tick();
    assert.equal(h.overlay.textContent, 'English');
    assert.equal(h.player.setSubtitleDelay(500), true);
    assert.equal(h.overlay.classList.contains('hidden'), true);
    h.video.currentTime = 1.75; h.tick();
    assert.equal(h.overlay.textContent, 'English');
    h.video.currentTime = 0.75;
    h.player.setSubtitleDelay(-500);
    assert.equal(h.overlay.textContent, 'English');
    assert.equal(h.video.currentTime, 0.75);
    assert.equal(h.player.getSubtitleDelay(), -500);
    h.player.open('/Another.mp4');
    assert.equal(h.player.getSubtitleDelay(), 0);
});

test('external tracks can be switched away and back without stale detached track elements', function () {
    var h = harness();
    h.video.currentTime = 1.25;
    h.player.setSubtitleTrack(0); h.tick();
    h.player.setSubtitleTrack(1); h.tick();
    assert.equal(h.overlay.textContent, 'Polish');
    h.player.setSubtitleTrack(0); h.tick();
    assert.equal(h.overlay.textContent, 'English');
    assert.equal(h.player.getTracks().subtitle.filter(function (s) { return s.active; })[0].name, '[EN] English');
});

test('embedded HTML5 captions are listed independently of sidecars and shifted through the same renderer', function () {
    var h = harness();
    var native = { kind: 'captions', label: 'Embedded French', language: 'fr', mode: 'disabled', cues: [{ startTime: 1, endTime: 2, text: 'Bonjour' }] };
    h.video.textTracks.push(native);
    var tracks = h.player.getTracks().subtitle;
    var row = tracks.find(function (s) { return s.type === 'HTML5_NATIVE'; });
    assert.equal(row.lang, 'fr');
    h.player.setSubtitleTrack(row);
    assert.equal(native.mode, 'hidden');
    h.video.currentTime = 0.75;
    h.player.setSubtitleDelay(-500); h.tick();
    assert.equal(h.overlay.textContent, 'Bonjour');
    var selected = h.player.getTracks().subtitle.filter(function (s) { return s.active; });
    assert.equal(selected.length, 1);
    assert.equal(selected[0].name, 'Embedded French');
    h.player.setSubtitleTrack(-1);
    assert.equal(h.overlay.classList.contains('hidden'), true);
});

test('a delayed sidecar read cannot replace a newer selection or restart after stop', function () {
    var pending = [];
    var h = harness(function (sub, cb) { pending.push(cb); });
    h.video.currentTime = 1.25;
    h.player.setSubtitleTrack(0);
    h.player.setSubtitleTrack(1);
    pending[1](null, '1\n00:00:01,000 --> 00:00:02,000\nNew');
    pending[0](null, '1\n00:00:01,000 --> 00:00:02,000\nOld');
    h.tick();
    assert.equal(h.overlay.textContent, 'New');
    h.player.setSubtitleTrack(0); h.player.stop();
    pending[2](null, '1\n00:00:01,000 --> 00:00:02,000\nStopped');
    h.tick();
    assert.equal(h.overlay.classList.contains('hidden'), true);
});

test('late metadata refreshes the track menu and audio language remains available for preference matching', function () {
    var h = harness(), updated = 0;
    h.player.setListener('onsubsupdated', function () { updated++; });
    h.video.audioTracks.push({ label: 'English audio', language: 'en', enabled: true });
    h.video.onloadedmetadata();
    h.video.audioTracks.onaddtrack();
    assert.equal(updated, 2);
    assert.equal(h.player.getTracks().audio[0].lang, 'en');
});

test('AVPlay sidecars use shifted cue time; unsupported native sync is rejected without changing delay', function () {
    var avplay = {
        open: function () {}, close: function () {}, play: function () {}, setDisplayRect: function () {}, setDisplayMethod: function () {},
        prepareAsync: function (done) { done(); }, setListener: function () {}, setSilentSubtitle: function () {},
        getState: function () { return 'PLAYING'; }, getCurrentTime: function () { return 1250; }, getDuration: function () { return 20000; },
        getTotalTrackInfo: function () { return [{ type: 'TEXT', index: 0, extra_info: '{}' }]; },
        getCurrentStreamInfo: function () { return [{ type: 'TEXT', index: 0, extra_info: '{}' }]; }, setSelectTrack: function () {}
    };
    var h = harness(null, avplay);
    h.player.setSubtitleTrack('ext:0'); h.tick();
    assert.equal(h.overlay.textContent, 'English');
    h.player.setSubtitleDelay(500);
    assert.equal(h.overlay.classList.contains('hidden'), true);
    h.player.setSubtitleDelay(0);
    h.player.setSubtitleTrack('embed:0');
    assert.equal(h.player.setSubtitleDelay(500), false);
    assert.equal(h.player.getSubtitleDelay(), 0);
});
