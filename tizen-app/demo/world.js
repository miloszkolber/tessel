/* Tessel simulator — the virtual world the real app talks to.
 *
 * This file replaces the TV: it provides tizen.filesystem (a USB drive with
 * generated media), the background service API over XHR (/smb, /dav, /dlna,
 * /cast, /debug) and the platform info the app asks for.  Everything above it
 * — the app's own modules, markup, CSS and remote handling — is the production
 * code, so a flow that works here is the flow the TV runs.
 *
 * Loaded before app.js by demo.html. ES5, like the app. */
var Simulator = (function () {
    'use strict';

    /* ── generated media ──────────────────────────────────────────────── */
    /* An MP3 with a real ID3v2 tag: title, artist, album, and a PNG as cover
     * art.  The app's own tag reader parses it, so the music card shows what
     * it would show on a TV. */
    function id3Png() {
        // 96×96 cover: a soft disc on a dark plate.
        return 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAGCUlEQVR42u2d6W7jMAyE9RKb3m1633ff/9l2gFkQBCnR'
               + '8pE03RLgj0WiOtbn4ZC2bG9Zrf5kBFESQQJKQAkoASWgMPb2Vq34pYACInH8z4DMVPf398bGt8Aq2+Ti53xwsN8TMayf'
               + 'CqiKRk/78PBAx9HRoQ7zbZXXFjCVjaLxXAyO4+MjxsnJsQ/51iALSO06oBYaA4XzPz09OTs7RazXZ63gAIwUZBrWFjCV'
               + 'zdExaMiFUDDz8/P1xcX68vIccXV1cX196QOfcwBGYjx5ERZJeUyLMyrL0jFoRDLChVAw85ubq9vb67u7m/v724eHO8Tj'
               + '470OfohvMQYjMZ68sAUhpQXlMe0KIJ9TohqRDI4/5gZREApxPD8/vrw8IV5fn9/eXnzgcw7ASCIjLGwHW8M2RVBaTSbj'
               + 'vhlQSziiGkyDeiGXp6cHIfL+/vrx8Yb4/HxvBQdgpPDCFkiKmhJMknTLSqksSEd7jagG00CaUC+YIaFw8l9fHyaES+sr'
               + 'wsJ2qClsGdsXNWlvWopRWZwODiY8ggmF44xp4LBTL2byRiM+tL7MX1FT2DK2j19h0uF3jZTmMyoL0hHhQPlwCiQCjjOm'
               + 'wUl6ITBrmDgY6YPJqPNRw+J28BVG4rfwi5Jx4krzGZU5dMR0JK1QYnAwoXw4BRPKzEeOPGaFMbpa+ZDqhpHkpUnJZpl0'
               + 'GIM/wa9jHyTdtCVNY1Tma0enFRzBC8d4B11W6jdLOEM6IPmEA6QbICntZV5KdCVJt5k6KgvSwUzoOFo43lalr5FuMA5B'
               + 'JqSM5Wsp0ZUwcilGowHFdLDT1QMraAwXNsqDYUhpTF6q2IdBRhsBVHVlT8ccT922jOUSkDKNldGsYVT17IUBaWPWNatK'
               + 'h8Kh2nGo2fsGaIL8ijFhy5QS/VvvgGbk61p/opUJ1sN+hzULR7JKh36phdMPpROWkZKkm2GEAaxr7I/GmlGZIB9aDzoO'
               + '7B/2DEevSqclHG/Ag9HCpKVUZYR9w+cYgL01ZrQYoGpyIbGxZ5A39knyv0qnE43UdR39mKqM6IP4BPuJMd6MehiVCZVL'
               + 'rAcGib2RCtJJJ4bSCo8pZqT3CvspZjS2opWx8tHJJdYjNatKJ0bDVjCITkyaka5rNCOdaKNEVPrloysXfNEklz5vDOi0'
               + 'uOAPfbRIxYzkDNkkGj7XFa1TRGWCfFi5RMa0Hp4KyXW/gE7Mhf1kQGqQES+wMP2FEf7NijZWRGVU8QJ+erM/Pj65Yjqa'
               + 'SBweU8DImJHRON3aONEsQD3yYbvRSi5Pp4qGJ+4mAkyeUTXRtEvGIhoNqCof7T6mjlaTq0WnxcVcsfek+hkx0bSIjBN1'
               + 'iqj02zP6CClesXx66HgorTCYehi1RCTlTHqiQasu/fmFhp29j1w8HZRPTEdTwGZ9VFeBWowGRcQdZk+EuXRmWRcgnV/a'
               + 'nlm8YvkM0tFE5GJrFVPAKBCR7mZp1a0sGwHIGJCcW5j80p3hoHw8Hc/Fh8FkGMUi0n2jyTI58xi0odJpQL5+VfMrlo+n'
               + 'o6/P+zCY/IrroIh0lvla1mNDA4CMAZlfCvKrJR9PRxPhGoYsqGpMhlGPiKpZxuNqbGgioNiA5IqUyS9TvFry0XSEiw/D'
               + 'qCUiU85MlrGWTbOhEYB0Ay1ngFyNqgIalI+h4xfmDaNBEXlAskInxV5a6umAfIsYOHSPAXlAfl2QIWuqBlNVRAEgY0OB'
               + 'Tw+2i6WzhLFF7HToIL+q8tFodGhARkRBlvX4tG4XZwHSPXR/CRsFSLTDlXgJ0dEmAGELvp9eDJDuoeMSpgEF+SW3Kui7'
               + 'XryIqlk2CIhL4bqf3i1APQakAeml6h5Aeqn2RwL6jQpKD8oqln3QnD4oO+k8F1voXCzP5vN60IzrQXlFMa9Jz7gmnasa'
               + 'uS62xLpYrqzm2vyMtfm8uyPvD5oNKO8wy3sUZ9+jmHe55n3Sq7zTfsN32uezGvm0Tz4vtoXnxfKJw3xmNZ963sJTz/nc'
               + 'fL55Id/dkW9/2ZW3v+T7g/INVPkOs3wLXr5H8Ue9RzHfxJnvcs23Aef7pPON5PlO+/xfEfJ/RUhACSgBZfyLvxdsAQGj'
               + 'NZ3qAAAAAElFTkSuQmCC';
    }
    function u32(n) {
        return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    }
    function frame(id, text) {
        var data = [3].concat(utf8Bytes(text));                 // UTF-8 encoding byte
        var size = data.length;
        var h = [id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3)]
            .concat(u32(size));                                 // 4-byte size (v2.3)
        return h.concat([0, 0]).concat(data);
    }
    function apicFrame() {
        var png = base64Bytes(id3Png());
        var head = [3].concat(utf8Bytes('image/png')).concat([0, 3, 0]);   // mime, type, description
        var data = head.concat(png);
        var size = data.length;
        var h = [65, 80, 73, 67].concat(u32(size));
        return h.concat([0, 0]).concat(data);
    }
    function syncsafe(n) {
        return [(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f];
    }
    function mp3Bytes(title, artist, album) {
        var frames = frame('TIT2', title).concat(frame('TPE1', artist))
                                        .concat(frame('TALB', album))
                                        .concat(apicFrame());
        var head = [73, 68, 51, 3, 0, 0].concat(syncsafe(frames.length));
        // A little silent MPEG audio so the file looks like audio to any reader.
        var audio = [];
        for (var i = 0; i < 4096; i++) audio.push(0xff, 0xfb, 0x90, 0x00);
        return head.concat(frames).concat(audio);
    }

    function utf8Bytes(s) {
        var out = [];
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 128) out.push(c);
            else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
            else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
        }
        return out;
    }
    function base64Bytes(b64) {
        var bin = (typeof atob === 'function') ? atob(b64) : '';
        var out = [];
        for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
        return out;
    }

    /* Cues the subtitle overlay paints: the same shape a sidecar SRT has.
     * A cue every 6 s for 4 s across the whole running time, so seeking
     * anywhere in a file lands on one. */
    function srtText(prefix, durationMs) {
        var total = Math.max(60000, Math.min(3600000, +durationMs || 0));
        var count = Math.max(10, Math.min(200, Math.floor(total / 6000)));
        var out = [];
        for (var i = 1; i <= count; i++) {
            var t = (i - 1) * 6000;
            out.push(i);
            out.push(stamp(t) + ' --> ' + stamp(t + 4000));
            out.push(prefix + ' line ' + i + ' - the app paints this cue itself.');
            out.push('');
        }
        return out.join('\n');
    }
    function stamp(ms) {
        function p(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
        var s = Math.floor(ms / 1000);
        return p(Math.floor(s / 3600), 2) + ':' + p(Math.floor(s / 60) % 60, 2) + ':' +
               p(s % 60, 2) + ',' + p(ms % 1000, 3);
    }

    /* ── the virtual USB drive ────────────────────────────────────────── */
    /* Each entry: { name, size, bytes() } for files, { name, children } for
     * folders.  Durations live in DURATIONS by file name so the simulated
     * decoder, the subtitle sidecars and the browse list agree. */
    var DURATIONS = {
        'Big Buck Bunny.mp4': 596000,
        'Documentary.mkv': 2700000,
        'S01E01 - Pilot.mkv': 2640000,
        'S01E02 - The Second One.mkv': 2580000,
        'S02E01 - Return.mkv': 2610000,
        'Theme song.mp3': 214000,
        'Episode 12.mp3': 1980000
    };
    /* What a sidecar belongs to: "Documentary.en.srt" → "Documentary.mkv". */
    function durationOfSidecar(name) {
        var base = String(name).replace(/\.[a-z]{2}(-[a-z]{2})?\.srt$/i, '').replace(/\.srt$/i, '');
        for (var k in DURATIONS) if (k.replace(/\.[a-z0-9]+$/i, '') === base) return DURATIONS[k];
        return 1800000;
    }

    var usbMounted = true;
    var DRIVE = { name: 'USB Drive', children: [
        { name: 'Series', children: [
            { name: 'Season 1', children: [
                { name: 'S01E01 - Pilot.mkv', size: 1456000000, srt: 'S01E01 - Pilot.en.srt' },
                { name: 'S01E01 - Pilot.en.srt', size: 41000 },
                { name: 'S01E02 - The Second One.mkv', size: 1288000000 },
                { name: 'S01E03 - Crossroads.mkv', size: 1288000000 },
                { name: 'S01E04 - Home.mkv', size: 1288000000 }
            ] },
            { name: 'Season 2', children: [
                { name: 'S02E01 - Return.mkv', size: 1330000000 }
            ] }
        ] },
        { name: 'Films', children: [
            { name: 'Big Buck Bunny.mp4', size: 64000000, srt: 'Big Buck Bunny.en.srt' },
            { name: 'Big Buck Bunny.en.srt', size: 38000 },
            { name: 'Documentary.mkv', size: 2240000000, srt: 'Documentary.en.srt' },
            { name: 'Documentary.en.srt', size: 52000 }
        ] },
        { name: 'Music', children: [
            { name: 'Theme song.mp3', size: 8600000, mp3: ['Theme song', 'Tessel Demo Band', 'Simulated Album'] },
            { name: 'Episode 12.mp3', size: 47000000, mp3: ['Episode 12', 'Tessel Demo Band', 'Second Album'] }
        ] },
        { name: 'channels.m3u', size: 12000, playlist: [
            '#EXTM3U',
            '#EXTINF:-1 tvg-logo="icon.png" group-title="News",Demo News',
            'http://example.invalid/news.m3u8',
            '#EXTINF:-1 tvg-logo="icon.png" group-title="News",Demo Weather',
            'http://example.invalid/weather.m3u8',
            '#EXTINF:-1 group-title="Films",Demo Film Channel',
            'http://example.invalid/film.m3u8'
        ].join('\n') }
    ] };

    /* ── virtual file objects (the TV's File interface) ───────────────── */
    function bytesFor(entry) {
        if (entry.mp3)       return mp3Bytes(entry.mp3[0], entry.mp3[1], entry.mp3[2]);
        if (/\.srt$/i.test(entry.name))
            return utf8Bytes(srtText(entry.name.replace(/\.srt$/i, ''), durationOfSidecar(entry.name)));
        if (entry.playlist)  return utf8Bytes(entry.playlist);
        return utf8Bytes('\0');
    }

    function makeFile(entry, path, parent) {
        var bytes = null;
        var file = {
            name: entry.name,
            fullPath: path + '/' + entry.name,
            isDirectory: !!entry.children,
            fileSize: entry.size || 0,
            modified: new Date(Date.UTC(2026, 4, 17, 9, 0, 0)),
            parent: parent,
            toURI: function () { return 'file://' + file.fullPath; },
            /* The header readers (MP4/MKV/ID3) work off these two, so the
             * app's own parsers read generated bytes. */
            /* Node-style callback: the app's header readers expect (err, size). */
            getSize: function (cb) { cb(null, entry.size || 0); },
            readRange: function (start, length, cb) {
                if (!bytes) bytes = bytesFor(entry);
                var end = Math.min(bytes.length, start + length);
                cb(null, new Uint8Array(bytes.slice(start, end)).buffer);
            },
            /* Text reads (sidecar subtitles, playlists). */
            openStream: function (mode, ok, err, enc) {
                var data = bytes || (bytes = bytesFor(entry));
                var text = '';
                for (var i = 0; i < data.length; i++) text += String.fromCharCode(data[i]);
                ok({
                    bytesAvailable: text.length,
                    read: function (n) { return text.slice(0, n); },
                    close: function () {}
                });
            },
            listFiles: function (ok) {
                var items = (entry.children || []).map(function (c) {
                    return makeFile(c, file.fullPath, file);
                });
                var index = {};
                items.forEach(function (f) { index[f.name] = f; });
                file._children = index;
                ok(items);
            }
        };
        return file;
    }

    function findNode(children, name) {
        for (var i = 0; i < children.length; i++) if (children[i].name === name) return children[i];
        return null;
    }
    /* "removable1/Series/Season 1" (or a leading slash) → the node + path. */
    function resolvePath(path) {
        var parts = String(path || '').split('/').filter(Boolean);
        if (!parts.length) return { node: DRIVE, path: '' };
        var node = DRIVE, walked = '';
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] === 'removable1' || parts[i] === 'usb' || parts[i] === 'USB Drive') continue;
            var next = node.children ? findNode(node.children, parts[i]) : null;
            if (!next) return null;
            node = next;
            walked += '/' + parts[i];
        }
        return { node: node, path: walked };
    }
    var ROOTS = { 'removable1': DRIVE, usb: DRIVE, 'USB Drive': DRIVE };

    var tizenShim = {
        filesystem: {
            listStorages: function (ok) {
                ok(usbMounted ? [{ label: 'removable1', type: 'EXTERNAL', state: 'MOUNTED' }] : []);
            },
            resolve: function (target, ok, err, mode) {
                setTimeout(function () {
                    if (!usbMounted) { err(new Error('USB disconnected')); return; }
                    var found = null;
                    if (ROOTS[target]) found = { node: ROOTS[target], path: '' };
                    else found = resolvePath(target);
                    if (!found) { err(new Error('not found: ' + target)); return; }
                    var drive = makeFile({ name: ROOTS[target] ? 'USB Drive' : (target.split('/').pop() || 'USB Drive'),
                                           children: found.node.children || [], size: 0 }, '', null);
                    drive.fullPath = '/removable1' + found.path;
                    drive.isDirectory = true;
                    ok(drive);
                }, 30);
            }
        },
        tvinputdevice: {
            getSupportedKeys: function () { return []; },
            registerKey: function () {}, unregisterKey: function () {},
            registerKeyBatch: function (names, ok) { if (ok) ok(); }
        },
        systeminfo: {
            getPropertyValue: function (name, ok) {
                if (name === 'BUILD') ok({ model: 'Simulated TV', manufacturer: 'Tessel',
                    buildVersion: 'demo', buildDescription: 'Simulator', buildReleaseDate: '2026-05-17' });
                else if (name === 'LOCALE') ok({ language: 'en-US' });
                else ok({});
            },
            getCapability: function () { return true; }
        },
        application: {
            getAppInfo: function () { return { id: 'sim.tessel', version: '1.19.0-sim', name: 'Tessel (simulator)' }; },
            getCurrentApplication: function () {
                return { appInfo: { id: 'sim.tessel', version: '1.19.0-sim', name: 'Tessel (simulator)' },
                         exit: function () {} };
            },
            launch: function (id, ok) { if (ok) ok(); },
            exit: function () { if (typeof UI !== 'undefined') UI.toast('Simulator: exit'); }
        },
        power: { request: function (r) { if (r && r.onchanged) r.onchanged('SCREEN_NORMAL'); },
                 release: function () {} }
    };

    /* ── the background service, as the app talks to it ───────────────── */
    /* Same endpoints and payloads the TV service serves.  The files behind
     * them are whatever SHARES below says they are. */
    /* A folder path → the entries the service would list there.  The share
     * root is what an empty path asks for. */
    var SHARES = {
        '': [
            { name: 'Films', isDir: true },
            { name: 'Music', isDir: true },
            { name: 'Big Buck Bunny.mp4', isDir: false, size: 64000000 },
            { name: 'Big Buck Bunny.en.srt', isDir: false, size: 38000 },
            { name: 'Theme song.mp3', isDir: false, size: 8600000 }
        ],
        'Films': [
            { name: 'Documentary.mkv', isDir: false, size: 2240000000 },
            { name: 'Documentary.en.srt', isDir: false, size: 52000 }
        ],
        'Music': [
            { name: 'Episode 12.mp3', isDir: false, size: 47000000 }
        ]
    };

    var DLNA_SERVERS = [
        { id: 'demo-minidlna', name: 'Demo miniDLNA', control: 'http://192.168.0.10:8200/ctl' },
        { id: 'demo-jellyfin', name: 'Demo Jellyfin', control: 'http://192.168.0.11:8096/ctl' }
    ];

    function queryOf(url) {
        var q = {}, s = String(url).split('?')[1];
        if (!s) return q;
        s.split('&').forEach(function (kv) {
            var p = kv.split('=');
            q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
        });
        return q;
    }
    function xmlList(entries) {
        var items = entries.map(function (e) {
            return '<item id="' + e.name + '" parentID="0" restricted="0">' +
                   '<dc:title>' + e.name + '</dc:title>' +
                   '<upnp:class>' + (e.isDir ? 'object.container.storageFolder'
                                             : 'object.item.videoItem') + '</upnp:class>' +
                   (e.isDir ? '<container childCount="0"/>'
                            : '<res size="' + (e.size || 0) + '" protocolInfo="http-get:*:video/mp4:*">' +
                              'http://192.168.0.10:8200/' + encodeURIComponent(e.name) + '</res>') +
                   '</item>';
        }).join('');
        return '<DIDL-Lite>' + items + '</DIDL-Lite>';
    }

    /* What the page's XHRs to the service address get back. */
    function serviceReply(url, method, body) {
        var q = queryOf(url);
        var path = q.path || '';
        if (/\/smb\/ping/.test(url))  return { ok: true, connected: true,
            servers: (typeof SMB !== 'undefined' && SMB.servers().length) ? [''] : [], dav: [] };
        if (/\/smb\/connect/.test(url)) return { ok: true, dialect: 'SMB 3.1.1 (simulated)', signing: 'off' };
        if (/\/smb\/shares/.test(url)) return { ok: true, shares: ['Media', 'Films', 'Music'].map(function (name) { return { name: name, remark: '' }; }) };
        if (/\/smb\/debug\/logs/.test(url)) return { ok: true, logs: [] };
        if (/\/smb\/list/.test(url)) {
            var key = path.replace(/^\/+/, '');
            var entries = SHARES[key];
            if (!entries) return { ok: false, error: 'no such folder: ' + (key || '/') };
            return { ok: true, entries: entries };
        }
        if (/\/smb\/stream/.test(url)) {
            var name = String(path).split('/').pop();
            var srt = /\.srt$/i.test(name)
                ? srtText(name.replace(/\.srt$/i, ''), durationOfSidecar(name)) : '';
            return { __text: srt || '\0' };
        }
        if (/\/dav\/connect/.test(url)) return { ok: true };
        if (/\/dav\/list/.test(url)) {
            return { ok: true, entries: [
                { name: 'Photos', isDir: true },
                { name: 'Cloud film.mp4', isDir: false, size: 480000000 },
                { name: 'Cloud film.en.srt', isDir: false, size: 31000 }
            ] };
        }
        if (/\/dav\/stream/.test(url)) return { __text: '\0' };
        if (/\/dlna\/discover/.test(url)) return { ok: true, servers: DLNA_SERVERS };
        if (/\/dlna\/browse/.test(url)) {
            return { ok: true, total: 3, entries: [
                { id: '1', title: 'Demo Folder', isDir: true },
                { id: '2', title: 'Big Buck Bunny.mp4', isDir: false, url: 'http://192.168.0.10:8200/bbb.mp4',
                  duration: 596, size: 64000000, kind: 'video' },
                { id: '3', title: 'Demo Song.mp3', isDir: false, url: 'http://192.168.0.10:8200/song.mp3',
                  duration: 214, size: 8600000, kind: 'audio', art: 'icon.png' }
            ] };
        }
        if (/\/local\/(enable|status)/.test(url)) return { ok: true, enabled: false, url: '' };
        if (/\/local\/disable/.test(url)) return { ok: true };
        if (/\/cast\/info/.test(url)) return { ok: true, on: castOn,
            address: 'http://simulator.local:8129/cast', debug: 'http://simulator.local:8129/debug' };
        if (/\/cast\/set/.test(url)) {
            var settings = {};
            try { settings = JSON.parse(body || '{}'); } catch (e) {}
            castOn = settings.on !== false;
            if (!castOn) castInbox = '';
            return { ok: true, on: castOn };
        }
        if (/\/cast\/poll/.test(url)) {
            var picked = castOn ? castInbox : ''; castInbox = '';
            return { ok: true, url: picked };
        }
        if (/\/debug\/log/.test(url)) return { ok: true };
        if (/\/debug\/data/.test(url)) {
            var lines = (typeof Debug !== 'undefined' && Debug.exportText)
                ? Debug.exportText({}).split('\n').slice(0, 40).map(function (t, i) {
                      return { seq: i + 1, at: Date.now(), tag: 'app', text: t };
                  })
                : [];
            return { ok: true, lines: lines, total: lines.length };
        }
        if (/\/api\/(hello|probe|dav)/.test(url)) return { ok: false, error: 'no transcode server' };
        return { ok: true };
    }

    var castInbox = '';
    var castOn = true;

    /* The phone side of casting, simulated: the demo's Cast page posts here. */
    function castSend(url) {
        if (!url || !castOn) return false;
        castInbox = url;
        return true;
    }

    /* ── install: called before the app's own scripts run ─────────────── */
    function install() {
        window.tizen = tizenShim;
        window.webapis = { productinfo: {
            getRealModel: function () { return 'Simulated TV'; },
            getFirmware: function () { return 'demo'; },
            getName: function () { return 'Tessel Simulator'; },
            getModel: function () { return 'sim'; },
            getSmartTVServerVersion: function () { return 'demo'; }
        } };

        /* Every request the app makes to its own service is answered here;
         * anything else (a pasted stream URL, say) goes to the browser.  The
         * wrapper is needed because a real XHR's status/responseText are
         * read-only getters — a simulated reply needs its own object. */
        var RealXHR = window.XMLHttpRequest;

        function FakeXHR() {
            this.readyState = 0;
            this.status = 0;
            this.responseText = '';
            this.response = '';
            this.responseType = '';
            this.timeout = 0;
            this.__headers = {};
            this.onload = null;
            this.onerror = null;
            this.ontimeout = null;
            this.onreadystatechange = null;
        }
        FakeXHR.prototype.open = function (method, url) {
            this.__serviceUrl = /^http:\/\/127\.0\.0\.1:812[7-9]\//.test(String(url)) ? String(url) : null;
            this.__method = method;
            if (!this.__serviceUrl && this.__real === undefined) {
                this.__real = new RealXHR();
                var real = this.__real, self = this;
                real.onload = function () { self.__mirror(); if (self.onload) self.onload(); };
                real.onerror = function () { if (self.onerror) self.onerror(); };
                real.ontimeout = function () { if (self.ontimeout) self.ontimeout(); };
                real.onreadystatechange = function () {
                    self.__mirror();
                    if (self.onreadystatechange) self.onreadystatechange();
                };
            }
            if (this.__real) this.__real.open.apply(this.__real, arguments);
        };
        FakeXHR.prototype.__mirror = function () {
            if (!this.__real) return;
            this.readyState = this.__real.readyState;
            this.status = this.__real.status;
            this.responseText = this.__real.responseText;
            this.response = this.__real.response;
        };
        FakeXHR.prototype.setRequestHeader = function (k, v) {
            this.__headers[k] = v;
            if (this.__real) this.__real.setRequestHeader(k, v);
        };
        FakeXHR.prototype.getResponseHeader = function (k) {
            return this.__real ? this.__real.getResponseHeader(k) : (this.__headers[k] || null);
        };
        FakeXHR.prototype.send = function (body) {
            if (!this.__serviceUrl) { if (this.__real) this.__real.send(body); return; }
            var xhr = this;
            var reply = serviceReply(this.__serviceUrl, this.__method, body);
            setTimeout(function () {
                if (reply && reply.__text !== undefined) {
                    xhr.status = 200;
                    xhr.responseText = reply.__text;
                    xhr.response = reply.__text;
                } else {
                    xhr.status = 200;
                    xhr.responseText = JSON.stringify(reply || { ok: true });
                    xhr.response = xhr.responseText;
                }
                xhr.readyState = 4;
                if (xhr.onreadystatechange) xhr.onreadystatechange();
                if (xhr.onload) xhr.onload();
            }, 40);
        };
        FakeXHR.prototype.abort = function () { if (this.__real) this.__real.abort(); };
        FakeXHR.prototype.addEventListener = function (name, fn) {
            if (name === 'load') this.onload = fn;
            else if (name === 'error') this.onerror = fn;
            else if (name === 'timeout') this.ontimeout = fn;
        };
        FakeXHR.prototype.removeEventListener = function () {};
        window.XMLHttpRequest = FakeXHR;

        /* Fetch is used for a few ranged reads; serve the same replies. */
        if (typeof window.fetch === 'function') {
            var realFetch = window.fetch;
            window.fetch = function (input, init) {
                var url = String(input && input.url ? input.url : input);
                if (/^http:\/\/127\.0\.0\.1:812[7-9]\//.test(url)) {
                    var reply = serviceReply(url, (init && init.method) || 'GET', init && init.body);
                    var text = (reply && reply.__text !== undefined) ? reply.__text : JSON.stringify(reply || {});
                    return Promise.resolve(new Response(text, { status: 200,
                        headers: { 'Content-Type': 'application/json' } }));
                }
                return realFetch.apply(window, arguments);
            };
        }
    }

    /* Install immediately: the app reads `tizen` while its own scripts run. */
    install();

    return { install: install, castSend: castSend, DURATIONS: DURATIONS, DRIVE: DRIVE,
        setUsbMounted: function (on) { usbMounted = on; } };
})();
