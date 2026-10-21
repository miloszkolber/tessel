'use strict';

var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
var source = fs.readFileSync('tizen-app/js/library-ui.js', 'utf8');

function harness() {
    var pins = [1, 2, 3].map(function (n) { return { id: String(n), kind: 'url', path: 'https://example.com/' + n, name: 'Pin ' + n }; });
    var recommendations = [1, 2].map(function (n) { return { key: 'queue:' + n, uri: 'file:///' + n, title: 'Queue ' + n }; });
    var rows = {}, menus = [], restores = [], rename, removed = [], opened = false;
    var body = { dataset: {}, matches: function () { return false; } }, input = {};
    function makeCard(item, run, menu) {
        var node = { dataset: { cardKey: item.key || item.path }, classList: { add: function () {} } };
        node.menu = function () { opened = true; context.document.activeElement = body; menu(node); };
        Object.defineProperty(node, 'nextElementSibling', { get: function () { return node.row[node.row.indexOf(node) + 1] || null; } });
        Object.defineProperty(node, 'previousElementSibling', { get: function () { return node.row[node.row.indexOf(node) - 1] || null; } });
        return node;
    }
    var context = {
        document: { activeElement: { dataset: { cardKey: 'old-render-focus' } }, getElementById: function (id) { return id === 'url-input' ? input : { classList: { contains: function () { return false; } } }; } },
        row: function (host, title, items, render, empty, mode) {
            var cards = items.map(render); cards.forEach(function (n) { n.row = cards; });
            rows[mode === 'shortcut-row' ? 'pins' : 'continue'] = cards;
        }, card: makeCard, t: function (key) { return key; },
        descriptor: function () { return {}; }, streamInfo: function () { return { icon: 'file-video-fill' }; },
        restore: function (key, fallback) { restores.push({ key: key, fallback: fallback }); },
        UI: { refreshFocusables: function () {} }, launch: function () {}, openPin: function () {},
        Favorites: { list: function () { return pins; }, remove: function (id) { pins = pins.filter(function (s) { return s.id !== id; }); }, rename: function (id, name) { pins.forEach(function (s) { if (s.id === id) s.name = name; }); } },
        Library: { recommendations: function () { return recommendations; }, dismiss: function (key) { recommendations = recommendations.filter(function (r) { return r.key !== key; }); }, removeRecent: function (url) { removed.push(url); } },
        Dialog: { isOpen: function () { return opened; }, menu: function (title, options) { menus.push(options); }, rename: function (title, value, cb) { rename = cb; opened = true; } },
        VlcApp: { refreshHome: function () { context.home(); } },
        pinAction: function () { return { name: 'Pin', run: function () {} }; },
        SavedStreams: { remove: function (id) { removed.push(id); } }, stream: function () {},
        SMB: { removeServer: function (id) { removed.push(id); } },
        sourceKey: function (s) { return s.kind + ':' + s.srv; }, network: function (key) { restores.push({ key: key }); }, refreshBadges: function () {}
    };
    vm.createContext(context);
    [['    function adjacentCardKey(', '    function launch('], ['    function streamMenu(', '    function receive()'], ['    function sourceMenu(', '    function addSource()']].forEach(function (boundary) {
        var start = source.indexOf(boundary[0]), end = source.indexOf(boundary[1], start);
        assert.ok(start >= 0 && end > start); vm.runInContext(source.slice(start, end), context);
    });
    return { context: context, rows: rows, restores: restores, removed: removed, input: input,
        run: function (index) { opened = false; context.document.activeElement = body; menus[menus.length - 1][index].run(); },
        rename: function (name) { opened = false; context.document.activeElement = body; rename(name); },
        cards: function (keys) { var cards = keys.map(function (key) { return makeCard({ key: key }); }); cards.forEach(function (n) { n.row = cards; }); return cards; }
    };
}

test('Home rename restores the invoking pin rather than the render-time focus', function () {
    var h = harness(); h.context.home();
    h.rows.pins[2].menu(); h.run(1); h.rename('Renamed');
    assert.equal(h.restores[h.restores.length - 1].key, 'https://example.com/3');
});

test('Home removal selects next or previous cards and leaves empty rows to the normal fallback', function () {
    var h = harness(); h.context.home();
    h.rows.pins[1].menu(); h.run(0);
    assert.equal(h.restores[h.restores.length - 1].key, 'https://example.com/3');
    h.rows.pins[1].menu(); h.run(0);
    assert.equal(h.restores[h.restores.length - 1].key, 'https://example.com/1');
    h.rows.pins[0].menu(); h.run(0);
    assert.equal(h.restores[h.restores.length - 1].key, null);
    h.rows.continue[1].menu(); h.run(0);
    assert.equal(h.restores[h.restores.length - 1].key, 'queue:1');
});

test('saved/recent removal stays in its row until the row becomes empty', function () {
    var h = harness(), cards = h.cards(['saved:one', 'saved:two']);
    h.context.streamMenu({ id: 'two', url: 'https://example.com/two', name: 'Two' }, cards[1], false); h.run(2);
    assert.equal(h.restores[0].key, 'saved:one'); assert.equal(h.removed[0], 'two');
    cards = h.cards(['recent:one']);
    h.context.streamMenu({ url: 'https://example.com/one', name: 'One' }, cards[0], true); h.run(2);
    assert.equal(h.restores[1].key, null); assert.equal(h.restores[1].fallback, h.input);
    assert.equal(h.removed[1], 'https://example.com/one');
});

test('confirmed source removal restores its adjacent source rather than always selecting Add', function () {
    var h = harness(), cards = h.cards(['smb:one', 'smb:two', 'add-source']);
    h.context.sourceMenu({ kind: 'smb', srv: 'one', name: 'One' }, cards[0]); h.run(2); h.run(0);
    assert.equal(h.removed[0], 'one'); assert.equal(h.restores[0].key, 'smb:two');
});
