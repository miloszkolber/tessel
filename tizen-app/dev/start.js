/* Preview harness: the real app UI with a simulated decoder, plus a small row
 * of links — on every page — that switches between that page's states.
 *
 * URL: dev-player.html?page=<page>&state=<state>  (dev-player.html → Home)
 * The older single-scene links (?state=video …) still work. */
document.addEventListener('DOMContentLoaded', function () {
    var qs = new URLSearchParams(location.search);
    var legacy = { video: 'video/queue', audio: 'audio/queue', browse: 'usb/default',
                   playlist: 'playlist/default', loading: 'video/loading',
                   buffering: 'video/buffering' };
    var page, state;
    if (qs.get('page')) {
        page  = qs.get('page');
        state = qs.get('state') || 'default';
    } else {
        var mapped = legacy[qs.get('state') || 'video'] || 'video/queue';
        page  = mapped.split('/')[0];
        state = mapped.split('/')[1];
    }

    document.body.classList.add('preview-mode');
    document.getElementById('player-object').style.display = 'none';
    document.getElementById('html5-video').style.display = 'none';

    var css = document.createElement('style');
    css.textContent =
        '.preview-note{position:fixed;right:24px;top:18px;z-index:1100;color:#bbb;font-size:15px;text-align:right;' +
        'max-width:60vw;background:rgba(10,10,10,.55);padding:8px 10px;border-radius:10px}' +
        '.preview-line{margin-top:8px}' +
        '.preview-line a{color:#bbb;margin-left:14px;text-decoration:none}' +
        '.preview-line a:first-child{margin-left:0}' +
        '.preview-line a[aria-current]{color:#fff;text-decoration:underline}' +
        '.preview-states a{font-size:14px}' +
        'body.preview-mode .browse-path{display:none}';
    document.head.appendChild(css);

    if (page === 'video' || page === 'audio') {
        var plane = document.createElement('div');
        plane.className = 'preview-plane';
        plane.style.cssText = 'position:absolute;inset:0;background-image:url(dev/preview-photo.jpg);' +
                              'background-size:cover;background-position:center';
        document.body.insertBefore(plane, document.body.firstChild);
    }

    activeState = state;
    pageStates[page] = state;
    platformStub();
    buildLinks(page, state);
    runPage(page, state);
    // The rows follow the app: navigating with the remote updates them too.
    watchViewChanges();

    window.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
            ev.preventDefault();
            window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 10009, bubbles: true }));
        }
    });

});

/* ── The link rows: pages, then that page's states ──────────────────────── */
var PREVIEW_PAGES = [
    { id: 'home',     label: 'Home',     states: [['default', 'Default']] },
    { id: 'stream',   label: 'Stream',   states: [['default', 'Default'], ['saved', 'Saved items']] },
    { id: 'video',    label: 'Video',    states: [['default', 'Default'], ['queue', 'Queue'], ['loading', 'Loading'], ['buffering', 'Buffering']] },
    { id: 'audio',    label: 'Audio',    states: [['default', 'Default'], ['queue', 'Queue'], ['loading', 'Loading'], ['buffering', 'Buffering']] },
    { id: 'playlist', label: 'Playlist', states: [['default', 'Default'], ['empty', 'Empty']] },
    { id: 'usb',      label: 'USB',      states: [['default', 'Default'], ['empty', 'Empty'], ['continue', 'Continue']] },
    { id: 'network',  label: 'Network',  states: [['default', 'Default'], ['empty', 'Empty'], ['continue', 'Continue'],
                                                  ['smb-config', 'SMB config'], ['dlna-config', 'Media servers'], ['dav-config', 'WebDAV config']] },
    { id: 'settings', label: 'Settings', states: [['default', 'Default']] }
];

function previewLinks(page, state) {
    var nav = document.createElement('nav');
    nav.className = 'preview-links';
    nav.setAttribute('aria-label', 'Preview pages and states');

    var line = document.createElement('div');
    line.className = 'preview-line';
    PREVIEW_PAGES.forEach(function (p) {
        var a = document.createElement('a');
        a.href = '?page=' + p.id + '&state=default';
        a.textContent = p.label;
        if (p.id === page) a.setAttribute('aria-current', 'page');
        line.appendChild(a);
    });
    nav.appendChild(line);

    var current = PREVIEW_PAGES.filter(function (p) { return p.id === page; })[0];
    if (current && current.states.length > 1) {
        var states = document.createElement('div');
        states.className = 'preview-line preview-states';
        current.states.forEach(function (s) {
            var a = document.createElement('a');
            a.href = '?page=' + current.id + '&state=' + s[0];
            a.textContent = s[1];
            if (s[0] === state) a.setAttribute('aria-current', 'page');
            states.appendChild(a);
        });
        nav.appendChild(states);
    }
    return nav;
}

var VIEW_TO_PAGE = { 'view-home': 'home', 'view-url': 'stream',
                     'view-network': 'network', 'view-settings': 'settings',
                     'view-cast': 'settings' };
var activeState = 'default';
var pageStates = {};      // the state the user last picked for each page

/* Which preview page a visible view belongs to.  The browse view and the
 * player are decided by the app itself (USB / Network / playlist, audio /
 * video), so the links never claim the wrong page. */
function pageForView(id) {
    if (id === 'view-browse' || id === 'view-player') {
        return (window.VlcApp && VlcApp.currentPageName && VlcApp.currentPageName()) || null;
    }
    return VIEW_TO_PAGE[id] || null;
}

function buildLinks(page, state) {
    var host = document.createElement('div');
    host.className = 'preview-note';
    var heading = document.createElement('div');
    heading.textContent = 'Preview · arrows / Enter · Escape = Back';
    host.appendChild(heading);
    host.appendChild(previewLinks(page, state));
    host.dataset.page = page;      // the repaint keeps this page's chosen state
    document.body.appendChild(host);
}

/* Re-render the rows whenever the app switches view, so they always describe
 * where the user actually is — including after remote navigation. */
function watchViewChanges() {
    var note = document.querySelector('.preview-note');
    var views = document.querySelectorAll('.view');
    if (!note || !views.length) return;
    function currentView() {
        for (var i = 0; i < views.length; i++)
            if (!views[i].classList.contains('hidden')) return views[i].id;
        return null;
    }
    function repaint() {
        var id = currentView();
        var page = pageForView(id);
        if (!page) return;
        var existing = note.querySelector('.preview-links');
        if (existing && note.dataset.page === page) return;
        note.dataset.page = page;
        activeState = pageStates[page] || 'default';
        if (existing) note.removeChild(existing);
        note.appendChild(previewLinks(page, activeState));
    }
    repaint();
    if (typeof MutationObserver === 'undefined') return;
    var obs = new MutationObserver(repaint);
    for (var i = 0; i < views.length; i++)
        obs.observe(views[i], { attributes: true, attributeFilter: ['class'] });
}


/* ── Fixtures ───────────────────────────────────────────────────────────── */
var PREVIEW_VIDEOS = [{ uri: 'preview://sample', title: 'BigBuckBunny.mp4' },
                      { uri: 'preview://second', title: 'Second clip.mp4' }];
var PREVIEW_AUDIO  = [{ uri: 'preview://audio.mp3', title: 'Preview track.mp3' }];

function previewSeed(what, page) {
    var now = Date.now();
    localStorage.removeItem('vlctv_resume_v1');
    if (what !== 'continue') return;
    /* Continue playing only shows what the page can actually play: the USB
     * page the files of attached storage, the Network page the sources on the
     * LAN.  The fixtures look like both kinds so each carousel has content. */
    var entries = page === 'network'
        ? { 'http://127.0.0.1:8127/smb/stream?path=%2FMedia%2Fpreview.mkv': { pos: 740000, dur: 2154000, ts: now },
            'http://192.168.0.10:8200/preview.mp4':                      { pos: 60000,  dur: 2154000, ts: now - 60000 } }
        : { 'file:///removable1/Films/preview-sample.mkv': { pos: 740000, dur: 2154000, ts: now },
            'file:///removable1/Music/preview-second.mp3': { pos: 60000,  dur: 2154000, ts: now - 60000 },
            // Effectively finished — must not appear under Continue playing.
            'file:///removable1/Music/preview-done.mp3':   { pos: 238000, dur: 240000,  ts: now - 120000 } };
    localStorage.setItem('vlctv_resume_v1', JSON.stringify(entries));
}

/* The preview runs against fixtures, not a TV, but the app still asks the
 * platform what storage is attached (the Continue playing carousel shows the
 * files of a drive that is mounted right now).  One mounted drive stands in,
 * whose paths the fixtures above use. */
function platformStub() {
    if (typeof tizen !== 'undefined') return;
    window.tizen = {
        filesystem: {
            listStorages: function (ok) { ok([{ label: 'removable1', type: 'EXTERNAL', state: 'MOUNTED' }]); },
            resolve: function (name, ok) {
                setTimeout(function () {
                    ok({ name: name, fullPath: '/removable1', isDirectory: true,
                         listFiles: function (cb) { cb([]); }, toURI: function () { return 'file:///removable1'; } });
                }, 0);
            }
        }
    };
}

/* The preview's own fixtures are USB, Stream and playlist lists.  The demo and
 * a real session on this origin keep their network settings in the same
 * localStorage, and a source left configured would put the Network page
 * somewhere other than the state it names — the preview has no SMB service to
 * browse with.  So its network sources start unset. */
function previewClearNetwork() {
    ['vlctv_smb_v1', 'vlctv_smb_extra_v1', 'vlctv_webdav_v1'].forEach(function (k) { localStorage.removeItem(k); });
    try {
        var s = JSON.parse(localStorage.getItem('vlctv_settings_v1') || '{}');
        delete s.networkMethod;
        delete s.dlnaServer;
        localStorage.setItem('vlctv_settings_v1', JSON.stringify(s));
    } catch (e) {}
}

function previewPlayMedia(list, idx) {
    VlcApp.play('home', list, idx, null);
}

/* USB folder fixture: the real browse grid, driven by the app's own renderer. */
function showUsbFixture(opts) {
    opts = opts || {};
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function row(kind, name, extra, onOpen) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="icon">' + FileTypes.icon(kind) + '</span>' +
                       '<span class="name">' + esc(name) + '</span>' + (extra || '');
        if (onOpen) li.addEventListener('click', onOpen);
        document.getElementById('browse-list').appendChild(li);
        return li;
    }
    VlcApp.setBrowseGrid(true);
    document.getElementById('browse-title').textContent = opts.folder || I18n.t('browse.usbTitle');
    document.getElementById('browse-list').innerHTML = '';
    document.getElementById('playlist-filter-wrap').classList.add('hidden');

    if (opts.folder) {
        // One level down, with the way back up, so the preview can show how
        // nested folders behave.
        var up = row('dir', '..', '', function () { showUsbFixture({}); });
        up.dataset.dir = '1';
        row('video', opts.folder + ' S01E01.mkv', '<span class="meta">1.2 GB</span>', function () { previewPlayMedia(PREVIEW_VIDEOS, 0); });
        row('video', opts.folder + ' S01E02.mkv', '<span class="meta">1.1 GB</span>', function () { previewPlayMedia(PREVIEW_VIDEOS, 1); });
        row('audio', opts.folder + ' theme.mp3', '<span class="meta">8.4 MB</span>', function () { previewPlayMedia(PREVIEW_AUDIO, 0); });
        UI.showView('view-browse');
        VlcApp.renderStrips(document.getElementById('browse-strips'));
        return;
    }

    if (opts.empty) {
        row('dir', 'No drives connected', '<span class="meta">Plug in a USB drive to browse it</span>');
    } else {
        var series = row('dir', 'Series', '<span class="fav-mark"><img class="remix-icon" src="assets/remix/pushpin-2-fill.svg" alt=""></span>',
            function () { showUsbFixture({ folder: 'Series' }); });
        series.classList.add('is-fav');
        series.dataset.fav = JSON.stringify({ kind: 'usb', path: '/media/Series', name: 'Series' });
        row('dir', 'Films', '', function () { showUsbFixture({ folder: 'Films' }); });
        var watched = row('video', 'S01E01.mkv',
            '<span class="watched" title="Watched"><img class="remix-icon" src="assets/remix/check-line.svg" alt=""></span>' +
            '<span class="meta">CC ×2</span><span class="meta">1.4 GB</span>',
            function () { previewPlayMedia(PREVIEW_VIDEOS, 0); });
        watched.classList.add('watched-item');
        row('video', 'S01E02.mkv', '<span class="meta">1.3 GB</span>', function () { previewPlayMedia(PREVIEW_VIDEOS, 1); });
        row('video', 'documentary.mp4', '<span class="meta">780 MB</span>', function () { previewPlayMedia(PREVIEW_VIDEOS, 0); });
        row('audio', 'Theme song.mp3', '<span class="meta">9.1 MB</span>', function () { previewPlayMedia(PREVIEW_AUDIO, 0); });
        row('audio', 'Episode 12.mp3', '<span class="meta">48 MB</span>', function () { previewPlayMedia(PREVIEW_AUDIO, 0); });
        row('playlist', 'channels.m3u', '<span class="meta">12 KB</span>', function () { showPlaylistFixture(showUsbFixture); });
    }
    UI.showView('view-browse');
    VlcApp.renderStrips(document.getElementById('browse-strips'));
}

function showPlaylistFixture(back, empty) {
    var logo = location.protocol + '//' + location.host + '/icon.png';
    var m3u = empty
        ? '#EXTM3U'
        : ['#EXTM3U',
           '#EXTINF:-1 tvg-logo="' + logo + '",Channel with logo',
           'preview://channel1',
           '#EXTINF:-1,Channel without logo',
           'preview://channel2',
           '#EXTINF:-1,Another channel',
           'preview://channel3'].join('\n');
    VlcApp.openPlaylist({
        title: 'channels.m3u',
        read: function (done) { done(null, new TextEncoder().encode(m3u)); },
        resolve: function (ref) { return ref; },
        playAsStream: function () {
            VlcApp.play('home', [{ uri: 'preview://sample', title: 'BigBuckBunny.mp4' }], 0, null);
        },
        back: back || function () { VlcApp.home(); }
    });
}

/* ── Router ─────────────────────────────────────────────────────────────── */
function runPage(page, state) {
    if (page === 'home') {
        return;
    }
    if (page === 'stream') {
        localStorage.removeItem('vlctv_saved_v1');
        if (state === 'saved') {
            localStorage.setItem('vlctv_saved_v1', JSON.stringify([
                { id: 'p1', name: 'Living room NAS', url: 'http://192.168.1.20:8200/play?path=demo.mp4' },
                { id: 'p2', name: 'Radio stream', url: 'https://example.com/live.m3u8' },
                { id: 'p3', name: 'Documentary', url: 'https://example.com/doc.mp4' }
            ]));
            document.getElementById('url-input').value = 'https://example.com/movie.m3u8';
        } else {
            document.getElementById('url-input').value = '';
        }
        VlcApp.openUrlView();
        return;
    }
    if (page === 'video' || page === 'audio') {
        // Default is a lone file; the queue state adds a second one.
        var list = page === 'audio'
            ? (state === 'queue' ? PREVIEW_AUDIO.concat([{ uri: 'preview://audio2.mp3', title: 'Second track.mp3' }]) : PREVIEW_AUDIO)
            : (state === 'queue' ? PREVIEW_VIDEOS : [PREVIEW_VIDEOS[0]]);
        previewPlayMedia(list, 0);
        return;
    }
    if (page === 'playlist') { showPlaylistFixture(null, state === 'empty'); return; }
    if (page === 'usb') {
        previewSeed(state === 'continue' ? 'continue' : 'none', 'usb');
        showUsbFixture({ empty: state === 'empty' });
        return;
    }
    if (page === 'network') {
        previewSeed(state === 'continue' ? 'continue' : 'none', 'network');
        previewClearNetwork();
        // The preview has no SMB service to browse with, so every state here
        // shows the picker: which source is in use, and the configuration
        // modals.  The standalone simulator (demo.html) is where a configured
        // source's files come up.
        VlcApp.showNetworkPicker();
        if (state === 'empty') {
            // Nothing configured yet: no strips, tiles still there to set up.
            document.getElementById('network-strips').innerHTML = '';
            document.getElementById('network-strips').classList.add('hidden');
        }
        if (state === 'smb-config') VlcApp.openNetConfig('smb');
        if (state === 'dav-config') VlcApp.openNetConfig('dav');
        if (state === 'dlna-config' && window.DLNA && DLNA.openBrowser) DLNA.openBrowser();
        return;
    }
    if (page === 'settings') { VlcApp.openSettings(); return; }
}
