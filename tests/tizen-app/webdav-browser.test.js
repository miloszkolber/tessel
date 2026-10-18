var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
test('a configured WebDAV source renders media-only rows and hands the queue to playback', function () {
    function node() {
        var markup = '';
        var n = { children: [], dataset: {}, classList: { add: function () {} }, addEventListener: function (name, fn) { this[name] = fn; }, appendChild: function (child) { this.children.push(child); } };
        Object.defineProperty(n, 'innerHTML', { get: function () { return markup; }, set: function (s) { markup = s; this.children = []; } });
        Object.defineProperty(n, 'firstElementChild', { get: function () { return this.children[0]; } });
        return n;
    }
    var ids = {}, played;
    var entries = [{ name: 'Series', isDir: true }, { name: 'Film.mp4', isDir: false }, { name: 'Song.mp3', isDir: false }, { name: 'Film.srt' }, { name: 'Notes.txt' }];
    var scope = { window: { VlcApp: { play: function (origin, queue, index) { played = { origin: origin, queue: queue, index: index }; } } },
        localStorage: { getItem: function () { return JSON.stringify([{ id: 'cloud', url: 'https://example.com/', name: 'Cloud' }]); } },
        document: { readyState: 'loading', addEventListener: function () {}, getElementById: function (id) { return ids[id] || (ids[id] = node()); }, createElement: node },
        UI: { showView: function () {}, refreshFocusables: function () {}, focusOn: function () {} },
        Remote: { push: function (fn) { return fn; }, pop: function () {} },
        I18n: require('./helpers/i18n.js'), FileTypes: require('../../tizen-app/js/filetypes.js'),
        SMB: { ensureService: function (cb) { cb(null); }, parentPaths: function () { return []; }, siblingSubtitles: function () { return { 'Film.mp4': [{ uri: 'sidecar', ext: 'srt' }] }; } },
        XMLHttpRequest: function () {
            this.open = function (method, url) { this.url = url; }; this.setRequestHeader = function () {};
            this.send = function () { this.responseText = JSON.stringify(this.url.indexOf('/dav/list') >= 0 ? { ok: true, entries: entries } : { ok: true, dav: ['cloud'] }); this.onload(); };
        } };
    vm.runInNewContext(fs.readFileSync('tizen-app/js/webdav.js', 'utf8'), scope);
    assert.equal(scope.WebDAV.openFolder('cloud', '/'), true);
    var rows = ids['browse-list'].children;
    assert.equal(rows.length, 3); assert.ok(rows[0].innerHTML.includes('Series'));
    assert.ok(rows[1].innerHTML.includes('Film.mp4')); assert.ok(rows[2].innerHTML.includes('Song.mp3'));
    rows[1].click();
    assert.equal(played.origin, 'webdav'); assert.equal(played.queue.length, 2); assert.equal(played.index, 0);
    assert.equal(played.queue[0].subtitles[0].uri, 'sidecar');
    assert.ok(played.queue[0].uri.includes('srv=cloud'));
});
