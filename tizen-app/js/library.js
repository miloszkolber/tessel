/* Persistent queue continuation and Stream recents. Decoder/file handles and
 * server credentials never enter this store. Source modules own credentials. */
var Library = (function () {
    'use strict';
    function create(storage) {
        var KEY = 'tessel_library_v1', active = null;
        function read() {
            var data;
            try { data = JSON.parse(storage.getItem(KEY) || '{}'); } catch (e) {}
            if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
            if (!Array.isArray(data.queues)) data.queues = [];
            if (!Array.isArray(data.recent)) data.recent = [];
            if (!Array.isArray(data.hidden)) data.hidden = [];
            data.queues = data.queues.filter(function (q) {
                return q && typeof q.key === 'string' && Array.isArray(q.items) && q.items.length &&
                    q.items.every(function (p) { return p && typeof p.uri === 'string' && p.uri; }) &&
                    typeof q.index === 'number' && q.index >= 0 && q.index % 1 === 0;
            });
            data.recent = data.recent.filter(function (s) { return s && typeof s.url === 'string' && s.url; });
            return data;
        }
        function write(data) {
            try { storage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
        }
        function title(url) {
            var clean = String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');
            var name = clean.slice(clean.lastIndexOf('/') + 1);
            try { name = decodeURIComponent(name); } catch (e) {}
            return name.replace(/\.(m3u8?|pls|mp4|mkv|mp3|flac|webm|m4a)$/i, '').replace(/[_]+/g, ' ') || clean;
        }
        function item(p) {
            return { uri: String(p.uri || ''), title: String(p.title || title(p.uri)), art: p.art || null,
                     source: p.source || null,
                     subtitles: (p.subtitles || []).map(function (s) { return { name: s.name, lang: s.lang, ext: s.ext, uri: s.uri }; }) };
        }
        function begin(items, index) {
            if (!items || !items[index]) return;
            var data = read(), list = items.map(item);
            var key = (list.length > 1 ? 'queue:' : 'file:') + list[0].uri;
            var q = { key: key, items: list, index: index, pos: 0, dur: 0, ts: Date.now(), dismissed: false };
            data.queues = data.queues.filter(function (old) { return old.key !== key; });
            data.queues.unshift(q); data.queues = data.queues.slice(0, 20);
            data.hidden = data.hidden.filter(function (uri) { return uri !== list[index].uri; });
            active = key; write(data);
        }
        function change(uri, pos, dur, complete) {
            if (!uri) return;
            var data = read(), q = data.queues.filter(function (entry) { return entry.key === active; })[0];
            if (!q) return;
            var index = -1;
            for (var i = 0; i < q.items.length; i++) if (q.items[i].uri === uri) { index = i; break; }
            if (index < 0) return;
            q.index = index + (complete ? 1 : 0); q.pos = complete ? 0 : Math.max(0, pos || 0);
            q.dur = complete ? 0 : Math.max(0, dur || 0); q.ts = Date.now();
            write(data);
        }
        function recommendations(resume, watched) {
            var data = read(), out = [], covered = {};
            data.queues.forEach(function (q) {
                q.items.forEach(function (p) { covered[p.uri] = true; });
                if (q.dismissed) return;
                var at = q.index;
                // Advance over items already completed, including progress
                // retained from before queue snapshots were introduced.
                while (at < q.items.length && watched[q.items[at].uri]) at++;
                if (at >= q.items.length) return;
                var p = q.items[at], r = resume[p.uri] || {};
                var pos = r.pos || (at === q.index ? q.pos : 0), dur = r.dur || (at === q.index ? q.dur : 0);
                if (dur && pos / dur >= 0.95) { at++; p = q.items[at]; pos = 0; dur = 0; }
                if (!p || (q.items.length === 1 && (pos < 30000 || !dur))) return;
                out.push({ key: q.key, uri: p.uri, title: p.title, art: p.art, source: p.source,
                    items: q.items, index: at, pos: pos, dur: dur, ts: q.ts,
                    subtitle: q.items.length > 1 ? (at + 1) + ' / ' + q.items.length : '' });
            });
            Object.keys(resume).forEach(function (uri) {
                var r = resume[uri];
                if (covered[uri] || data.hidden.indexOf(uri) >= 0 || !r.dur || r.pos < 30000 || r.pos / r.dur >= 0.95) return;
                out.push({ key: 'legacy:' + uri, uri: uri, title: title(uri), pos: r.pos, dur: r.dur, ts: r.ts || 0,
                    items: [{ uri: uri, title: title(uri) }], index: 0 });
            });
            out.sort(function (a, b) { return b.ts - a.ts; });
            var seen = {};
            return out.filter(function (r) { if (seen[r.uri]) return false; seen[r.uri] = true; return true; }).slice(0, 10);
        }
        function dismiss(key, uri) {
            var data = read();
            data.queues.forEach(function (q) { if (q.key === key) q.dismissed = true; });
            if (data.hidden.indexOf(uri) < 0) data.hidden.push(uri);
            data.hidden = data.hidden.slice(-200); write(data);
        }
        function recent(url, name) {
            var data = read();
            data.recent = data.recent.filter(function (s) { return s.url !== url; });
            data.recent.unshift({ url: url, name: name || title(url), ts: Date.now() });
            data.recent = data.recent.slice(0, 20); write(data);
        }
        function removeRecent(url) { var d = read(); d.recent = d.recent.filter(function (s) { return s.url !== url; }); write(d); }
        return { begin: begin, checkpoint: function (u, p, d) { change(u, p, d, false); },
            complete: function (u) { change(u, 0, 0, true); }, recommendations: recommendations, dismiss: dismiss,
            title: title, recent: recent, recents: function () { return read().recent; }, removeRecent: removeRecent };
    }
    var api = create(typeof localStorage !== 'undefined' ? localStorage : null);
    api.create = create;
    return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Library;
