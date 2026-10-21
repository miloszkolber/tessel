'use strict';

var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
var app = fs.readFileSync('tizen-app/js/app.js', 'utf8');
var FileTypes = require('../../tizen-app/js/filetypes.js');
var Playlist = require('../../tizen-app/js/playlist.js');

function node() {
    var n = { children: [], dataset: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} },
        addEventListener: function (event, fn) { this[event] = fn; },
        appendChild: function (child) { this.children.push(child); } };
    Object.defineProperty(n, 'innerHTML', { set: function (value) { this.markup = value; this.children = []; } });
    Object.defineProperty(n, 'firstElementChild', { get: function () { return this.children[0]; } });
    return n;
}
function harness() {
    var ids = {}, focused;
    var context = {
        document: { getElementById: function (id) { return ids[id] || (ids[id] = node()); }, createElement: node },
        state: { view: 'browse' }, browseSequence: 0, browsePage: 'usb',
        setBrowsePage: function () {}, setBrowseGrid: function () {}, usbBreadcrumbs: function () { return []; },
        usbFavorite: function () { return {}; }, markFavoriteRow: function () {},
        UI: { showView: function () {}, refreshFocusables: function () {}, focusOn: function (n) { focused = n; } },
        FileTypes: FileTypes, Playlist: Playlist, foldText: Playlist.foldText, logoObserver: null,
        loadLogos: function () {}, isWatched: function () { return false; },
        Favorites: { find: function () { return null; } }, SavedStreams: { findByUrl: function () { return null; } },
        I18n: require('./helpers/i18n.js'), escapeHtml: function (value) { return String(value); },
        groupName: function (name) { return name || 'Other'; }, clearPlaylistFilter: function () {}
    };
    vm.createContext(context);
    return { context: context, ids: ids, focused: function () { return focused; } };
}

test('USB lists playlists but keeps them out of the folder playback queue', function () {
    var h = harness(), opened, played;
    var entries = ['Film.mp4', 'Song.mp3', 'channels.m3u', 'list.pls', 'Film.en.srt', 'cover.jpg', 'Notes.txt'].map(function (name) {
        return { name: name, kind: FileTypes.kind(name), playable: FileTypes.isPlayable(name), uri: 'file:///' + name, file: {}, size: 100 };
    });
    h.context.Browser = { listDir: function (dir, cb) { cb(null, entries); }, humanSize: function () { return '100 B'; } };
    h.context.MAX_PLAYLIST_BYTES = 1000;
    h.context.openPlaylist = function (src) { opened = src; };
    h.context.playFromList = function (origin, queue, index) { played = { queue: queue, index: index }; };
    var start = app.indexOf('    function listInto('), end = app.indexOf('    /* ── Favorites', start);
    vm.runInContext(app.slice(start, end) + '\nlistInto({fullPath:"/removable1"});', h.context);
    var rows = h.ids['browse-list'].children;
    assert.deepEqual(rows.map(function (n) { return n.dataset.uri; }), ['file:///Film.mp4', 'file:///Song.mp3', 'file:///channels.m3u', 'file:///list.pls']);
    rows[2].click(); assert.equal(opened.title, 'channels.m3u');
    rows[3].click(); assert.equal(opened.title, 'list.pls');
    rows[1].click();
    assert.deepEqual(Array.from(played.queue, function (e) { return e.title; }), ['Film.mp4', 'Song.mp3']);
    assert.equal(played.index, 1);
});

test('playlist groups, cross-group filtering and playback return retain the intended row', function () {
    var h = harness(), played, left = false;
    h.context.state.playlistView = { src: { title: 'Channels', back: function () { left = true; } }, group: null, filter: '',
        entries: [{ uri: 'https://example.com/news', title: 'Café News', group: 'News' }, { uri: 'https://example.com/film', title: 'Film', group: 'Films' }] };
    h.context.playFromList = function (origin, queue, index) { played = { origin: origin, queue: queue, index: index }; };
    h.context.entryKind = function () { return 'video'; };
    var start = app.indexOf('    function renderPlaylist('), end = app.indexOf('    /* The playlist filter', start);
    vm.runInContext(app.slice(start, end) + '\nrenderPlaylist();', h.context);
    var list = h.ids['browse-list'];
    assert.equal(list.children.length, 2);
    list.children[0].click();
    assert.equal(list.children[0].dataset.channel, 'Café News');
    h.context.state.listBack();
    assert.equal(h.focused(), list.children[0], 'Back restores the originating group');
    h.context.state.playlistView.filter = 'cafe';
    h.context.renderPlaylist();
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].title, 'Café News', 'the complete channel title is available');
    list.children[0].click();
    assert.equal(played.origin, 'playlist'); assert.equal(played.queue.length, 1);
    h.context.renderPlaylist('https://example.com/news');
    assert.equal(h.focused().dataset.uri, 'https://example.com/news');
    h.context.state.playlistView.filter = '';
    h.context.renderPlaylist(); h.context.state.listBack();
    assert.equal(left, true);
});

test('a URL playlist resets the prior device trail and retains Stream page identity', function () {
    var h = harness(), context = h.context, returned = false;
    context.browseCrumbs = ['Old NAS', 'Old folder']; context.browsePage = 'network';
    context.LibraryUI = { validUrl: function () { return true; } };
    context.Library = { recent: function () {} };
    context.TextDecode = require('../../tizen-app/js/text-decode.js');
    context.fetchBytes = function (url, cb) { cb(null, Buffer.from('#EXTM3U\n#EXTINF:-1,News\nhttps://example.com/news.m3u8')); };
    context.returnToStreamPage = function () { returned = true; };
    context.entryKind = function () { return 'video'; };
    context.logoUrl = function () { return null; };
    [['    function setBrowsePage(', '    function currentPageName()'], ['    function openPlaylist(', '    /* The playlist filter'], ['    function openUrl(', '    /* Back from a stream']].forEach(function (boundary) {
        var start = app.indexOf(boundary[0]), end = app.indexOf(boundary[1], start);
        assert.ok(start >= 0 && end > start); vm.runInContext(app.slice(start, end), context);
    });
    context.openUrl('https://example.com/channels.m3u', 'Channels');
    assert.equal(context.browsePage, 'stream');
    assert.equal(h.ids['browse-title'].textContent, 'Play a link');
    assert.equal(h.ids['browse-heading'].textContent, 'Stream / Channels');
    assert.equal(h.ids['browse-list'].children[0].dataset.channel, 'News');
    context.state.listBack(); assert.equal(returned, true);
    context.setBrowsePage('usb', ['USB drive', 'Series']);
    assert.equal(h.ids['browse-title'].textContent, 'USB devices');
    assert.equal(h.ids['browse-heading'].textContent, 'Devices / USB drive / Series');
});
