'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');

test('DLNA displayed order and playback order agree on first entry and cached re-entry', function () {
    function node() {
        var markup = '';
        var n = { children: [], dataset: {}, classList: { add: function () {} },
            addEventListener: function (name, fn) { this[name] = fn; },
            appendChild: function (child) { this.children.push(child); } };
        Object.defineProperty(n, 'innerHTML', { get: function () { return markup; }, set: function (s) { markup = s; this.children = []; } });
        Object.defineProperty(n, 'firstElementChild', { get: function () { return this.children[0]; } });
        return n;
    }
    var ids = {}, played, requests = 0;
    var entries = [ { title: 'Z', url: 'http://media/Z.mkv' }, { title: 'A', url: 'http://media/A.mkv' },
        { title: 'Series', id: 'series', isDir: true }, { title: 'B', url: 'http://media/B.mkv' } ];
    var scope = {
        window: { VlcApp: { play: function (origin, queue, index) { played = { queue: queue, index: index }; } } },
        localStorage: { getItem: function () { return JSON.stringify([{ id: 'server', name: 'Media' }]); }, setItem: function () {} },
        document: { getElementById: function (id) { return ids[id] || (ids[id] = node()); }, createElement: node },
        UI: { showView: function () {}, refreshFocusables: function () {}, focusOn: function () {} },
        Remote: { push: function (fn) { return fn; }, pop: function () {} },
        I18n: require('./helpers/i18n.js'), FileTypes: require('../../tizen-app/js/filetypes.js'),
        SMB: { ensureService: function (cb) { cb(null); } },
        XMLHttpRequest: function () {
            this.open = function (method, url) { this.url = url; }; this.setRequestHeader = function () {};
            this.send = function () {
                var browse = this.url.indexOf('/dlna/browse') >= 0;
                if (browse) requests++;
                this.responseText = JSON.stringify(browse ? { ok: true, entries: entries } :
                    { ok: true, servers: [{ id: 'server', name: 'Media', control: 'http://media/control' }] });
                this.onload();
            };
        }
    };
    vm.runInNewContext(fs.readFileSync('tizen-app/js/dlna.js', 'utf8'), scope);
    function check() {
        scope.DLNA.openFolder('server', '0');
        var rows = ids['browse-list'].children;
        assert.equal(rows.length, 4);
        assert.ok(rows[0].innerHTML.includes('Series'));
        assert.equal(rows.slice(1).map(function (row) { return row.dataset.uri; }).join(','), 'http://media/A.mkv,http://media/B.mkv,http://media/Z.mkv');
        rows[1].click();
        assert.equal(played.queue.map(function (item) { return item.title; }).join(','), 'A,B,Z');
        assert.equal(played.index, 0);
    }
    check();
    scope.DLNA.detach();
    check();
    assert.equal(requests, 1, 're-entry reuses the cached listing');
});
