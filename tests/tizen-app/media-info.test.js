'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var MediaInfo = require('../../tizen-app/js/media-info.js');
var Mp4 = require('../../tizen-app/js/mp4-subs.js');
function storage(initial) {
    var value = initial || '{}';
    return { getItem: function () { return value; }, setItem: function (key, text) { value = text; }, value: function () { return JSON.parse(value); } };
}
function box(type, body) {
    var b = Buffer.alloc(body.length + 8); b.writeUInt32BE(b.length); b.write(type, 4); body.copy(b, 8); return b;
}
function mvhd(version) {
    var b = Buffer.alloc(version ? 32 : 20); b[0] = version;
    b.writeUInt32BE(1000, version ? 20 : 12); b.writeUInt32BE(125000, version ? 28 : 16); return b;
}
test('MP4 duration parses both mvhd versions and rejects invalid or truncated data', function () {
    [0, 1].forEach(function (v) { var b = mvhd(v); assert.equal(MediaInfo.mvhdDuration(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), 125000); });
    assert.equal(MediaInfo.mvhdDuration(new ArrayBuffer(0)), 0);
    assert.equal(MediaInfo.mvhdDuration(new ArrayBuffer(7)), 0);
});
test('USB header lookup skips media payload and closes its reader exactly once', function () {
    var bytes = Buffer.concat([box('mdat', Buffer.alloc(100000)), box('moov', Buffer.concat([box('free', Buffer.alloc(5000)), box('mvhd', mvhd(1))]))]);
    var reads = 0, closed = 0, total = 0;
    var cache = MediaInfo.create(storage(), { mp4: { readBoxHeader: Mp4.readBoxHeader, openReader: function (file, cb) { cb(null, {
        getSize: function (done) { done(null, bytes.length); },
        readRange: function (offset, len, done) { reads++; total += len; var b = bytes.subarray(offset, offset + len); done(null, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); },
        close: function () { closed++; }
    }); } } });
    var e = { uri: 'file:///film.mp4', name: 'film.mp4', file: {}, size: bytes.length, mtime: 1 }, result;
    cache.lookup(e, function (err, info) { assert.ifError(err); result = info; });
    assert.equal(result.dur, 125000); assert.equal(closed, 1); assert.ok(reads <= 5); assert.ok(total < 200);
    cache.lookup(e, function (err, info) { assert.ifError(err); assert.equal(info.dur, 125000); }); assert.equal(closed, 1);
});
test('cache invalidation, corruption, unsupported formats and bounded growth are deterministic', function () {
    var store = storage('[]'), cache = MediaInfo.create(store), e = { uri: 'file:///a', size: 1, mtime: 3 };
    cache.put(e, 90000); assert.equal(cache.get(e).dur, 90000);
    assert.equal(cache.get({ uri: e.uri, size: 2, mtime: 3 }), null);
    assert.equal(cache.get({ uri: e.uri, size: 1, mtime: 4 }), null);
    cache.put(e, Infinity); assert.equal(cache.get(e).dur, 90000);
    for (var i = 0; i < 405; i++) cache.put({ uri: 'file:///' + i, size: 1 }, i);
    assert.equal(Object.keys(store.value()).length, 400);
    cache.lookup({ uri: 'file:///notes', name: 'notes.txt' }, function (err, info) { assert.ifError(err); assert.equal(info.dur, 0); });
});
test('cancel before open closes late readers and prevents publication or cache writes', function () {
    var opened, closed = 0, calls = 0, store = storage();
    var cache = MediaInfo.create(store, { mp4: { openReader: function (file, cb) { opened = cb; } } });
    var cancel = cache.lookup({ uri: 'file:///a', name: 'a.mp4', file: {} }, function () { calls++; });
    cancel(); opened(null, { close: function () { closed++; } });
    assert.equal(closed, 1); assert.equal(calls, 0); assert.deepEqual(store.value(), {});
});
test('cancel in flight and read-budget overflow cannot publish stale Matroska metadata', function () {
    var reply, closed = 0, calls = 0;
    var deps = { mp4: { openReader: function (file, cb) { cb(null, {
        readRange: function (off, len, done) { reply = done; }, close: function () { closed++; }
    }); } }, mkv: { listTracks: function (reader, done) { reader.readRange(0, 10, function () { done(null, [], { duration: 50000 }); }); } } };
    var cache = MediaInfo.create(storage(), deps), e = { uri: 'file:///a', name: 'a.mkv', file: {} };
    var cancel = cache.lookup(e, function () { calls++; }); cancel(); reply(null, new ArrayBuffer(10));
    assert.equal(closed, 1); assert.equal(calls, 0); assert.equal(cache.get(e), null);
    deps.mkv.listTracks = function (reader) { reader.readRange(0, 21 * 1024 * 1024, function () {}); };
    cache.lookup(e, function (err) { assert.match(err.message, /budget/); calls++; });
    assert.equal(calls, 1); assert.equal(closed, 2);
});

test('listing probes admit only two readers and ignore results after navigation', function () {
    var fs = require('node:fs'), vm = require('node:vm'), src = fs.readFileSync('tizen-app/js/app.js', 'utf8');
    var pending = [], active = 0, peak = 0, cancelled = 0, lines = [{}, {}, {}, {}];
    var context = { lengthCancels: [], browseSequence: 1, fmtTime: function () { return '02:05'; },
        MediaInfo: { lookup: function (entry, done) { active++; peak = Math.max(peak, active); pending.push(function () { active--; done(null, { dur: 125000 }); }); return function () { cancelled++; }; } } };
    vm.createContext(context);
    vm.runInContext(src.slice(src.indexOf('    function fillLengths('), src.indexOf('    /* ── Favorites')), context);
    context.fillLengths(lines.map(function (line) { return { entry: {}, meta: '1 GB', li: { querySelector: function () { return line; } } }; }), 1);
    assert.equal(pending.length, 2); pending[0](); assert.equal(pending.length, 3); assert.equal(lines[0].textContent, '1 GB · 02:05');
    context.browseSequence++; context.lengthCancels.forEach(function (request) { request.cancel(); });
    pending[1](); pending[2](); assert.equal(lines[1].textContent, undefined); assert.equal(pending.length, 3);
    assert.equal(peak, 2); assert.equal(cancelled, 2);
});
