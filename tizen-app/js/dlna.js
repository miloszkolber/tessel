/* ============================================================================
 * DLNA media servers (issue #131), web side.
 * ----------------------------------------------------------------------------
 * The background service finds the servers (SSDP needs UDP, which the page
 * can't send) and reads their folders; see the DLNA block in service.js.
 * Nothing is configured: the home tile searches the LAN, a single server
 * opens straight away, and more are offered as a list.
 *
 * What a server lists plays from the http URL it gives, straight into
 * AVPlay — so a file opened here flows through the app's normal play path
 * and gets next/prev, auto-play, recents and resume like any other.
 * A DLNA title often has no extension, so an entry's kind comes from the
 * server's own class for it (video / audio / image), not from its name.
 * ==========================================================================*/

var DLNA = (function () {

    var BASE = 'http://127.0.0.1:8127';

    function dbg(msg) { if (typeof Debug !== 'undefined' && Debug.send) Debug.send('DLNA', msg); }

    function request(method, url, body, timeout, cb) {
        var x = new XMLHttpRequest();
        x.open(method, url, true);
        if (body) x.setRequestHeader('Content-Type', 'application/json');
        x.timeout = timeout;
        x.onload = function () {
            try { cb(null, JSON.parse(x.responseText)); }
            catch (e) { cb(new Error('bad response')); }
        };
        x.onerror = function () { cb(new Error('service unreachable')); };
        x.ontimeout = function () { cb(new Error('timeout')); };
        x.send(body ? JSON.stringify(body) : null);
    }

    /* An entry's kind: the server's class, else the URL's extension. */
    function kindOf(e) {
        if (e.isDir) return 'dir';
        if (e.kind && e.kind !== 'other') return e.kind;
        return FileTypes.kind(String(e.url || '').split('?')[0].split('#')[0]);
    }
    function isPlayable(k) { return k === 'video' || k === 'audio'; }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function humanSize(n) {
        if (!n) return '';
        var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (i ? n.toFixed(1) : n) + ' ' + u[i];
    }
    function clock(sec) {
        sec = Math.round(sec);
        var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
        return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* The folders' entries as the app's lists want them: the playlist for
     * the player. Server-advertised captions
     * (miniDLNA text/srt <res>, Samsung sec:CaptionInfoEx) ride on the
     * playlist item as external subtitles, like folder sidecars elsewhere. */
    function playlistOf(entries) {
        return entries.filter(function (e) { return isPlayable(kindOf(e)); }).map(function (e) {
            var audio = kindOf(e) === 'audio';
            // Channel logos, music art and server video thumbnails
            // (upnp:albumArtURI) all ride into the queue, where the Up Next
            // carousel shows them; anything unusable falls back to the file
            // icon there.
            return { uri: e.url, title: e.title, art: e.art || null, tagSrc: audio ? e.url : null,
                     subtitles: (e.captions || []).map(function (c) {
                         return { name: e.title + ' (' + String(c.ext || '').toUpperCase() + ')',
                                  lang: '', ext: c.ext, uri: c.url };
                     }) };
        });
    }

    /* ── state ─────────────────────────────────────────────────────────── */
    var found = [];          // the servers the last search found
    var searchedAt = 0;      // when that sweep ran, for the page and for launch
    var server = null;       // the one being browsed
    var stack = [];          // folders above this one: [{ id, title }]
    var folder = null;       // this folder: { id, title }
    var backHandler = null;
    /* How long a sweep stays usable.  Long enough that opening the page right
     * after launch does not search twice, short enough that a server that
     * just appeared is still found by pressing Search again. */
    var SEARCH_TTL_MS = 90000;
    var discoveryWaiters = null;
    var browseSequence = 0;
    var SAVED_KEY = 'tessel_dlna_v1';
    function servers() {
        var list;
        try { list = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null'); } catch (e) {}
        if (!Array.isArray(list)) {
            var old = pinnedId();
            list = old ? [{ id: old, name: I18n.t('home.dlna') }] : [];
            saveServers(list);
        }
        return list.filter(function (s) { return s && s.id; });
    }
    function saveServers(list) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) {} }
    function saveServer(s) {
        var list = servers(), old = list.filter(function (x) { return x.id === s.id; })[0];
        if (!old) list.push({ id: s.id, name: s.name, control: s.control });
        else { old.control = s.control; if (!old.renamed) old.name = s.name; }
        saveServers(list);
    }
    function removeServer(id) { saveServers(servers().filter(function (s) { return s.id !== id; })); }
    function renameServer(id, name) { var list = servers(); list.forEach(function (s) { if (s.id === id) { s.name = name; s.renamed = true; } }); saveServers(list); }

    function list() { return document.getElementById('browse-list'); }
    function head(title, path) {
        UI.showView('view-browse');
        if (window.VlcApp && window.VlcApp.setBrowsePage) window.VlcApp.setBrowsePage('network');
        if (window.VlcApp && window.VlcApp.setBrowseGrid) window.VlcApp.setBrowseGrid(true);
        document.getElementById('browse-title').textContent = title;
        document.getElementById('browse-path').textContent = path;
    }
    function row(icon, name, meta) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="icon">' + icon + '</span><span class="name">' + esc(name) + '</span>' +
                       (meta ? '<span class="meta">' + esc(meta) + '</span>' : '');
        return li;
    }
    function message(icon, text) {
        list().innerHTML = '';
        list().appendChild(row(icon, text));
        UI.refreshFocusables();
        UI.focusOn(list().firstElementChild);
    }

    /* ── searching ─────────────────────────────────────────────────────── */
    function openBrowser(id) {
        setupBack();
        var saved = servers();
        if (id || saved.length) { openFolder(id || saved[0].id, '0'); return; }
        search();
    }
    function search() {
        server = null; folder = null; stack = [];
        head(I18n.t('dlna.title'), I18n.t('dlna.searching'));
        message('<img class="remix-icon" src="assets/remix/loader-4-line.svg" alt="">', I18n.t('dlna.searching'));
        // A sweep from launch (or one made moments ago) is used as it is, so
        // opening the page with a pinned server goes straight to its files.
        if (found.length && Date.now() - searchedAt < SEARCH_TTL_MS) { afterSearch(); return; }
        discover(function (why) {
            if (why) { showServers(why); return; }
            afterSearch();
        });
    }

    /* Ask the service for the servers on the LAN; found/searchedAt are the
     * cache the page and the launch-time preparation share. */
    function discover(cb) {
        if (discoveryWaiters) { discoveryWaiters.push(cb); return; }
        discoveryWaiters = [cb];
        function finish(err) {
            var waiting = discoveryWaiters; discoveryWaiters = null;
            waiting.forEach(function (done) { done(err, found.slice()); });
        }
        SMB.ensureService(function (err) {
            if (err) { dbg('service did not start: ' + err.message); finish(err.message); return; }
            request('GET', BASE + '/dlna/discover', null, 20000, function (err2, res) {
                if (err2 || !res || !res.ok) {
                    var why = err2 ? err2.message : (res && res.error) || 'search failed';
                    dbg('search failed: ' + why);
                    if (SMB.dumpServiceLogs) SMB.dumpServiceLogs('dlna search');
                    found = [];
                    finish(why);
                    return;
                }
                found = res.servers || [];
                searchedAt = Date.now();
                dbg('found ' + found.length + ' server(s): ' + found.map(function (s) { return s.name; }).join(', '));
                /* Pull the service's DLNA_ lines here too, not only on failure.
                 * A search that "succeeds" with the wrong servers is exactly the
                 * case where those lines are needed, and they are otherwise
                 * unreachable from off the TV. */
                if (SMB.dumpServiceLogs) SMB.dumpServiceLogs('dlna search');
                var configured = servers();
                configured.forEach(function (s) {
                    var live = choice(found, s.id);
                    if (live) { s.control = live.control; if (!s.renamed) s.name = live.name; }
                });
                saveServers(configured);
                finish(null);
            });
        });
    }

    /* What the user gets after a search: the pinned server straight away,
     * the only server found, or the list.  A pinned server that isn't on the
     * LAN any more falls back to the list rather than sticking. */
    function choice(list, want) {
        want = want || '';
        if (want) {
            for (var i = 0; i < list.length; i++) if (list[i].id === want) return list[i];
            return null;
        }
        return list.length === 1 ? list[0] : null;
    }
    function afterSearch() {
        var pick = choice(found, pinnedId());
        if (pick) { rememberServer(pick); openServer(pick); return; }
        showServers();
    }

    /* The pinned server, looked for as soon as the app starts with DLNA in
     * use, so the page is ready when it is opened. */
    function prepare(cb) {
        cb = cb || function () {};
        if (found.length && Date.now() - searchedAt < SEARCH_TTL_MS) { cb(null, found.slice()); return; }
        discover(function (why) { cb(why ? new Error(why) : null, found.slice()); });
    }

    /* One media server at a time: whichever the user picks is remembered and
     * used from then on. */
    function rememberServer(s) {
        if (s && s.id) saveServer(s);
    }
    function pinnedId() {
        try { return Settings.get('dlnaServer') || ''; } catch (e) { return ''; }
    }

    /* The servers found, or why there are none, with a way to look again. */
    function showServers(error) {
        server = null; folder = null; stack = [];
        head(I18n.t('dlna.title'), I18n.t('dlna.pickServer'));
        var ul = list();
        ul.innerHTML = '';
        var focus = null;
        found.forEach(function (s) {
            var li = row(FileTypes.icon('dir'), s.name);
            li.dataset.dir = '1';
            li.addEventListener('click', function () { rememberServer(s); openServer(s); });
            ul.appendChild(li);
        });
        if (!found.length) {
            var none = row('<img class="remix-icon" src="assets/remix/information-fill.svg" alt="">', error ? I18n.t('dlna.searchFailed', error) : I18n.t('dlna.none'));
            ul.appendChild(none);
        }
        var again = row('<img class="remix-icon" src="assets/remix/refresh-line.svg" alt="">', I18n.t('dlna.searchAgain'));
        again.addEventListener('click', search);
        ul.appendChild(again);
        if (!found.length) focus = again;
        UI.refreshFocusables();
        UI.focusOn(focus || ul.firstElementChild);
    }

    /* ── browsing ──────────────────────────────────────────────────────── */
    function openServer(s) {
        server = s;
        stack = [];
        render({ id: '0', title: s.name });
    }
    function openFolder(id, path, title) {
        setupBack();
        var seq = ++browseSequence;
        head(title || I18n.t('dlna.title'), I18n.t('common.connecting'));
        message(FileTypes.icon('dir'), I18n.t('common.connecting'));
        prepare(function (err, live) {
            if (seq !== browseSequence) return;
            var selected = choice(live || [], id);
            if (err || !selected) { message(FileTypes.icon('other'), I18n.t('source.unavailable')); return; }
            server = selected; stack = [];
            render({ id: path || '0', title: title || selected.name });
        });
        return true;
    }
    function pathText() {
        return [server.name].concat(stack.slice(1).map(function (f) { return f.title; }),
                                    folder.id === '0' ? [] : [folder.title]).join(' / ');
    }

    function render(f, focusTitle) {
        var seq = ++browseSequence;
        folder = f;
        head(f.title, pathText());
        message('<img class="remix-icon" src="assets/remix/loader-4-line.svg" alt="">', I18n.t('common.loading'));
        var srv = server, here = f, above = stack.slice();
        request('POST', BASE + '/dlna/browse', { control: srv.control, id: f.id }, 30000, function (err, res) {
            if (server !== srv || folder !== here || seq !== browseSequence) return;
            if (err || !res || !res.ok) {
                var why = err ? err.message : (res && res.error) || 'browse failed';
                dbg('browse ' + JSON.stringify(here.id) + ' on ' + srv.name + ' failed: ' + why);
                if (SMB.dumpServiceLogs) SMB.dumpServiceLogs('dlna browse');
                message('<img class="remix-icon" src="assets/remix/error-warning-line.svg" alt="">', why);
                return;
            }
            var entries = (res.entries || []).filter(function (e) { return e.isDir || isPlayable(kindOf(e)); });
            dbg('browse ' + JSON.stringify(here.id) + ': ' + entries.length + ' shown of ' + (res.entries || []).length);
            draw(entries, focusTitle, function backHere(title) {
                return function (last) {
                    server = srv; stack = above.slice();
                    setupBack();
                    render(here, (last && last.title) || title);
                };
            });
        });
    }

    function draw(entries, focusTitle, backHere) {
        var ul = list();
        ul.innerHTML = '';
        var playlist = playlistOf(entries), focus = null;
        playlist.forEach(function (p) { p.source = { kind: 'dlna', srv: server.id, path: folder.id, name: folder.title }; });

        if (stack.length) {
            var up = row('<img class="remix-icon" src="assets/remix/corner-up-left-line.svg" alt="">', '..');
            up.dataset.dir = '1';
            up.addEventListener('click', goUp);
            ul.appendChild(up);
        }
        entries.forEach(function (e) {
            var k = kindOf(e);
            var meta = e.isDir ? '' : e.duration ? clock(e.duration) : humanSize(e.size);
            var li = row(FileTypes.icon(k), e.title, meta);
            li.dataset.dir = e.isDir ? '1' : '0';
            if (e.isDir && window.LibraryUI) LibraryUI.bindFolder(li, { kind: 'dlna', srv: server.id, path: e.id, name: e.title });
            if (k === 'other') li.classList.add('unopenable');
            if (isPlayable(k)) li.dataset.uri = e.url;
            if (focusTitle && e.title === focusTitle) focus = li;
            li.addEventListener('click', function () {
                if (e.isDir) { stack.push(folder); render({ id: e.id, title: e.title }); return; }
                if (!isPlayable(k)) { UI.toast(I18n.t('browse.cantOpen')); return; }
                var idx = 0;
                for (var i = 0; i < playlist.length; i++) if (playlist[i].uri === e.url) { idx = i; break; }
                teardownBack();
                if (window.VlcApp && window.VlcApp.play) window.VlcApp.play('dlna', playlist, idx, null, backHere(e.title));
            });
            ul.appendChild(li);
        });
        if (!entries.length) ul.appendChild(row('i', I18n.t('browse.empty')));

        UI.refreshFocusables();
        UI.focusOn(focus || ul.firstElementChild);
    }

    function goUp() {
        if (!server) { exit(); return; }
        if (stack.length) { var child = folder; render(stack.pop(), child.title); return; }
        exit();
    }
    function exit() {
        teardownBack();
        // Opened from the Network page? Its picker is one step back.
        if (window.VlcApp && window.VlcApp.networkSourceBack && window.VlcApp.networkSourceBack()) return;
        if (window.VlcApp && window.VlcApp.home) window.VlcApp.home();
        else UI.showView('view-home');
    }
    function setupBack() {
        if (backHandler) return;
        backHandler = Remote.push(function (code) {
            if (code === Remote.KEY.BACK) { goUp(); return true; }
            return false;
        });
    }
    function teardownBack() {
        browseSequence++;
        if (backHandler) { Remote.pop(backHandler); backHandler = null; }
    }

    return {
        openBrowser: openBrowser,
        openFolder: openFolder,
        servers: servers,
        addServer: saveServer,
        removeServer: removeServer,
        renameServer: renameServer,
        discover: discover,
        prepare:     prepare,       // launch-time sweep for the pinned server
        pinnedId:    pinnedId,      // exposed for the Node tests
        choice:      choice,        // \" — which server a sweep should open
        detach:      teardownBack,
        kindOf:      kindOf,        // exposed for the Node tests
        playlistOf:  playlistOf     // exposed for the Node tests
    };
})();

// Ignored by the Tizen/browser build; lets Node tests drive the module.
if (typeof module !== 'undefined' && module.exports) module.exports = DLNA;
