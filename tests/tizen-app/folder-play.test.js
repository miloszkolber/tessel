'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
function moduleForTest() {
    var c = { module: { exports: {} }, FileTypes: require('../../tizen-app/js/filetypes.js'), setTimeout: setTimeout, clearTimeout: clearTimeout };
    vm.createContext(c); vm.runInContext(fs.readFileSync('tizen-app/js/folder-play.js', 'utf8'), c);
    return c.module.exports;
}
function dir(path) { return { kind: 'usb', root: 'drive', path: path }; }
function child(name) { return { name: name, isDir: true, node: dir(name) }; }
function track(name) { return { name: name, isDir: false, track: { uri: name, title: name } }; }

test('recursive music playback keeps path order despite out-of-order replies and bounds concurrency', function () {
    var folder = moduleForTest(), pending = {}, result, info, outstanding = 0, peak = 0;
    folder.walk(dir('/'), function (node, cb) {
        outstanding++; peak = Math.max(peak, outstanding);
        pending[node.path] = function (entries) { outstanding--; cb(null, entries); };
    }, null, function (err, tracks, details) { assert.ifError(err); result = tracks; info = details; });
    pending['/']([child('C'), child('A'), child('B'), track('root.mp3'), track('not-video.mp4')]);
    assert.equal(outstanding, 3);
    pending.C([track('c.mp3')]); pending.B([track('b.mp3')]); pending.A([track('a.mp3')]);
    assert.equal(Array.from(result).map(function (t) { return t.uri; }).join(','), 'root.mp3,a.mp3,b.mp3,c.mp3');
    assert.equal(peak, 3); assert.equal(info.failed, 0);
});

test('scan cancellation suppresses late replies and duplicate callbacks cannot publish twice', function () {
    var folder = moduleForTest(), reply, published = 0;
    var stop = folder.walk(dir('/'), function (node, cb) { reply = cb; }, function () { published++; }, function () { published++; });
    stop(); reply(null, [track('late.mp3')]); assert.equal(published, 0);
    var times = 0;
    folder.walk(dir('/'), function (node, cb) { cb(null, []); cb(null, [track('duplicate.mp3')]); }, null, function () { times++; });
    assert.equal(times, 1);
});

test('synchronous deep listings, root errors, cycles and track limits remain bounded', function () {
    var folder = moduleForTest(), scanned = 0, result, info;
    folder.walk(dir('/'), function (node, cb) { scanned++; cb(null, [child('/'), track('a.mp3'), track('b.mp3'), track('c.mp3')]); }, null,
        function (err, tracks, details) { assert.ifError(err); result = tracks; info = details; }, { maxTracks: 2 });
    assert.equal(result.length, 2); assert.equal(info.truncated, true); assert.equal(scanned, 1);
    folder.walk(dir('/'), function (node, cb) { cb(new Error('root unavailable')); }, null, function (err) { assert.match(err.message, /unavailable/); });
    scanned = 0;
    folder.walk(dir('/'), function (node, cb) { scanned++; cb(null, [child('/'), track('a.mp3')]); }, null, function (err, tracks) { assert.ifError(err); assert.equal(tracks.length, 1); });
    assert.equal(scanned, 1);
});

test('a depth-limited branch does not discard playable sibling folders', function () {
    var folder = moduleForTest(), result;
    var listings = { '/': [child('A'), child('B')], A: [child('deep')], B: [track('b.mp3')] };
    folder.walk(dir('/'), function (node, cb) { cb(null, listings[node.path]); }, null, function (err, tracks, info) {
        assert.ifError(err); result = tracks; assert.equal(info.truncated, true);
    }, { maxDepth: 1 });
    assert.equal(result[0].uri, 'b.mp3');
});
