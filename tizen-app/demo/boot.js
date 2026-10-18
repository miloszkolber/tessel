/* Tessel simulator — boot.
 *
 * Runs inside the real app's document, after the simulator world is in place.
 * It seeds a first-run TV so the demo has something to show, adds the screen
 * picker, and renders the two pages a real TV serves to a phone (casting and
 * the live log).  Everything else — navigation, browsing, playback, the queue,
 * subtitles, menus, settings — is the product's own code. */
document.addEventListener('DOMContentLoaded', function () {
    seed();
    chrome();
    if (typeof Debug !== 'undefined') Debug.info('simulator ready — no TV or network required');
    pick('home', 'default');
});

/* ── a first-run TV: the SMB source set up, a USB drive attached ────────── */
function seed() {
    var store = window.localStorage;
    // The simulated SMB server, as if it had been set up in the Network card.
    if (!store.getItem('vlctv_smb_v1')) {
        store.setItem('vlctv_smb_v1', JSON.stringify({
            host: 'demo-nas', port: 445, share: 'Media', user: 'guest',
            pass: '', domain: '', anonymous: true
        }));
    }
    // One network method is the one in use, which is what makes the other two
    // read "Set up" and this one browse.  Everything else is the app's own
    // defaults.
    if (typeof Settings !== 'undefined' && !Settings.get('networkMethod') && SMB.servers().length) {
        Settings.set('networkMethod', 'smb');
    }
}

/* ── picker + phone pages ───────────────────────────────────────────────── */
/* Screen → the states worth showing.  Each one drives the real app to that
 * place, so a link is a shortcut through the product, not a mock-up. */
var DEMO_SCREENS = [
    { id: 'home',     label: 'Home',     states: [['default', 'Default']] },
    { id: 'usb',      label: 'USB',      states: [['default', 'Drive'], ['series', 'Series'], ['music', 'Music']] },
    { id: 'network',  label: 'Network',  states: [['smb', 'SMB files'], ['picker', 'Source picker'],
                                                   ['dlna', 'Media servers'], ['webdav', 'WebDAV setup'],
                                                   ['smb-config', 'SMB setup']] },
    { id: 'stream',   label: 'Stream',   states: [['default', 'Paste a link']] },
    { id: 'video',    label: 'Video',    states: [['default', 'Play a film']] },
    { id: 'audio',    label: 'Audio',    states: [['default', 'Play an album']] },
    { id: 'settings', label: 'Settings', states: [['default', 'Default']] },
    { id: 'cast',     label: 'Cast',     states: [['default', 'Phone page']] },
    { id: 'log',      label: 'Log',      states: [['default', 'Live log page']] }
];

function chrome() {
    var css = document.createElement('style');
    css.textContent =
        '.demo-note{position:fixed;right:20px;top:16px;z-index:1200;color:#bbb;' +
        'font:13px/1.45 system-ui,-apple-system,sans-serif;text-align:right;background:rgba(10,10,10,.62);' +
        'padding:8px 10px;border-radius:10px;max-width:56vw}' +
        '.demo-note b{color:#f4f4f4}' +
        '.demo-line{margin-top:6px}.demo-line a{color:#bbb;margin-left:12px;text-decoration:none}' +
        '.demo-line a:first-child{margin-left:0}.demo-line a[aria-current="page"]{color:#fff;text-decoration:underline}' +
        '.demo-badge{position:fixed;left:20px;bottom:16px;z-index:1200;color:#8d8d8d;' +
        'font:12px/1.4 system-ui,sans-serif}' +
        '.phone-page{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,86vw);' +
        'background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:24px;text-align:left}' +
        '.phone-page h2{margin:0 0 6px;font-size:24px}' +
        '.phone-page p{margin:0 0 16px;color:var(--fg-mute);font-size:18px}' +
        '.phone-page input{width:100%;box-sizing:border-box;padding:14px 16px;font-size:18px;' +
        'background:var(--bg-2);color:var(--fg);border:1px solid var(--border);border-radius:10px}' +
        '.phone-page .btn{margin-top:14px}' +
        '.phone-log{margin-top:14px;max-height:46vh;overflow:auto;background:#0a0a0a;border-radius:10px;padding:12px;' +
        'font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#e8e8e8;white-space:pre-wrap}';

    var note = document.createElement('div');
    note.className = 'demo-note';
    note.innerHTML = '<b>Simulated demo</b> — arrows / Enter, Escape = Back';

    var pages = document.createElement('div');
    pages.className = 'demo-line';
    DEMO_SCREENS.forEach(function (s) {
        var a = document.createElement('a');
        a.href = '#';
        a.textContent = s.label;
        a.setAttribute('data-screen', s.id);
        a.addEventListener('click', function (ev) {
            ev.preventDefault();
            pick(s.id, s.states[0][0]);
        });
        pages.appendChild(a);
    });
    note.appendChild(pages);

    var states = document.createElement('div');
    states.className = 'demo-line';
    note.appendChild(states);

    document.head.appendChild(css);
    document.body.appendChild(note);

    var badge = document.createElement('div');
    badge.className = 'demo-badge';
    badge.textContent = 'Generated media, simulated decoder, simulated network — no TV required.';
    document.body.appendChild(badge);

    function paint(screen, state) {
        Array.prototype.forEach.call(pages.children, function (a) {
            if (a.getAttribute('data-screen') === screen) a.setAttribute('aria-current', 'page');
            else a.removeAttribute('aria-current');
        });
        states.innerHTML = '';
        var current = DEMO_SCREENS.filter(function (s) { return s.id === screen; })[0];
        if (!current || current.states.length < 2) return;
        current.states.forEach(function (st) {
            var a = document.createElement('a');
            a.href = '#';
            a.textContent = st[1];
            if (st[0] === state) a.setAttribute('aria-current', 'page');
            a.addEventListener('click', function (ev) { ev.preventDefault(); pick(screen, st[0]); });
            states.appendChild(a);
        });
    }
    window.__demoPaint = paint;
    paint('home', 'default');

}

/* ── the screens ────────────────────────────────────────────────────────── */
function pick(screen, state) {
    closePages();
    if (window.__demoPaint) window.__demoPaint(screen, state);
    var app = window.VlcApp;
    if (!app) return;

    if (screen === 'home')     { app.home(); return; }
    if (screen === 'settings') { app.openSettings(); return; }
    if (screen === 'stream')   { app.openUrlView(); return; }
    if (screen === 'cast')     { showCastPage(); return; }
    if (screen === 'log')      { showLogPage(); return; }

    if (screen === 'video' || screen === 'audio') {
        var dir = screen === 'audio' ? 'Music' : 'Films';
        browseUsb([dir], function () { playFirst(); });
        return;
    }
    if (screen === 'usb') {
        if (state === 'series') { browseUsb(['Series', 'Season 1'], null); return; }
        if (state === 'music')  { browseUsb(['Music'], null); return; }
        app.browseUsbRoot();
        return;
    }
    if (screen === 'network') {
        // 'smb' shows what a configured TV does on this page: the source in
        // use comes up straight away.  The other states need the picker.
        if (state === 'smb') { app.openNetwork(); return; }
        app.showNetworkPicker();
        later(function () {
            if (state === 'dlna')       { click('#tile-dlna'); return; }
            if (state === 'webdav')     { app.openNetConfig('dav'); return; }
            if (state === 'smb-config') { app.openNetConfig('smb'); return; }
        }, 80);
        return;
    }
}

/* ── driving the real browser ───────────────────────────────────────────── */
function later(fn, ms) { setTimeout(fn, ms === undefined ? 120 : ms); }

function click(sel) {
    var el = document.querySelector(sel);
    if (el) el.click();
    return !!el;
}

/* Enter the USB drive and walk down the named folders, then call back.  The
 * root listing shows the storage itself, so the drive is clicked first. */
function browseUsb(path, done) {
    var app = window.VlcApp;
    app.browseUsbRoot();
    var steps = ['drive'].concat(path);
    var i = 0;
    (function step() {
        if (i >= steps.length) { if (done) later(done, 400); return; }
        var name = steps[i++];
        later(function () {
            var rows = Array.prototype.slice.call(document.querySelectorAll('#browse-list li'));
            var row = (name === 'drive')
                ? rows.filter(function (li) { return li.dataset.tag && li.dataset.tag.indexOf('root-') === 0; })[0]
                : rows.filter(function (li) {
                      var n = li.querySelector('.name');
                      return n && n.textContent === name;
                  })[0];
            if (row) row.click();
            later(step, 500);
        }, 600);
    })();
}

/* Play the first playable row in the current listing — the same click a
 * viewer makes with the remote. */
function playFirst() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#browse-list li'));
    var row = rows.filter(function (li) {
        return li.dataset.dir === '0' && li.querySelector('.name');
    })[0];
    if (row) row.click();
}

/* ── the two pages the TV's own service serves, as in-app cards ─────────── */
function pageCard(title, body) {
    closePages();
    var scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.id = 'demo-scrim';
    var card = document.createElement('div');
    card.className = 'track-menu phone-page';
    card.id = 'demo-page';
    card.innerHTML = '<h2>' + title + '</h2>' + body;
    document.body.appendChild(scrim);
    document.body.appendChild(card);
    if (typeof UI !== 'undefined') {
        UI.refreshFocusables();
        var focusable = card.querySelector('.btn, input');
        if (focusable) UI.focusOn(focusable);
    }
    return card;
}
function closePages() {
    ['demo-page', 'demo-scrim'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    });
}

/* The phone page the service serves at /cast, posting into the simulator's
 * cast inbox.  "Get URL from device" on the Stream screen then pulls it and
 * plays it — the real flow, without a phone. */
function showCastPage() {
    var card = pageCard('Cast to Tessel',
        '<p>http://simulator.local:8129/cast — open this on a phone or computer on the same network.</p>' +
        '<input id="demo-cast-url" type="url" placeholder="https://…/stream.m3u8" value="https://example.com/demo-film.mp4">' +
        '<button class="btn primary" id="demo-cast-send">Send to TV</button>');
    card.querySelector('#demo-cast-send').addEventListener('click', function () {
        var url = card.querySelector('#demo-cast-url').value.trim();
        if (!url) { UI.toast('Enter a URL first'); return; }
        Simulator.castSend(url);
        UI.toast('Sent — use Stream → Get URL from device');
    });
    return card;
}

/* The service's live log page (/debug), fed by the app's own console. */
function showLogPage() {
    var card = pageCard('Tessel log',
        '<p>http://simulator.local:8129/debug — live, over the network.</p>' +
        '<div class="phone-log" id="demo-log"></div>' +
        '<button class="btn ghost" id="demo-log-close">Close</button>');
    var box = card.querySelector('#demo-log');
    function paint() {
        if (!document.getElementById('demo-log')) { clearInterval(iv); return; }
        var text = (typeof Debug !== 'undefined' && Debug.exportText)
            ? Debug.exportText({ TV: 'Simulator', Build: 'demo' })
            : 'no log available';
        box.textContent = text.split('\n').slice(-40).join('\n');
    }
    var iv = setInterval(paint, 800);
    paint();
    card.querySelector('#demo-log-close').addEventListener('click', function () {
        clearInterval(iv);
        closePages();
    });
    return card;
}
