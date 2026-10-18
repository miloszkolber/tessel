var test = require('node:test');
var assert = require('node:assert/strict');
var Library = require('../../tizen-app/js/library.js');
function fixture() {
    var data = {};
    var storage = { getItem: function (k) { return data[k] || null; }, setItem: function (k, v) { data[k] = v; } };
    return { library: Library.create(storage), reload: function () { return Library.create(storage); } };
}
function episode(n) { return { uri: 'file:///drive/series/' + n + '.mkv', title: 'Episode ' + n }; }
test('queue survives reload and recommends the next unwatched episode', function () {
    var f = fixture(), items = [1, 2, 3, 4].map(episode);
    f.library.begin(items, 0); f.library.complete(items[0].uri);
    var watched = {}; items.slice(0, 3).forEach(function (p) { watched[p.uri] = 1; });
    var r = f.reload().recommendations({}, watched);
    assert.equal(r.length, 1); assert.equal(r[0].uri, items[3].uri);
    assert.equal(r[0].index, 3); assert.equal(r[0].items.length, 4);
    assert.equal(r[0].subtitle, '4 / 4');
});
test('unfinished files aggregate across sources, deduplicate and cap at ten', function () {
    var f = fixture();
    for (var i = 0; i < 15; i++) {
        var uri = (i % 2 ? 'https://server/' : 'file:///drive/') + i + '.mp4';
        f.library.begin([{ uri: uri }], 0); f.library.checkpoint(uri, 60000, 600000);
    }
    var r = f.reload().recommendations({}, {});
    assert.equal(r.length, 10); assert.equal(new Set(r.map(function (p) { return p.uri; })).size, 10);
    assert.ok(r.some(function (p) { return /^https:/.test(p.uri); }));
    assert.ok(r.some(function (p) { return /^file:/.test(p.uri); }));
});
test('dismissal survives reload and does not reappear through legacy resume', function () {
    var f = fixture(), uri = episode(1).uri, resume = {}; resume[uri] = { pos: 60000, dur: 600000 };
    f.library.begin([episode(1)], 0); f.library.checkpoint(uri, 60000, 600000);
    var r = f.library.recommendations(resume, {});
    assert.equal(r.length, 1); f.library.dismiss(r[0].key, uri);
    assert.deepEqual(f.reload().recommendations(resume, {}), []);
    f.library.begin([episode(1)], 0); f.library.checkpoint(uri, 60000, 600000);
    assert.equal(f.reload().recommendations(resume, {}).length, 1);
});
test('completed final episode and barely started single files are absent', function () {
    var f = fixture(); f.library.begin([episode(1), episode(2)], 1); f.library.complete(episode(2).uri);
    assert.deepEqual(f.reload().recommendations({}, {}), []);
    f.library.begin([episode(3)], 0); f.library.checkpoint(episode(3).uri, 1000, 100000);
    assert.deepEqual(f.reload().recommendations({}, {}), []);
});
test('recent streams deduplicate by URL, resolve names and remove durably', function () {
    var f = fixture();
    f.library.recent('https://example.com/My_Film.mp4?token=1');
    f.library.recent('https://example.com/My_Film.mp4?token=1', 'Renamed');
    assert.equal(f.reload().recents().length, 1); assert.equal(f.reload().recents()[0].name, 'Renamed');
    assert.equal(f.library.title('https://example.com/My_Film.mp4?token=1'), 'My Film');
    f.library.removeRecent('https://example.com/My_Film.mp4?token=1'); assert.deepEqual(f.reload().recents(), []);
});
test('damaged stored queue entries cannot break Home', function () {
    var library = Library.create({ getItem: function () { return JSON.stringify({ queues: [null, {}, { key: 'q', items: [null], index: 0 }], recent: [null] }); } });
    assert.deepEqual(library.recommendations({}, {}), []); assert.deepEqual(library.recents(), []);
});
