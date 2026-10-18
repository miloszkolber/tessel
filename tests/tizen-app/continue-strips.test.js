'use strict';

/* The Continue playing carousel belongs to the page that can play what it
 * lists: the USB page shows the files of attached storage (and hides when
 * nothing is mounted), the Network page the sources on the LAN.  app.js is
 * loaded the same way playback-prefs.test.js loads it — no DOM needed for a
 * pure rule. */

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
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), context);
    return context.window.VlcApp;
}

function uris(items) { return Array.from(items).map(function (i) { return i.uri; }); }

var USB_FILE  = 'file:///removable1/Films/Big Buck Bunny.mp4';
var USB_SONG  = 'file:///removable1/Music/Theme song.mp3';
var SMB_STREAM = 'http://127.0.0.1:8127/smb/stream?path=%2FMedia%2Ffilm.mkv';
var DLNA_URL  = 'http://192.168.0.10:8200/film.mp4';
var PASTED    = 'https://example.com/demo-film.mp4';
var MOUNTED   = ['/removable1'];

test('the USB page lists only the files of a mounted drive', function () {
    var app = loadApp();
    var items = [USB_FILE, USB_SONG, SMB_STREAM, DLNA_URL].map(function (u) { return { uri: u }; });
    assert.deepStrictEqual(uris(app.continueForPage(items, 'usb', MOUNTED)), [USB_FILE, USB_SONG]);
});

test('a USB page with nothing mounted shows no carousel at all', function () {
    var app = loadApp();
    var items = [{ uri: USB_FILE }];
    assert.deepStrictEqual(uris(app.continueForPage(items, 'usb', [])), []);
    // The drive that held the file is gone; the entry is not just hidden, it
    // is not this page's to show.
    assert.deepStrictEqual(uris(app.continueForPage(items, 'usb', ['/removable2'])), []);
});

test('the Network page lists the network sources, and a pasted stream is not a USB file', function () {
    var app = loadApp();
    var items = [USB_FILE, SMB_STREAM, DLNA_URL, PASTED].map(function (u) { return { uri: u }; });
    assert.deepStrictEqual(uris(app.continueForPage(items, 'network', MOUNTED)),
                           [SMB_STREAM, DLNA_URL, PASTED]);
});

test('a playlist listing carries no carousel', function () {
    var app = loadApp();
    var items = [{ uri: USB_FILE }, { uri: SMB_STREAM }];
    assert.deepStrictEqual(uris(app.continueForPage(items, 'playlist', MOUNTED)), []);
});

test('Continue playing keeps its English title', function () {
    assert.equal(typeof en['strip.continue'], 'string');
    assert.ok(en['strip.continue'].trim());
});
