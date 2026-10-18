/* Demo shortcuts drive the production routes without timed click sequences. */
(function () {
    'use strict';
    var states = {
        home: ['default'], usb: ['default', 'empty', 'series', 'music'],
        network: ['default', 'smb-config', 'dav-config', 'dlna-config'],
        stream: ['default', 'receive'], video: ['default', 'queue'], audio: ['default', 'queue'], settings: ['default']
    };
    var labels = { home: 'Home', usb: 'USB', network: 'Network', stream: 'Stream', video: 'Video', audio: 'Audio', settings: 'Settings' };
    var remembered = {}, current = '', note, stateRow;
    function seed() {
        if (localStorage.getItem('tessel_demo_v3')) return;
        localStorage.setItem('vlctv_smb_v1', JSON.stringify({ host: 'demo-nas', port: 445, share: 'Media', anonymous: true }));
        SavedStreams.add('Demo film', 'https://example.com/demo-film.mp4');
        SavedStreams.add('Demo radio', 'https://example.com/radio.mp3');
        Library.recent('https://example.com/documentary.mp4', 'Documentary');
        var episodes = ['S01E01 - Pilot.mkv', 'S01E02 - The Second One.mkv', 'S01E03 - Crossroads.mkv', 'S01E04 - Home.mkv'].map(function (name) {
            return { uri: 'file:///removable1/Series/Season 1/' + name, title: name };
        });
        var watched = {}; episodes.slice(0, 3).forEach(function (p) { watched[p.uri] = Date.now(); });
        localStorage.setItem('vlctv_watched_v1', JSON.stringify(watched));
        Library.begin(episodes, 3);
        var film = 'file:///removable1/Films/Big Buck Bunny.mp4';
        Library.begin([{ uri: film, title: 'Big Buck Bunny.mp4' }], 0);
        Library.checkpoint(film, 90000, 596000);
        var resume = {}; resume[film] = { pos: 90000, dur: 596000, ts: Date.now() };
        localStorage.setItem('vlctv_resume_v1', JSON.stringify(resume));
        Favorites.add({ kind: 'usb', path: '/removable1/Series', root: 'removable1', rootPath: '/removable1', name: 'Series' });
        Favorites.add({ kind: 'smb', srv: '', path: '/', name: 'Demo NAS' });
        Favorites.add({ kind: 'usb', path: '/removable2/Films', name: 'Disconnected drive' });
        localStorage.setItem('tessel_demo_v3', '1');
    }
    function media(folder, audio) {
        var revision = UI.viewRevision;
        tizen.filesystem.resolve('/removable1/' + folder, function (dir) {
            Browser.listDir(dir, function (err, entries) {
                if (err || revision !== UI.viewRevision) return;
                var list = entries.filter(function (e) { return e.kind === (audio ? 'audio' : 'video'); }).map(function (e) {
                    return { uri: e.uri, title: e.name, file: e.file, subtitles: e.subtitles,
                        source: { kind: 'usb', path: dir.fullPath, root: 'removable1', rootPath: '/removable1' } };
                });
                VlcApp.play('browse', list, 0, dir);
            });
        }, function () {}, 'r');
    }
    function pick(page, state) {
        if (Dialog.isOpen()) Dialog.close(false);
        var previous = VlcApp.currentPageName();
        if (previous === 'audio' || previous === 'video') VlcApp.leavePlayback();
        Simulator.setUsbMounted(state !== 'empty');
        remembered[page] = state;
        if (page === 'home') VlcApp.home();
        else if (page === 'usb') {
            if (state === 'series' || state === 'music') VlcApp.openUsbFolder({ path: '/removable1/' + (state === 'music' ? 'Music' : 'Series/Season 1'), root: 'removable1', rootPath: '/removable1' });
            else VlcApp.browseUsbRoot();
        } else if (page === 'network') {
            VlcApp.openNetwork();
            if (state === 'smb-config' || state === 'dav-config') LibraryUI.editSource(state === 'smb-config' ? 'smb' : 'webdav', 'new');
            if (state === 'dlna-config') LibraryUI.addSource();
        } else if (page === 'stream') { VlcApp.openUrlView(); if (state === 'receive') LibraryUI.receive(); }
        else if (page === 'settings') VlcApp.openSettings();
        else { VlcApp.home(); media(page === 'audio' ? 'Music' : 'Films', page === 'audio'); }
        LibraryUI.refreshConnections();
        paint(page);
    }
    function paint(page) {
        if (!states[page]) return;
        current = page;
        Array.prototype.forEach.call(note.querySelectorAll('[data-screen]'), function (a) {
            if (a.dataset.screen === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        stateRow.innerHTML = '';
        states[page].forEach(function (state) {
            var a = document.createElement('a'); a.href = '?page=' + page + '&state=' + state; a.textContent = state;
            if ((remembered[page] || 'default') === state) a.setAttribute('aria-current', 'page');
            a.addEventListener('click', function (ev) { ev.preventDefault(); pick(page, state); }); stateRow.appendChild(a);
        });
        history.replaceState(null, '', '?page=' + page + '&state=' + (remembered[page] || 'default'));
    }
    document.addEventListener('DOMContentLoaded', function () {
        seed();
        var css = document.createElement('style'); css.textContent = '.demo-note{position:fixed;right:24px;top:14px;z-index:1000;font:14px/1.5 system-ui;text-align:right;background:#0a0a0acc;padding:8px;border-radius:8px}.demo-note a{color:#aaa;margin-left:12px;text-decoration:none}.demo-note a[aria-current]{color:white;text-decoration:underline}.demo-note small{color:#aaa}'; document.head.appendChild(css);
        note = document.createElement('div'); note.className = 'demo-note';
        var caption = document.createElement('small'); caption.textContent = 'Simulated demo · arrows / Enter · hold Enter for menu · Escape = Back'; note.appendChild(caption);
        var links = document.createElement('div'); Object.keys(states).forEach(function (page) {
            var a = document.createElement('a'); a.href = '?page=' + page; a.dataset.screen = page; a.textContent = labels[page];
            a.addEventListener('click', function (ev) { ev.preventDefault(); pick(page, remembered[page] || 'default'); }); links.appendChild(a);
        }); note.appendChild(links); stateRow = document.createElement('div'); note.appendChild(stateRow); document.body.appendChild(note);
        var params = new URLSearchParams(location.search), page = params.get('page') || 'home', state = params.get('state') || 'default';
        if (!states[page]) page = 'home';
        pick(page, state);
        var observer = new MutationObserver(function () { var page = VlcApp.currentPageName(); if (page !== current) paint(page); });
        Array.prototype.forEach.call(document.querySelectorAll('.view'), function (view) { observer.observe(view, { attributes: true, attributeFilter: ['class'] }); });
    });
})();
