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
    var focused = null;
    function element(hidden) {
        return {
            tagName: 'BUTTON', offsetParent: {},
            closest: function () { return hidden ? {} : null; },
            classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
            focus: function () { focused = this; }, scrollIntoView: function () {}
        };
    }
    var hidden = element(true), visible = element(false);
    var view = element(false);
    view.querySelectorAll = function (selector) { return selector === '[data-focus]' ? [] : [hidden, visible]; };
    var context = { document: {
        activeElement: null,
        body: { classList: { toggle: function () {} } },
        getElementById: function (id) { return id === 'view-player' ? view : null; },
        querySelectorAll: function (selector) { return selector === '.view' ? [view] : []; }
    } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8'), context);
    context.UI.showView('view-player');
    assert.equal(focused, visible);
});
