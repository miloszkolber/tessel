/* Library screens share cards, context menus and source availability. The
 * production app remains the owner of playback and file-browser navigation. */
var LibraryUI = (function () {
    'use strict';
    var roots = [], rootsKnown = false, status = {}, refreshSequence = 0;
    var castTimer = null, castSequence = 0;
    function t() { return I18n.t.apply(I18n, arguments); }
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
    function icon(name) { var img = el('img', 'remix-icon'); img.src = 'assets/remix/' + name + '.svg'; img.alt = ''; return img; }
    function streamInfo(url) {
        var clean = String(url || '').split(/[?#]/)[0], kind = FileTypes.kind(clean);
        var host = /^[a-z][\w+.-]*:\/\/([^/]+)/i.exec(clean);
        return { icon: kind === 'audio' ? 'file-music-fill' : kind === 'playlist' ? 'play-list-fill' : 'file-video-fill',
            subtitle: host ? host[1].replace(/^.*@/, '') : clean.split(':')[0].toUpperCase() };
    }
    function sourceKey(s) { return s.kind + ':' + String(s.srv !== undefined ? s.srv : s.id || ''); }
    function sources() {
        return SMB.servers().map(function (s) { return { kind: 'smb', srv: s.id, path: '/', name: s.name || SMB.serverLabel(s) }; })
            .concat(WebDAV.servers().map(function (s) { return { kind: 'webdav', srv: s.id, path: '/', name: WebDAV.serverLabel(s) }; }))
            .concat(DLNA.servers().map(function (s) { return { kind: 'dlna', srv: s.id, path: '0', name: s.name }; }));
    }
    function descriptor(uri, source) {
        if (source) return source;
        var m, path = String(uri || '');
        if (/^file:/i.test(path)) return { kind: 'usb', path: path.replace(/^file:\/\//i, '') };
        if (SMB.isStreamUrl(path) || WebDAV.isStreamUrl(path)) {
            m = /[?&]srv=([^&]*)/.exec(path);
            return { kind: SMB.isStreamUrl(path) ? 'smb' : 'webdav', srv: m ? decodeURIComponent(m[1]) : '', path: '/' };
        }
        return { kind: 'url', path: path };
    }
    function usbPath(s, path) {
        var root = s.root && s.rootPath ? { name: s.root, fullPath: s.rootPath } : roots.filter(function (r) {
            return path === r.fullPath || path.indexOf(r.fullPath.replace(/\/$/, '') + '/') === 0;
        })[0];
        return root ? root.name + path.slice(root.fullPath.length) : path;
    }
    function offline(s) {
        if (!s) return false;
        if (s.kind === 'usb') {
            if (!rootsKnown) return false;
            var path = String(s.path || '').replace(/^file:\/\//i, '');
            try { path = decodeURIComponent(path); } catch (e) {}
            return !roots.some(function (r) { return path === r.fullPath || path.indexOf(r.fullPath.replace(/\/$/, '') + '/') === 0; });
        }
        if (s.kind === 'url') return false;
        if (!sources().some(function (known) { return sourceKey(known) === sourceKey(s); })) return true;
        return status[sourceKey(s)] === 'offline';
    }
    function decorateAvailability(card, s) {
        card.__source = s;
        var missing = offline(s);
        card.classList.toggle('unavailable', missing);
        var warning = card.querySelector('.missing-source');
        if (warning) warning.classList.toggle('hidden', !missing);
        card.setAttribute('aria-description', missing ? t('source.unavailable') : '');
    }
    function refreshBadges() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-context]'), function (card) {
            if (card.__source) decorateAvailability(card, card.__source);
        });
    }
    function refreshConnections() {
        var seq = ++refreshSequence;
        Browser.listRoots(function (err, list) {
            if (seq !== refreshSequence) return;
            roots = err ? [] : list; rootsKnown = true; refreshBadges();
        });
        var pending = sources().filter(function (s) { return s.kind !== 'dlna'; }), running = 0;
        function connectNext() {
            if (seq !== refreshSequence || running >= 2 || !pending.length) return;
            var s = pending.shift(); running++;
            status[sourceKey(s)] = 'connecting';
            var mod = s.kind === 'smb' ? SMB : WebDAV;
            mod.ensureConnected(s.srv, function (err) {
                running--; if (seq !== refreshSequence) return;
                status[sourceKey(s)] = err ? 'offline' : 'online'; refreshBadges(); connectNext();
            });
            connectNext();
        }
        connectNext();
        if (DLNA.servers().length) DLNA.prepare(function (err, live) {
            if (seq !== refreshSequence) return;
            DLNA.servers().forEach(function (s) { status['dlna:' + s.id] = !err && DLNA.choice(live || [], s.id) ? 'online' : 'offline'; });
            refreshBadges();
        });
    }
    function bind(node, menu) {
        node.setAttribute('data-context', 'true');
        node.__context = function () { menu(node); };
    }
    function card(item, run, context) {
        var b = el('button', 'media-card'); b.type = 'button';
        b.dataset.cardKey = item.key || item.uri || (item.kind === 'url' ? item.path : sourceKey(item) + (item.path && item.path !== '/' && item.path !== '0' ? ':' + item.path : ''));
        var image = el('span', 'card-picture');
        var folder = item.kind === 'usb' && item.rootPath && item.path !== item.rootPath;
        var rootSource = (item.kind === 'smb' && (!item.path || item.path === '/')) || (item.kind === 'dlna' && (!item.path || item.path === '0'));
        image.appendChild(icon(item.icon || (item.kind === 'url' ? streamInfo(item.path).icon : folder ? 'folder-fill' : item.kind === 'usb' ? 'hard-drive-2-fill' : rootSource ? 'server-line' : item.kind === 'dlna' ? 'file-video-fill' : item.kind === 'webdav' ? 'earth-line' : 'folder-fill')));
        if (item.art) {
            var art = el('img', 'card-art'); art.src = item.art; art.alt = ''; art.loading = 'lazy';
            art.onload = function () { b.classList.add('has-art'); };
            art.onerror = function () { b.classList.remove('has-art'); if (art.parentNode) art.parentNode.removeChild(art); };
            image.appendChild(art);
        }
        var warning = el('span', 'missing-source hidden'); warning.appendChild(icon('error-warning-line')); warning.title = t('source.unavailable'); image.appendChild(warning);
        if (item.dur && item.pos) { var bar = el('span', 'card-progress'), fill = el('span'); fill.style.width = Math.min(100, item.pos / item.dur * 100) + '%'; bar.appendChild(fill); image.appendChild(bar); }
        b.appendChild(image);
        b.appendChild(el('span', 'card-title', item.title || item.name));
        b.appendChild(el('span', 'card-description', item.subtitle || ''));
        b.title = item.title || item.name;
        b.setAttribute('aria-label', (item.title || item.name) + (item.subtitle ? ' — ' + item.subtitle : ''));
        b.addEventListener('click', run);
        if (context) bind(b, context);
        if (item.source || item.kind) decorateAvailability(b, item.source || item);
        return b;
    }
    /* A section keeps its place whether or not it has items: the row stays
     * on the page and says so, so the rows below never jump up and down as
     * the library changes. */
    function row(host, title, items, render, emptyText, modName) {
        var section = el('section', modName ? 'library-row ' + modName : 'library-row'); section.appendChild(el('h2', '', title));
        var list = el('div', 'card-row');
        if (!items.length) { list.classList.add('empty'); list.dataset.empty = emptyText || ''; }
        else items.forEach(function (item) { list.appendChild(render(item)); });
        section.appendChild(list); host.appendChild(section);
    }
    function pinAction(s, after) {
        var old = Favorites.find(s);
        return { name: t(old ? 'pin.unpin' : 'pin.pin'), run: function () { if (old) Favorites.remove(old.id); else Favorites.add(s); if (after) after(); } };
    }
    function bindFolder(node, s) {
        bind(node, function () { Dialog.menu(s.name, [pinAction(s, function () { node.classList.toggle('is-fav', !!Favorites.find(s)); UI.refreshFocusables(); UI.focusOn(node); })], node); });
    }
    function restore(key, fallback) {
        UI.refreshFocusables();
        var candidates = document.querySelectorAll('[data-card-key]'), found = null;
        for (var i = 0; i < candidates.length; i++) if (candidates[i].dataset.cardKey === key && !candidates[i].closest('.hidden')) found = candidates[i];
        UI.focusOn(found || fallback || (UI.currentView && UI.currentView.querySelector('button,input')));
    }
    function home(resume, watched) {
        var host = document.getElementById('home-library');
        if (!host) return;
        var focus = document.activeElement && document.activeElement.dataset.cardKey;
        host.innerHTML = '';
        row(host, t('strip.continue'), Library.recommendations(resume || {}, watched || {}), function (r) {
            var c = card({ key: r.key, title: r.title, subtitle: r.subtitle, art: r.art, pos: r.pos, dur: r.dur, source: descriptor(r.uri, r.source), icon: streamInfo(r.uri || r.title).icon },
                function () { launch(r); }, function (node) {
                    Dialog.menu(r.title, [{ name: t('library.removeContinue'), run: function () { Library.dismiss(r.key, r.uri); home(resume, watched); restore(focus); } }], node);
                });
            c.classList.add('continue-card');
            return c;
        }, t('library.noContinue'));
        row(host, t('library.pinned'), Favorites.list(), function (s) {
            return card(s, function () { openPin(s); }, function (node) {
                Dialog.menu(s.name, [{ name: t('pin.unpin'), run: function () { Favorites.remove(s.id); VlcApp.refreshHome(); restore(focus); } },
                    { name: t('library.rename'), run: function () { Dialog.rename(t('library.rename'), s.name, function (name) { Favorites.rename(s.id, name); VlcApp.refreshHome(); restore(focus); }, node); } }], node);
            });
        }, t('library.noPinned'), 'shortcut-row');
        UI.refreshFocusables();
        if (focus && !Dialog.isOpen()) restore(focus);
        else if (!Dialog.isOpen() && !document.getElementById('view-home').classList.contains('hidden') &&
                 document.activeElement.matches('.tile[data-focus]') && host.querySelector('button')) UI.focusOn(host.querySelector('button'));
    }
    function launch(r) {
        var revision = UI.viewRevision;
        var source = descriptor(r.uri, r.source);
        if (offline(source)) { refreshConnections(); UI.toast(t('source.unavailable')); return; }
        var items = r.items.map(function (p) { return { uri: p.uri, title: p.title, art: p.art, source: p.source, subtitles: p.subtitles || [] }; });
        function play() { if (revision !== UI.viewRevision) return; VlcApp.play('home', items, r.index, null, function () { VlcApp.home(); restore(r.key); }); }
        // Rehydrate the current USB item through the actual browser so tags
        // and sidecars work after a reload as well as the first launch.
        if (source.kind === 'usb') {
            var path = r.uri.replace(/^file:\/\//i, ''), parent = path.slice(0, path.lastIndexOf('/'));
            try { parent = decodeURIComponent(parent); } catch (e) {}
            tizen.filesystem.resolve(usbPath(source, parent), function (dir) {
                Browser.listDir(dir, function (err, entries) {
                    if (revision !== UI.viewRevision) return;
                    if (err) { UI.toast(t('source.unavailable')); return; }
                    items.forEach(function (p) { entries.forEach(function (e) { if (e.uri === p.uri) { p.file = e.file; p.subtitles = e.subtitles; } }); }); play();
                });
            }, function () { UI.toast(t('source.unavailable')); }, 'r');
        } else play();
    }
    function openPin(s) {
        if (s.kind === 'url') { VlcApp.openStream(s.path, s.name, function () { VlcApp.home(); restore(s.path); }); return; }
        if (s.kind === 'usb') {
            VlcApp.openUsbFolder(s); return;
        }
        openSource(s);
    }
    function network(focus) {
        var host = document.getElementById('network-cards'); if (!host) return;
        host.innerHTML = '';
        var list = sources();
        /* The reference names the empty state instead of the section. */
        var heading = document.getElementById('network-heading');
        if (heading) heading.textContent = t(list.length ? 'library.devices' : 'network.noDevices');
        list.forEach(function (s) { host.appendChild(card(s, function () { openSource(s); }, function (node) { sourceMenu(s, node); })); });
        var add = card({ key: 'add-source', title: t('library.add'), icon: 'add-line' }, addSource); add.classList.add('add-card'); host.appendChild(add);
        UI.refreshFocusables();
        if (!document.getElementById('view-network').classList.contains('hidden')) restore(focus, host.querySelector('button') || add);
    }
    function openSource(s) {
        VlcApp.prepareSourceBrowse();
        if (s.kind === 'smb') { if (!SMB.openFolder(s.srv, s.path || '')) UI.toast(t('source.unavailable')); }
        else if (s.kind === 'webdav') { if (!WebDAV.openFolder(s.srv, s.path || '')) UI.toast(t('source.unavailable')); }
        else DLNA.openFolder(s.srv, s.path || '0', s.name);
    }
    function sourceMenu(s, node) {
        var mod = s.kind === 'smb' ? SMB : s.kind === 'webdav' ? WebDAV : DLNA;
        var options = [pinAction(s, function () { network(sourceKey(s)); })];
        if (s.kind === 'dlna') options.push({ name: t('library.rename'), run: function () { Dialog.rename(t('library.rename'), s.name, function (name) { DLNA.renameServer(s.srv, name); network(sourceKey(s)); }, node); } });
        else options.push({ name: t('saved.edit'), run: function () { editSource(s.kind, s.srv); } });
        options.push({ name: t('saved.remove'), run: function () {
            Dialog.menu(t('smb.removeConfirm', s.name), [{ name: t('saved.remove'), run: function () { mod.removeServer(s.srv); network('add-source'); refreshBadges(); } },
                { name: t('common.cancel'), run: function () { network(sourceKey(s)); } }], node);
        } });
        Dialog.menu(s.name, options, node);
    }
    function addSource() {
        Dialog.menu(t('network.add'), [
            { name: 'DLNA', run: addDlna },
            { name: 'WebDAV', run: function () { editSource('webdav', 'new'); } },
            { name: 'SMB', run: function () { editSource('smb', 'new'); } }
        ]);
    }
    function editSource(kind, id) {
        var mod = kind === 'smb' ? SMB : WebDAV;
        mod.editServer(id === undefined ? 'new' : id);
        var group = document.getElementById(kind === 'smb' ? 'grp-smb' : 'grp-dav');
        var parent = group.parentNode, next = group.nextSibling;
        var save = document.getElementById(kind === 'smb' ? 'smb-save' : 'dav-save'), afterSave = save.nextSibling;
        var d = Dialog.open(t(kind === 'smb' ? 'smb.section' : 'dav.section'), { back: addSource, dispose: function () {
            group.insertBefore(save, afterSave); parent.insertBefore(group, next);
        } });
        d.root.classList.add('source-dialog');
        group.classList.remove('hidden'); d.body.appendChild(group); d.footer.appendChild(save); d.focus();
    }
    function addDlna() {
        var seq = 0;
        var d = Dialog.open(t('network.addDlna'), { back: addSource, dispose: function () { seq++; } });
        d.root.classList.add('source-dialog');
        var again = el('button', 'btn ghost', t('dlna.searchAgain')); again.addEventListener('click', refresh); d.footer.appendChild(again);
        function refresh() {
            var request = ++seq; d.body.innerHTML = ''; d.body.appendChild(el('p', 'muted', t('dlna.searching')));
            DLNA.discover(function (err, devices) {
                if (request !== seq || !document.body.contains(d.root)) return;
                d.body.innerHTML = '';
                if (err || !devices.length) d.body.appendChild(el('p', 'muted', t('dlna.none')));
                devices.forEach(function (s) {
                    var b = el('button', 'dialog-option', s.name); b.disabled = DLNA.servers().some(function (old) { return old.id === s.id; });
                    if (b.disabled) b.textContent += ' — ' + t('network.added');
                    b.addEventListener('click', function () { DLNA.addServer(s); Dialog.close(false); sourceSaved('dlna', s.id); });
                    d.body.appendChild(b);
                });
                d.focus();
            });
        }
        refresh();
    }
    function sourceSaved(kind, id) { Dialog.close(false); refreshConnections(); VlcApp.openNetwork(); network(kind + ':' + id); }
    function stream(focusKey) {
        var host = document.getElementById('saved-streams-list'); if (!host) return;
        var focus = focusKey || (document.activeElement && document.activeElement.dataset.cardKey);
        host.innerHTML = '';
        SavedStreams.list().forEach(function (s) {
            var info = streamInfo(s.url);
            host.appendChild(card({ key: 'saved:' + s.id, title: s.name, kind: 'url', path: s.url, icon: info.icon, subtitle: info.subtitle },
                function () { VlcApp.openStream(s.url, s.name); }, function (node) { streamMenu(s, node, false); }));
        });
        /* Both sections keep their place so the page does not jump when the
         * library changes; an empty one says so instead of disappearing. */
        var saved = document.getElementById('saved-streams');
        saved.classList.remove('hidden');
        host.classList.toggle('empty', !host.children.length);
        host.dataset.empty = t('saved.noSaved');
        var recent = document.getElementById('recent-streams-list'); recent.innerHTML = '';
        Library.recents().forEach(function (s) {
            var info = streamInfo(s.url);
            recent.appendChild(card({ key: 'recent:' + s.url, title: s.name, kind: 'url', path: s.url, icon: info.icon, subtitle: info.subtitle }, function () { VlcApp.openStream(s.url, s.name); }, function (node) { streamMenu(s, node, true); }));
        });
        document.getElementById('recent-streams').classList.remove('hidden');
        recent.classList.toggle('empty', !recent.children.length);
        recent.dataset.empty = t('stream.noRecent');
        UI.refreshFocusables(); if (focus) restore(focus);
    }
    function streamMenu(s, node, recent) {
        var pin = { kind: 'url', path: s.url, name: s.name };
        var options = [pinAction(pin, function () { stream(); restore(node.dataset.cardKey); })];
        if (recent) options.push({ name: t('saved.save'), run: function () { SavedStreams.add(s.name, s.url); stream(); restore('saved:' + SavedStreams.findByUrl(s.url).id); } });
        else options.push({ name: t('library.rename'), run: function () { Dialog.rename(t('library.rename'), s.name, function (name) { SavedStreams.update(s.id, name, s.url); stream(); restore('saved:' + s.id); }, node); } });
        options.push({ name: t('saved.remove'), run: function () { if (recent) Library.removeRecent(s.url); else SavedStreams.remove(s.id); stream(); restore(null, document.getElementById('url-input')); } });
        Dialog.menu(s.name, options, node);
    }
    function receive() {
        if (Settings.get('castEnabled') === false) { UI.toast(t('cast.disabled')); return; }
        var seq = ++castSequence;
        var d = Dialog.open(t('cast.headline'), { dispose: function () { castSequence++; clearTimeout(castTimer); } });
        d.body.classList.add('receive-body');
        d.body.parentNode.classList.add('receive-card');
        var qr = el('div', 'receive-qr'), address = el('p', 'receive-address', t('common.loading'));
        var stateLine = el('div', 'receive-state'), ring = el('span', 'spinner-ring'), state = el('span', 'muted', t('cast.waiting'));
        stateLine.appendChild(ring); stateLine.appendChild(state);
        var heading = d.body.parentNode.querySelector('h2');
        d.body.appendChild(qr); d.body.appendChild(heading); d.body.appendChild(el('p', 'muted', t('cast.scan'))); d.body.appendChild(address); d.body.appendChild(stateLine); d.focus();
        SMB.ensureService(function (err) {
            if (seq !== castSequence) return;
            if (err) { state.textContent = t('url.serviceDown'); return; }
            UrlDrop.pageUrl(function (error, url) {
                if (seq !== castSequence) return;
                if (error || !url) { state.textContent = t('cast.unavailable'); return; }
                address.textContent = url;
                var code = qrcode(0, 'M'); code.addData(url); code.make();
                var img = el('img'); img.src = code.createDataURL(6, 8); img.alt = t('cast.qrAlt'); qr.appendChild(img);
                poll();
            });
        });
        function poll() {
            if (seq !== castSequence) return;
            UrlDrop.fetchLatest(function (err, url) {
                if (seq !== castSequence) return;
                if (url && validUrl(url)) { Dialog.close(false); VlcApp.openStream(url); return; }
                state.textContent = t(err ? 'url.serviceDown' : 'cast.waiting');
                castTimer = setTimeout(poll, 1000);
            });
        }
    }
    function validUrl(url) { return /^(https?|rtsp|rtmp|mms|udp|rtp|file):\/\//i.test(String(url || '').trim()); }
    return { init: refreshConnections, home: home, network: network, stream: stream, receive: receive,
        bindFolder: bindFolder, bind: bind, sourceSaved: sourceSaved, editSource: editSource, addSource: addSource, addDlna: addDlna,
        refreshConnections: refreshConnections, descriptor: descriptor, validUrl: validUrl, offline: offline, usbPath: usbPath, streamInfo: streamInfo };
})();
