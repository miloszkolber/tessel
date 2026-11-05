/* Duration-only adaptation of upstream 7a0896390d85. USB listings probe two
 * files at a time. No network speculation, whole-moov reads or track cache.
 * Cached durations are disposable and keyed by URI + size + mtime. */
var MediaInfo = (function () {
    'use strict';
    var KEY = 'tessel_media_v1', MAX = 400, MAX_CHARS = 128 * 1024;
    function stamp(entry) {
        return Number(entry.mtime instanceof Date ? entry.mtime.getTime() : new Date(entry.mtime || 0).getTime()) || 0;
    }
    function validDuration(ms) { return typeof ms === 'number' && isFinite(ms) && ms >= 0 && ms <= 365 * 86400000; }
    function mvhdDuration(buf) {
        var v = new DataView(buf), version = v.byteLength ? v.getUint8(0) : -1, ticks, scale;
        if (version === 0 && v.byteLength >= 20) { scale = v.getUint32(12); ticks = v.getUint32(16); }
        else if (version === 1 && v.byteLength >= 32) { scale = v.getUint32(20); ticks = v.getUint32(24) * 0x100000000 + v.getUint32(28); }
        else return 0;
        var ms = scale ? Math.round(ticks * 1000 / scale) : 0;
        return validDuration(ms) ? ms : 0;
    }
    function create(storage, deps) {
        deps = deps || {};
        var map = null;
        function load() {
            if (map) return map;
            try {
                var text = storage.getItem(KEY) || '{}';
                if (text.length <= MAX_CHARS) map = JSON.parse(text);
            } catch (e) {}
            if (!map || typeof map !== 'object' || Array.isArray(map)) map = {};
            Object.keys(map).forEach(function (uri) {
                var r = map[uri];
                if (!r || !validDuration(r.dur) || !isFinite(r.ts)) delete map[uri];
            });
            trim(); return map;
        }
        function trim() {
            var keys = Object.keys(map);
            keys.sort(function (a, b) { return map[b].ts - map[a].ts; });
            keys.slice(MAX).forEach(function (uri) { delete map[uri]; });
        }
        function get(entry) {
            var r = load()[entry.uri];
            return r && r.size === entry.size && r.mtime === stamp(entry) ? r : null;
        }
        function put(entry, ms) {
            if (!entry || !entry.uri || entry.uri.length > 4096 || !validDuration(ms)) return;
            var m = load();
            m[entry.uri] = { dur: Math.round(ms), size: entry.size, mtime: stamp(entry), ts: Date.now() };
            trim();
            try {
                var text = JSON.stringify(m), oldest = Object.keys(m).sort(function (a, b) { return m[a].ts - m[b].ts; });
                while (text.length > MAX_CHARS && oldest.length) { delete m[oldest.shift()]; text = JSON.stringify(m); }
                storage.setItem(KEY, text);
            } catch (e) {}
        }
        function lookup(entry, cb) {
            var hit = get(entry);
            if (hit) { cb(null, hit); return function () {}; }
            var stopped = false, reader = null, timer;
            function close() { if (reader && reader.close) { try { reader.close(); } catch (e) {} } reader = null; }
            function finish(err, ms) {
                if (stopped) return;
                stopped = true; clearTimeout(timer); close();
                if (!err) put(entry, ms || 0);
                cb(err || null, err ? null : get(entry));
            }
            var ext = String(entry.name || '').split('.').pop().toLowerCase();
            if (!entry.file || !/^(mp4|m4v|mov|m4a|mkv|webm|mka)$/.test(ext) || !deps.mp4) {
                finish(null, 0); return function () {};
            }
            timer = setTimeout(function () { finish(new Error('metadata read timed out')); }, 15000);
            try {
                deps.mp4.openReader(entry.file, function (err, opened) {
                    if (stopped) { if (opened && opened.close) opened.close(); return; }
                    if (err) { finish(err); return; }
                    reader = opened;
                    // Bound total work even when a malformed header keeps the
                    // Matroska parser busy. Cancelled reads never reach disk.
                    // Matroska's bounded header walk may scan up to 16 MiB
                    // before Tracks and read a separately capped 4 MiB entry.
                    var budget = 20 * 1024 * 1024, reads = 0;
                    var bounded = {
                        getSize: function (done) { if (!stopped) reader.getSize(done); },
                        readRange: function (offset, length, done) {
                            if (stopped) return;
                            if (++reads > 256 || length < 0 || length > budget) { finish(new Error('metadata read budget exceeded')); return; }
                            budget -= length;
                            reader.readRange(offset, length, function (e, buf) { if (!stopped) done(e, buf); });
                        }
                    };
                    if (/^(mkv|webm|mka)$/.test(ext)) {
                        if (!deps.mkv) { finish(null, 0); return; }
                        deps.mkv.listTracks(bounded, function (e, tracks, layout) { finish(e, layout && layout.duration); });
                        return;
                    }
                    bounded.getSize(function (e, size) {
                        if (stopped) return;
                        if (e) { finish(e); return; }
                        function scan(offset, end, inside, boxes) {
                            if (stopped) return;
                            if (offset >= end || boxes >= 64) { finish(null, 0); return; }
                            deps.mp4.readBoxHeader(bounded, offset, end, function (err2, box) {
                                if (err2 || !box) { finish(err2, 0); return; }
                                if (!inside && box.type === 'moov') scan(box.body, box.end, true, 0);
                                else if (inside && box.type === 'mvhd') bounded.readRange(box.body, Math.min(32, box.end - box.body), function (err3, buf) {
                                    if (err3) { finish(err3); return; }
                                    try { finish(null, mvhdDuration(buf)); } catch (x) { finish(x); }
                                });
                                else scan(box.end, end, inside, boxes + 1);
                            });
                        }
                        scan(0, size, false, 0);
                    });
                });
            } catch (e) { finish(e); }
            return function () { stopped = true; clearTimeout(timer); close(); };
        }
        return { get: get, put: put, lookup: lookup };
    }
    var api = create(typeof localStorage !== 'undefined' ? localStorage : null, {
        mp4: typeof Mp4Subs !== 'undefined' ? Mp4Subs : null,
        mkv: typeof MkvSubs !== 'undefined' ? MkvSubs : null
    });
    api.create = create; api.mvhdDuration = mvhdDuration;
    return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MediaInfo;
