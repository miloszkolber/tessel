/* Recursive music playback, adapted from upstream b292b5f4923b.
 * The local UI uses the shared folder context menu and cancellable dialog,
 * not synthetic action rows in the card grid. Lists remain source-owned. */
var FolderPlay = (function () {
    'use strict';

    function walk(root, list, progress, done, limits) {
        limits = limits || {};
        var maxTracks = limits.maxTracks || 5000, maxFolders = limits.maxFolders || 2000;
        var maxDepth = limits.maxDepth || 16, parallel = limits.parallel || 3;
        var records = [], pending = [{ node: root, depth: 0, order: [] }];
        var running = 0, found = 0, visited = 0, failed = 0, stopped = false, pumping = false;
        var seen = {}, timers = [], truncated = false, capped = false, rootError = null;
        function key(node) { return node.kind + ':' + (node.srv || node.root || '') + ':' + node.path; }
        function pump() {
            if (stopped || pumping) return;
            pumping = true;
            while (!stopped && running < parallel && pending.length && !capped) fetch(pending.shift());
            pumping = false;
            if (stopped || running) return;
            stopped = true;
            records.sort(function (a, b) {
                for (var i = 0; i < Math.min(a.order.length, b.order.length); i++) {
                    if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
                }
                return a.order.length - b.order.length;
            });
            var tracks = [];
            records.forEach(function (r) { tracks = tracks.concat(r.tracks); });
            if (tracks.length > maxTracks) tracks.length = maxTracks;
            done(rootError, tracks, { failed: failed, truncated: truncated, folders: visited });
        }
        function fetch(record) {
            if (seen[key(record.node)]) return;
            seen[key(record.node)] = true;
            running++; visited++;
            var complete = false;
            var timer = setTimeout(function () { reply(new Error('folder listing timed out')); }, 30000);
            timers.push(timer);
            function reply(err, entries) {
                if (complete) return;
                complete = true; clearTimeout(timer); running--;
                if (stopped) return;
                if (err) {
                    failed++;
                    if (!record.depth) rootError = err;
                } else {
                    entries = (entries || []).slice().sort(function (a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
                    var dirs = [], tracks = [];
                    entries.forEach(function (entry) {
                        if (!entry.name || /^\./.test(entry.name)) return;
                        if (entry.isDir) dirs.push(entry.node);
                        else if (FileTypes.kind(entry.name) === 'audio' && entry.track) tracks.push(entry.track);
                    });
                    if (tracks.length > maxTracks - found) { tracks.length = maxTracks - found; truncated = true; capped = true; }
                    records.push({ order: record.order, tracks: tracks });
                    found += tracks.length;
                    if (found >= maxTracks) { truncated = true; capped = true; }
                    if (record.depth >= maxDepth) { if (dirs.length) truncated = true; }
                    else dirs.forEach(function (node, i) {
                        if (visited + pending.length >= maxFolders) { truncated = true; return; }
                        pending.push({ node: node, depth: record.depth + 1, order: record.order.concat([i]) });
                    });
                }
                if (progress) progress(found);
                pump();
            }
            try { list(record.node, reply); } catch (err) { reply(err); }
        }
        pump();
        return function () { stopped = true; timers.forEach(clearTimeout); pending = []; };
    }

    function list(source, cb) {
        if (source.kind === 'smb') return SMB.listMusic(source, cb);
        if (source.kind === 'webdav') return WebDAV.listMusic(source, cb);
        function read(dir) {
            Browser.listDir(dir, function (err, entries) {
                if (err) return cb(err);
                var artName = FileTypes.folderArt(entries.map(function (e) { return e.isDir ? '' : e.name; })), art = null;
                entries.forEach(function (e) { if (e.name === artName) art = e.uri; });
                cb(null, entries.map(function (e) {
                    return { name: e.name, isDir: e.isDir,
                        node: { kind: 'usb', root: source.root, rootPath: source.rootPath, path: e.fullPath, file: e.file, name: e.name },
                        track: { uri: e.uri, title: e.name, file: e.file, subtitles: e.subtitles || [], art: art,
                            source: { kind: 'usb', root: source.root, rootPath: source.rootPath, path: source.path } } };
                }));
            });
        }
        if (source.file) return read(source.file);
        try { tizen.filesystem.resolve(source.path, read, cb, 'r'); } catch (err) { cb(err); }
    }

    function start(source, shuffle, returnTo) {
        var alive = true, cancel, revision = UI.viewRevision;
        var dialog = Dialog.open(I18n.t(shuffle ? 'folderPlay.shuffleAll' : 'folderPlay.playAll'), {
            returnTo: returnTo,
            dispose: function () { alive = false; if (cancel) cancel(); }
        });
        var status = document.createElement('p'); status.className = 'muted status-line'; status.setAttribute('role', 'status');
        status.textContent = I18n.t('folderPlay.scanning', 0); dialog.body.appendChild(status);
        var stop = document.createElement('button'); stop.className = 'btn ghost'; stop.textContent = I18n.t('common.cancel');
        stop.addEventListener('click', function () { Dialog.close(); }); dialog.footer.appendChild(stop); dialog.focus();
        cancel = walk(source, list, function (count) { if (alive) status.textContent = I18n.t('folderPlay.scanning', count); }, function (err, tracks, info) {
            if (!alive || revision !== UI.viewRevision) return;
            Dialog.close(false);
            if (err || !tracks.length) { UI.restoreFocus(returnTo); UI.toast(err ? err.message : I18n.t('folderPlay.noMusic')); return; }
            if (shuffle) {
                tracks = tracks.slice();
                for (var i = tracks.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1)), swap = tracks[i]; tracks[i] = tracks[j]; tracks[j] = swap;
                }
            }
            if (info.truncated || info.failed) UI.toast(I18n.t('folderPlay.partial', tracks.length, info.failed));
            function back() {
                if (source.kind === 'usb') VlcApp.openUsbFolder(source);
                else { VlcApp.prepareSourceBrowse(); (source.kind === 'smb' ? SMB : WebDAV).openFolder(source.srv, source.path); }
            }
            VlcApp.play('browse', tracks, 0, null, back);
        });
    }
    return { walk: walk, start: start, list: list };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FolderPlay;
