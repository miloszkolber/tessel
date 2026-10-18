/* Top-level app coordinator: state, view transitions, action dispatch.
 *
 * Views (mutually exclusive):
 *   home    — start screen with three tiles
 *   url     — keyboard-input URL entry
 *   browse  — file browser (USB / local roots), and a playlist's entries
 *   player  — fullscreen video with OSD
 *   viewer  — picture or text viewer (js/viewer.js) over a browser folder
 */

(function () {

    /* ── Watched history (localStorage map uri → timestamp) ──────────
     * Lets the browser mark already-seen episodes so navigating a series
     * folder shows at a glance which files are done.  An item is marked
     * watched when playback finishes (oncomplete) or when the user leaves
     * after watching ≥ 90 % of it. */
    var WATCHED_KEY = 'vlctv_watched_v1';
    function getWatched() {
        try { return JSON.parse(localStorage.getItem(WATCHED_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function isWatched(uri) {
        if (!uri) return false;
        return !!getWatched()[uri];
    }
    function markWatched(uri) {
        if (!uri) return;
        if (typeof Library !== 'undefined') Library.complete(uri);
        // A finished file should start from the beginning next time.
        clearResumePos(uri);
        var w = getWatched();
        if (w[uri]) return;
        w[uri] = Date.now();
        // Cap growth: drop the oldest entries once we pass 500.
        var keys = Object.keys(w);
        if (keys.length > 500) {
            keys.sort(function (a, b) { return w[a] - w[b]; })
                .slice(0, keys.length - 500)
                .forEach(function (k) { delete w[k]; });
        }
        try { localStorage.setItem(WATCHED_KEY, JSON.stringify(w)); } catch (e) {}
    }

    /* ── Resume positions (localStorage map uri → {pos, dur, ts}) ─────
     * Lets a reopened file continue from where the user left off.  The
     * position is checkpointed every few seconds while playing (so it
     * survives a power-off where exitPlayer never runs) and saved on
     * exit / standby.  It's cleared once the file counts as watched
     * (oncomplete or ≥ 90 %) so finished files restart from zero. */
    var RESUME_KEY = 'vlctv_resume_v1';
    var RESUME_MIN_MS = 30000;   // positions in the first 30 s aren't worth resuming
    /* Aim the resume seek this far BEFORE the saved position.  AVPlay can
     * only land on keyframes and rounds the seek target forward to the
     * next one (~5-6 s GOPs are typical), so an exact-target seek ends up
     * PAST where the user left off.  Backing off 10 s makes the snap land
     * at or just before the exit point — replaying a few seconds of
     * context instead of silently skipping content. */
    var RESUME_BACKOFF_MS = 10000;
    /* Prev doubles as Restart: past this point in the file it seeks to 0,
     * and only a press within the first seconds jumps to the previous item
     * (the music-player convention).  Also the floor for dimming the OSD
     * button when there is neither a previous item nor anything to rewind. */
    var RESTART_THRESHOLD_MS = 3000;

    function getResumeMap() {
        try { return JSON.parse(localStorage.getItem(RESUME_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function setResumeMap(m) {
        try { localStorage.setItem(RESUME_KEY, JSON.stringify(m)); } catch (e) {}
    }
    function resumePosFor(uri) {
        if (!uri) return 0;
        var r = getResumeMap()[uri];
        return (r && r.pos > RESUME_MIN_MS) ? r.pos : 0;
    }
    function saveResumePos(uri, timeMs, durMs) {
        if (!uri) return;
        if (typeof Library !== 'undefined') Library.checkpoint(uri, timeMs, durMs);
        var m = getResumeMap();
        if (!timeMs || timeMs < RESUME_MIN_MS) {
            // Stopped near the start: drop any stale position so the next
            // open starts clean instead of jumping to an old spot.
            if (m[uri]) { delete m[uri]; setResumeMap(m); }
            return;
        }
        m[uri] = { pos: Math.floor(timeMs), dur: Math.floor(durMs || 0), ts: Date.now() };
        // Cap growth: drop the oldest entries once we pass 200.
        var keys = Object.keys(m);
        if (keys.length > 200) {
            keys.sort(function (a, b) { return m[a].ts - m[b].ts; })
                .slice(0, keys.length - 200)
                .forEach(function (k) { delete m[k]; });
        }
        setResumeMap(m);
    }
    function clearResumePos(uri) {
        if (!uri) return;
        var m = getResumeMap();
        if (m[uri]) { delete m[uri]; setResumeMap(m); }
    }

    /* ── Per-file playback choices (localStorage map uri → prefs) ───
     * Remembers what the user picked for one file — audio/subtitle
     * language, subtitle delay, speed and aspect — so reopening it
     * restores the same setup. A hand-picked choice is also stamped onto
     * every other file in the live queue, so the rest of the folder
     * follows without re-picking per episode. Per-file memory wins;
     * otherwise the global language/aspect preferences apply. */
    var PLAY_PREFS_KEY = 'vlctv_playback_prefs_v1';
    function getPlayPrefsMap() {
        try { return JSON.parse(localStorage.getItem(PLAY_PREFS_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function setPlayPrefsMap(m) {
        try { localStorage.setItem(PLAY_PREFS_KEY, JSON.stringify(m)); } catch (e) {}
    }
    function playPrefsFor(uri) {
        if (!uri) return null;
        var r = getPlayPrefsMap()[uri];
        return r || null;
    }
    function savePlayPrefs(uri, patch) {
        if (!uri || !patch) return;
        var m = getPlayPrefsMap();
        var cur = m[uri] || {};
        for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k];
        cur.ts = Date.now();
        m[uri] = cur;
        var keys = Object.keys(m);
        if (keys.length > 200) {
            keys.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); })
                .slice(0, keys.length - 200)
                .forEach(function (k) { delete m[k]; });
        }
        setPlayPrefsMap(m);
    }
    // Stamp the same choice onto every file in the live queue so the
    // rest of the folder follows the file being adjusted.
    function propagatePrefsToQueue(patch) {
        if (!patch || !state.playlist || !state.playlist.length) return;
        for (var i = 0; i < state.playlist.length; i++) {
            var item = state.playlist[i];
            if (item && item.uri && item.uri !== state.playingUri) savePlayPrefs(item.uri, patch);
        }
    }
    function rememberPlaybackChoice(patch, globalKey, globalValue) {
        if (!state.playingUri) return;
        savePlayPrefs(state.playingUri, patch);
        propagatePrefsToQueue(patch);
        if (globalKey && typeof globalValue !== 'undefined') {
            try {
                if (Settings.get(globalKey) !== globalValue) Settings.set(globalKey, globalValue);
            } catch (e) {}
        }
    }

    /* ── State ────────────────────────────────────────────────────── */
    var state = {
        view:       'home',        // home | url | browse | player
        browseDir:  null,          // current Tizen File or null at root listing
        browseAtRoot: true,        // true when listing the virtual roots
        browseRoot: null,          // { name, fullPath } of the virtual root being browsed, if known
        playingUri: null,
        playingTitle: '',
        // Where the current playback was launched from, so exiting the
        // player returns to that menu instead of always jumping home.
        origin:     'home',        // 'browse' | 'recent' | 'url' | 'home'
        originDir:  null,          // Tizen File of the browse folder when origin==='browse'
        // Ordered playable siblings + position, powering auto-play / next-prev.
        playlist:   [],            // [{ uri, title, subtitles }]
        playlistIndex: -1,
        // Set while the browse view lists a playlist's entries: what BACK does
        // there instead of going up a folder.  See openPlaylist().
        listBack:   null,
        // The playlist being shown, so leaving the player can return to it:
        // { src, entries, group }.
        playlistView: null,
        // Where leaving the player goes when the list came from elsewhere
        // (the SMB browser hands this over): fn({ uri, title }).
        originBack: null,
        playingIsAudio: false,
        // TV-service addresses shown in Settings (filled by renderPairingBlock).
        castPageUrl: '',
        debugPageUrl: ''
    };
    // Latest progress sample, used to decide partial-watch → watched on exit.
    var lastProgress = { time: 0, duration: 0 };
    // Throttle for the periodic resume-position checkpoint.
    var lastResumeSaveAt = 0;
    // Whether the OSD Prev button is currently lit as "Restart".
    var prevRestartLit = false;

    /* When the TV goes to standby, Tizen suspends the WebView.  AVPlay does
     * NOT survive this cleanly: on wake the session comes back with A/V
     * desync (short standby) or in a broken state where every operation
     * returns a codec-shaped error (long standby — the "MKV couldn't be
     * played" false report in issue #42).  Instead of trusting whatever
     * AVPlay hands back, we snapshot the current file + position on hidden
     * and re-open it from scratch on visible.  See onVisibilityChange +
     * the pendingResume block in the onstatechange('playing') handler. */
    var standbySnapshot = null;
    var pendingResume   = null;

    /* ── Init ─────────────────────────────────────────────────────── */
    function init() {
        Remote.init();

        // Wire button data-action click → dispatch.  Buttons stay
        // keyboard-activatable too because UI.activateFocused() calls click().
        document.body.addEventListener('click', function (ev) {
            var t = ev.target.closest('[data-action]');
            if (t) handleAction(t.dataset.action, t);
        });

        // Collapsible Settings sections (issue #28): clicking a section
        // toggle expands or collapses the next-sibling .settings-group it
        // points at via data-toggle.  Because the collapsed state uses
        // display:none, the inputs inside fall out of the focusable list
        // and the D-pad can't accidentally land on them — which is what
        // was popping the on-screen keyboard repeatedly and lagging /
        // crashing the app on slower Tizen firmware.
        document.body.addEventListener('click', function (ev) {
            var t = ev.target.closest('.settings-section-toggle');
            if (!t) return;
            var grp = document.getElementById(t.getAttribute('data-toggle'));
            if (!grp) return;
            var opening = grp.classList.contains('is-collapsed');
            grp.classList.toggle('is-collapsed', !opening);
            t.setAttribute('aria-expanded', opening ? 'true' : 'false');
            UI.refreshFocusables();
        });

        watchPlaylistList();
        watchPinHint();

        // Preset URL chips
        document.querySelectorAll('.preset').forEach(function (el) {
            el.addEventListener('click', function () {
                document.getElementById('url-input').value = el.dataset.url;
                openUrl(el.dataset.url);
            });
        });

        // Global remote handler — dispatched per current view
        Remote.push(globalKeyHandler);

        // Player events
        Player.setListener('onstatechange', function (s) {
            if (typeof Debug !== 'undefined') Debug.player('state → ' + s);
            updatePlayPauseButton(s);
            if (s === 'playing') {
                /* Don't clear the watchdog here — it needs to keep running so
                 * it can detect the "PLAYING but stuck at time=0" case.  The
                 * watchdog disarms itself once it sees time advancing. */
                hideSpinner();
                if (!document.getElementById('osd-bottom').classList.contains('hidden')) {
                    showOSD(true);
                    scheduleOSDHide();
                }
                applyLanguagePreferences();
                refreshPlaybackOptions();
                updateSpeedButton();   // Player.open reset speed to 1×; reflect it on the OSD

                /* Post-standby resume (issue #42): apply the saved position
                 * + paused state once the freshly-reopened file is actually
                 * playing.  Left paused so pressing Play resumes on the
                 * user's terms rather than blasting audio on TV wake. */
                if (pendingResume) {
                    var pr = pendingResume; pendingResume = null;
                    if (typeof Debug !== 'undefined')
                        Debug.player('standby-resume: seekTo=' + pr.pos + ' paused=' + pr.paused);
                    try {
                        if (pr.pos > 1500) Player.seekTo(pr.pos);
                        if (pr.paused) Player.pause();
                    } catch (e) {}
                }
            }
        });
        Player.setListener('onerror', function (msg) {
            var text = typeof msg === 'string' ? msg
                       : (msg && msg.message ? msg.message : JSON.stringify(msg));
            if (typeof Debug !== 'undefined') Debug.error('player onerror: ' + text);
            // If the failing URL is an SMB or WebDAV proxy stream, drain the
            // service's ring-buffer log to the PC listener so we can diagnose
            // what the proxy was doing when AVPlay gave up.
            if (typeof SMB !== 'undefined' && SMB.isStreamUrl && (SMB.isStreamUrl(state.playingUri) ||
                (typeof WebDAV !== 'undefined' && WebDAV.isStreamUrl(state.playingUri)))) {
                try { SMB.dumpServiceLogs(); } catch (e) {}
            }
            showError(text);
        });
        Player.setListener('onbuffering', function (active) {
            if (active) showSpinner(I18n.t('player.buffering'));
            else hideSpinner();
        });
        Player.setListener('onprogress', function (p) {
            lastProgress = { time: (p && p.time) || 0, duration: (p && p.duration) || 0 };
            // A committed scrub seek stays "waiting" until the playhead
            // lands near its target (async AVPlay seeks report the pre-seek
            // position for a while), with a timeout for failed seeks.
            if (scrub.waiting && !scrub.active &&
                (Math.abs(lastProgress.time - scrub.pos) <= SCRUB_SETTLE_TOL_MS ||
                 Date.now() - scrub.commitAt > SCRUB_SETTLE_MAX_MS))
                scrub.waiting = false;
            // While scrubbing or settling, the bar shows the preview
            // position, not the real playhead.
            if (!scrub.active && !scrub.waiting)
                updateProgress(p && p.time, p && p.duration);
            // The queue card's live bar for the row that's playing follows
            // the playhead without re-rendering (which would steal focus).
            if (!scrub.active && !scrub.waiting && lastProgress.duration) {
                var qf = document.querySelector('#up-next-list .active .up-next-fill');
                if (qf) qf.style.width = Math.min(100, lastProgress.time / lastProgress.duration * 100).toFixed(1) + '%';
            }
            // Prev lights up as Restart once past the first seconds.
            var canRestart = lastProgress.time > RESTART_THRESHOLD_MS;
            if (canRestart !== prevRestartLit) { prevRestartLit = canRestart; updateNextPrevButtons(); }
            // Checkpoint the position every 5 s so it survives a power-off
            // or app kill where exitPlayer never gets a chance to run.
            if (state.playingUri && lastProgress.time >= RESUME_MIN_MS &&
                Date.now() - lastResumeSaveAt > 5000) {
                lastResumeSaveAt = Date.now();
                saveResumePos(state.playingUri, lastProgress.time, lastProgress.duration);
            }
        });
        Player.setListener('oncomplete', function () {
            if (Settings.get('repeatMode') === 'one' && state.playingUri) {
                if (typeof Debug !== 'undefined') Debug.player('oncomplete: repeating');
                Player.seekTo(0);
                Player.play();
                return;
            }
            // A file that played to the end counts as watched.
            markWatched(state.playingUri);
            // Auto-play the next sibling if enabled and one exists; repeat-all
            // goes on by definition, wrapping round at the end.
            if ((Settings.get('autoPlay') || Settings.get('repeatMode') === 'all') && playNext(true)) return;
            UI.toast(I18n.t('player.finished'));
            exitPlayer();
        });
        // A track being read out of the container, or one that turned out
        // unreadable — the only place the user hears about either.
        Player.setListener('onsubnotice', function (msg) {
            if (msg) UI.toast(msg);
        });
        Player.setListener('onsubsupdated', function () {
            refreshPlaybackOptions();
            // Tracks the container declared but AVPlay never listed land
            // here — give an unmatched language preference another go.
            retrySubtitlePreference();
            // MP4 embedded-sub extraction completed.  If the CC menu is
            // currently open, re-render it so the new entries appear.
            var menu = document.getElementById('track-menu');
            if (menu && !menu.classList.contains('hidden')) {
                openTrackMenu();
            }
        });

        // Reflow display rect on size changes
        window.addEventListener('resize', Player.setDisplayRect);

        // Standby-safe playback restore (issue #42).
        document.addEventListener('visibilitychange', onVisibilityChange);

        // Second path for dedicated remote media keys (issue #42): on some
        // Samsung Smart Monitors the remote's Play / Pause / FF / RW keys
        // never arrive as `keydown` events at all — they're routed through
        // Chromium's MediaSession API instead.  Register handlers so those
        // remotes control playback too.  Only meaningful for the HTML5
        // backend (MP4/HLS); the AVPlay backend doesn't own a media element
        // and never becomes the browser's "active" media session, so this
        // is best-effort — the tvinputdevice path in remote.js remains the
        // primary route for AVPlay files.
        installMediaSessionHandlers();

        UI.showView('view-home');
        refreshHome();
        // While an Up Next card holds focus the strip stands tall, so cues
        // lift above it too (see the up-next-open subtitle rule).  focusout
        // fires before the incoming focus lands, hence the relatedTarget
        // guard so card-to-card moves don't flicker the lift.
        var upNextBox = document.getElementById('up-next');
        if (upNextBox) {
            upNextBox.addEventListener('focusin', function () {
                document.body.classList.add('up-next-open');
            });
            upNextBox.addEventListener('focusout', function (ev) {
                if (!upNextBox.contains(ev.relatedTarget)) document.body.classList.remove('up-next-open');
            });
        }
        updateRepeatButton();        // reflect saved repeat preference on OSD
        updateShuffleButton();       // reflect saved shuffle preference on OSD
        /* A mode saved by an older build that no longer exists — the zoom
           and crop modes AVPlay turned out to be incapable of — would show
           as Fit on the OSD while the stored value said otherwise. */
        if (!AspectRatio.isKnown(Settings.get('aspectMode'))) Settings.set('aspectMode', 'fit');
        updateAspectButton();        // reflect the saved aspect mode on the OSD
        SubtitleStyle.apply();       // push saved subtitle appearance onto the overlay
        connectNetwork();            // ready the chosen network source at launch
        // The service can outlive the WebView. Reapply the persisted listener
        // setting at startup, not only when the switch is pressed.
        SMB.ensureService(function (err) {
            if (!err) UrlDrop.setEnabled(Settings.get('castEnabled') !== false);
        });
    }

    /* ── Action dispatcher ────────────────────────────────────────── */
    function handleAction(action, el) {
        if (typeof Debug !== 'undefined') Debug.action(action);
        if (el && el.closest('#player-more') && action !== 'close-more') playerPopupReturn = action;
        switch (action) {
            case 'open-subtitle-sync': openSubtitleSync(); break;
            case 'subtitle-reset': adjustSubtitleSync(null); break;
            case 'open-more': openMore(); break;
            case 'close-more': closeMore(true); break;
            case 'open-url':           openUrlView(); break;
            case 'browse-usb':         openBrowserAtRoot(); break;
            case 'browse-smb':         openNetworkSource('smb'); break;
            case 'browse-dlna':        openNetworkSource('dlna'); break;
            case 'browse-webdav':      openNetworkSource('webdav'); break;
            case 'browse-network':    openNetwork(); break;
            case 'open-cast':          openCast(); break;
            case 'toggle-debug':       toggleDebug(); break;
            case 'open-smb-config':    openNetConfig('smb'); break;
            case 'open-dav-config':    openNetConfig('dav'); break;
            case 'close-net-config':   closeNetConfig(true); break;
            case 'toggle-cast':        toggleCast(); break;
            case 'open-settings':      openSettings(); break;
            case 'open-current-url': {
                var v = document.getElementById('url-input').value.trim();
                if (v) openUrl(v);
                else UI.toast(I18n.t('url.enterFirst'));
                break;
            }
            case 'fetch-remote-url':   fetchRemoteUrl(); break;
            case 'save-current-url':   saveCurrentUrl(); break;
            case 'play-saved':         playSaved(el.dataset.id); break;
            case 'saved-menu':         openSavedMenu(el.dataset.id); break;
            case 'saved-edit-done':    finishSavedEdit(); break;
            case 'saved-edit-cancel':  closeSavedEdit(); break;
            case 'back-home':          backToHome(); break;
            case 'play-pause':         Player.togglePause(); scheduleOSDHide(); break;
            case 'stop':               exitPlayer(); break;
            case 'prev':               handlePrev(); break;
            case 'next':               if (!playNext(false)) UI.toast(I18n.t('player.noNext'));     break;
            case 'play-queue-index':   playQueueIndex(el && el.dataset ? el.dataset.index : -1); break;
            case 'rewind': case 'seek-backward': seekJump(-1); flashOSD(); break;
            case 'forward': case 'seek-forward': seekJump(1); flashOSD(); break;
            case 'toggle-repeat':      toggleRepeat(); break;
            case 'toggle-shuffle':     toggleShuffle(); break;
            case 'open-speed-picker':  openSpeedPicker(); break;
            case 'open-aspect-picker': openAspectPicker(); break;
            case 'toggle-autoplay':    openAutoplayOptions(); break;
            case 'open-audio':        closeMore(false); openTrackMenu('audio'); break;
            case 'open-subtitles':    closeMore(false); openTrackMenu('subtitle'); break;
            case 'close-track-menu':   closeTrackMenu(); break;
            case 'open-file-info':     toggleFileInfo(); break;
            case 'close-file-info':    closeFileInfo(); break;
            case 'setting-ui-lang':       openUiLangPicker(); break;
            case 'close-picker':       closePicker(); break;
        }
    }

    /* ── URL playback ─────────────────────────────────────────────── */
    function openUrlView() {
        releaseBrowsers();
        closeSavedEdit(true);
        renderSavedStreams();
        UI.showView('view-url'); state.view = 'url';
    }
    function openUrl(url, title, back) {
        url = String(url || '').trim();
        if (!LibraryUI.validUrl(url)) { UI.toast(I18n.t('url.enterFirst')); return; }
        title = title || Library.title(url);
        Library.recent(url, title);
        // A channel or song list can't go to AVPlay as it is (issue #110):
        // read it first.  An HLS manifest turns out to be one when read, and
        // is then played exactly as before — so is anything that can't be
        // read here, which leaves AVPlay to try it.
        if (Playlist.isPlaylistUrl(url)) {
            openPlaylist({
                title:   title,
                read:    function (cb) { fetchBytes(url, cb); },
                resolve: function (ref) { return Playlist.resolveUrl(ref, url); },
                playAsStream: function () { playStreamUrl(url, title, back || returnToStreamPage); },
                // Drawn again: a channel may have been saved in the list.
                back:    back || returnToStreamPage
            });
            return;
        }
        playStreamUrl(url, title, back || returnToStreamPage);
    }
    /* Back from a stream that was launched here comes back to this screen. */
    function returnToStreamPage() {
        if (typeof Debug !== 'undefined') Debug.view('url (return)');
        openUrlView();
    }
    function playStreamUrl(url, title, back) {
        state.origin    = 'url';
        state.originDir = null;
        state.originBack = back || null;
        state.playlist  = [{ uri: url, title: title }];
        state.playlistIndex = 0;
        Library.begin(state.playlist, 0);
        playUri(url, title, {});
    }

    /* ── Saved streams (issue #119) ───────────────────────────────────
     * The user's own named list on the URL screen: OK on a chip plays it,
     * the ⋯ chip beside it edits, moves or removes it.  Saving and editing
     * share one name + URL form that takes the screen while it's open. */
    var savedEditing = null;           // id being edited, '' for a new one, null when closed
    var savedMenuFor = null;           // whose ⋯ menu was opened last, to come back to

    function renderSavedStreams() {
        LibraryUI.stream();
    }

    /* Focus a saved stream's chip once the list has been drawn again;
     * Play when the list has nothing left to land on. */
    function focusSaved(id, which) {
        setTimeout(function () {
            var el = id && document.querySelector('#saved-streams-list [data-action="' +
                         (which || 'play-saved') + '"][data-id="' + id + '"]');
            UI.focusOn(el || document.querySelector('#view-url [data-action="open-current-url"]'));
        }, 0);
    }

    function playSaved(id) {
        var s = SavedStreams.get(id);
        if (!s) return;
        document.getElementById('url-input').value = s.url;
        openUrl(s.url, s.name);
    }

    function saveCurrentUrl() {
        var url = document.getElementById('url-input').value.trim();
        if (!url) { UI.toast(I18n.t('url.enterFirst')); return; }
        var dup = SavedStreams.findByUrl(url);
        if (dup) { LibraryUI.stream('saved:' + dup.id); return; }
        if (!LibraryUI.validUrl(url)) { UI.toast(I18n.t('url.enterFirst')); return; }
        var saved = SavedStreams.add(Library.title(url), url);
        LibraryUI.stream('saved:' + saved.id);
    }

    function openSavedEdit(id, name, url) {
        savedEditing = id;
        document.getElementById('saved-name').value = name;
        document.getElementById('saved-url').value  = url;
        document.getElementById('view-url').classList.add('editing');
        UI.refreshFocusables();
        UI.focusOn(document.getElementById('saved-name'));
    }
    /* quiet: closing on the way into the screen, nothing to put focus back on. */
    function closeSavedEdit(quiet) {
        var id = savedEditing;
        savedEditing = null;
        var view = document.getElementById('view-url');
        if (!view.classList.contains('editing')) return;
        view.classList.remove('editing');
        UI.refreshFocusables();
        if (!quiet) focusSaved(id, id ? 'saved-menu' : null);
    }
    function finishSavedEdit() {
        var name = document.getElementById('saved-name').value;
        var url  = document.getElementById('saved-url').value.trim();
        if (!url) { UI.toast(I18n.t('url.enterFirst')); return; }
        var s = savedEditing ? SavedStreams.update(savedEditing, name, url)
                             : SavedStreams.add(name, url);
        if (!s) return;
        savedEditing = null;
        document.getElementById('view-url').classList.remove('editing');
        renderSavedStreams();
        UI.toast(I18n.t('saved.saved', s.name));
        focusSaved(s.id);
    }

    function openSavedMenu(id) {
        var items = SavedStreams.list();
        var at = -1;
        for (var i = 0; i < items.length; i++) if (items[i].id === id) at = i;
        if (at < 0) return;
        var s = items[at];
        savedMenuFor = id;
        var opts = [{ code: 'edit', name: I18n.t('saved.edit') }];
        if (at > 0)                opts.push({ code: 'up',   name: I18n.t('saved.moveUp') });
        if (at < items.length - 1) opts.push({ code: 'down', name: I18n.t('saved.moveDown') });
        opts.push({ code: 'remove', name: I18n.t('saved.remove') });
        openPicker(s.name, opts, null, function (code) {
            if (code === 'edit') {
                setTimeout(function () { openSavedEdit(s.id, s.name, s.url); }, 0);
                return;
            }
            if (code === 'remove') { confirmSavedRemove(s); return; }
            SavedStreams.move(s.id, code === 'up' ? -1 : 1);
            renderSavedStreams();
            focusSaved(s.id, 'saved-menu');
        });
    }
    function confirmSavedRemove(s) {
        // The picker that asked closes once this returns; open the next one after.
        setTimeout(function () {
            openPicker(I18n.t('saved.removeConfirm', s.name), [
                { code: 'remove', name: I18n.t('saved.remove') },
                { code: 'keep',   name: I18n.t('common.cancel') }
            ], 'keep', function (code) {
                if (code === 'remove') {
                    var items = SavedStreams.list(), next = null;
                    for (var i = 0; i < items.length; i++)
                        if (items[i].id === s.id) next = items[i + 1] || items[i - 1] || null;
                    SavedStreams.remove(s.id);
                    renderSavedStreams();
                    UI.toast(I18n.t('saved.removed', s.name));
                    focusSaved(next && next.id, 'saved-menu');
                } else {
                    focusSaved(s.id, 'saved-menu');
                }
            });
        }, 0);
    }

    /* ── URL drop (paste from any device) ─────────────────────────────
     * Pull the most recent URL the user pasted from their phone/tablet/laptop
     * and play it. The field is filled first so the URL is visible if
     * playback fails. Pairing (code + QR) lives in Settings. */
    function fetchRemoteUrl() {
        LibraryUI.receive();
    }

    /* Pairing block in Settings: the TV's own LAN address plus a locally-
     * generated QR encoding it. Everything stays on the local network —
     * the page, the POSTed link and the poll all live on the TV's own
     * service, so no relay or pairing code is involved. */
    function renderPairingBlock() {
        if (typeof UrlDrop === 'undefined') return;
        var urlEl = document.getElementById('pair-url');
        if (urlEl) urlEl.textContent = '…';

        UrlDrop.pageUrl(function (err, address) {
            if (urlEl) urlEl.textContent = address || I18n.t('cast.unavailable');
            state.castPageUrl = address || '';
            state.debugPageUrl = UrlDrop.debugPageUrl || '';
            paintCastRow();
            paintDebugRow();
            fillNetworkRows();
            var qrEl = document.getElementById('pair-qr');
            if (!qrEl) return;
            if (err || !address || typeof qrcode === 'undefined') {
                qrEl.innerHTML = '<div class="qr-missing">' + escapeHtml(I18n.t('cast.unavailable')) + '</div>';
                return;
            }
            try {
                var qr = qrcode(0, 'M');
                qr.addData(address);
                qr.make();
                qrEl.innerHTML = '<img alt="' + escapeHtml(I18n.t('cast.qrAlt')) + '" ' +
                    'style="width:100%;height:100%;image-rendering:pixelated" src="' +
                    qr.createDataURL(8, 8) + '">';
            } catch (e) {
                if (typeof Debug !== 'undefined') Debug.error('pair-qr: ' + e);
                qrEl.innerHTML = '<div class="qr-missing">' + escapeHtml(I18n.t('cast.unavailable')) + '</div>';
            }
        });
    }
    function urlBaseName(url) {
        try {
            var p = url.split('?')[0].split('#')[0];
            var seg = p.split('/').filter(Boolean);
            return decodeURIComponent(seg[seg.length - 1] || url);
        } catch (e) { return url; }
    }

    /* Leaving a source browser for a top-level screen: its Back handler goes
     * with it, or it would answer for a page the user is no longer on.  Real
     * navigation releases it through the browser's own exit; the preview and
     * the simulator jump between screens directly, so the app releases it
     * whenever a top-level screen takes over. */
    var browseSequence = 0;
    function releaseBrowsers() {
        browseSequence++;
        ['SMB', 'WebDAV', 'DLNA'].forEach(function (name) {
            var mod = window[name];
            if (mod && typeof mod.detach === 'function') {
                try { mod.detach(); } catch (e) {}
            }
        });
    }

    /* ── File browser ─────────────────────────────────────────────── */
    function openBrowserAtRoot() {
        releaseBrowsers();
        var seq = ++browseSequence;
        state.browseAtRoot = true;
        state.browseDir   = null;
        state.listBack    = null;
        setBrowsePage('usb');            // the drive's root listing
        UI.showView('view-browse'); state.view = 'browse';
        document.getElementById('browse-title').textContent = I18n.t('usb.title');
        document.getElementById('browse-description').textContent = I18n.t('usb.description');
        setBrowseGrid(true);
        document.getElementById('browse-list').classList.add('device-roots');
        document.getElementById('browse-path').textContent = '/';

        Browser.listRoots(function (err, roots) {
            if (seq !== browseSequence) return;
            document.getElementById('view-browse').classList.toggle('empty-storage', !!err || !roots.length);
            var ul = document.getElementById('browse-list');
            ul.innerHTML = '';
            /* The carousel is drawn from the drive that is attached right now,
             * so it goes up before the two "nothing to show" cases — with no
             * drive it hides itself rather than keeping the last listing's
             * cards on screen. */
            if (err) {
                ul.innerHTML = '<li><span class="icon"><img class="remix-icon" src="assets/remix/error-warning-line.svg" alt=""></span><span class="name">' +
                               err.message + '</span></li>';
                ul.classList.add('empty-devices'); UI.refreshFocusables(); UI.focusOn(ul.firstElementChild);
                return;
            }
            if (!roots.length) {
                ul.innerHTML = '<li><span class="icon"><img class="remix-icon" src="assets/remix/information-fill.svg" alt=""></span>'
                             + '<span class="name">' + escapeHtml(I18n.t('browse.noStorage')) + '</span></li>';
                ul.classList.add('empty-devices'); UI.refreshFocusables(); UI.focusOn(ul.firstElementChild);
                return;
            }
            roots.forEach(function (r, i) {
                var li = document.createElement('li');
                li.dataset.dir = '1';
                li.dataset.tag = 'root-' + i;
                li.dataset.idx = i;
                var pretty = prettifyRootName(r.name);
                var isUsb  = /removable|usb/i.test(r.name);
                LibraryUI.bindFolder(li, { kind: 'usb', name: pretty, path: r.fullPath, root: r.name, rootPath: r.fullPath });
                li.innerHTML  =
                    '<span class="icon"><img class="remix-icon" src="assets/remix/' + (isUsb ? 'hard-drive-2-fill' : 'folder-fill') + '.svg" alt=""></span>' +
                    '<span class="name">' + escapeHtml(pretty) + '</span>' +
                    '<span class="meta">' + escapeHtml(r.fullPath) + '</span>';
                li.addEventListener('click', function () {
                    state.browseAtRoot = false;
                    state.browseRoot   = { name: r.name, fullPath: r.fullPath };
                    listInto(r.dir);
                });
                ul.appendChild(li);
            });
            UI.refreshFocusables(); UI.focusOn(ul.firstElementChild);
        });
    }

    function listInto(dir, focusUri) {
        if (!dir) return;
        var seq = ++browseSequence;
        setBrowsePage('usb');
        setBrowseGrid(true);
        state.browseDir = dir;
        state.listBack  = null;
        document.getElementById('browse-title').textContent = dir.name || I18n.t('browse.folder');
        document.getElementById('browse-path').textContent = dir.fullPath;

        Browser.listDir(dir, function (err, entries) {
            if (seq !== browseSequence) return;
            var ul = document.getElementById('browse-list');
            ul.innerHTML = '';
            if (err) {
                ul.innerHTML = '<li><span class="icon"><img class="remix-icon" src="assets/remix/error-warning-line.svg" alt=""></span><span class="name">'
                             + err.message + '</span></li>';
                return;
            }
            // The folder's cover picture, for music without art of its own —
            // looked up before the filter, which may hide pictures.
            var artName = FileTypes.folderArt(entries.map(function (e) { return e.isDir ? '' : e.name; }));
            var art = null;
            entries.forEach(function (e) { if (!e.isDir && e.name === artName) art = e.uri; });
            // Media-only browser: folders, video, audio and playlists.
            entries = entries.filter(function (e) { return e.isDir || e.playable; });
            // Pinned folders lead the listing; everything else keeps order.
            entries.sort(function (a, b) {
                var pa = a.isDir && Favorites.find(usbFavorite(a.file, a.name)) ? 0 : 1;
                var pb = b.isDir && Favorites.find(usbFavorite(b.file, b.name)) ? 0 : 1;
                return pa - pb;
            });
            // Ordered list of playable media in this folder — the playlist
            // that auto-play and next/prev walk through.
            var playlist = entries
                .filter(function (e) { return e.playable; })
                .map(function (e) {
                    return { uri: e.uri, title: e.name, subtitles: e.subtitles, file: e.file,
                              source: usbFavorite(dir, dir.name),
                              art: e.kind === 'audio' ? art : null };
                });
            function backHere(uri) {
                return function (last) {
                    UI.showView('view-browse'); state.view = 'browse'; state.browseAtRoot = false;
                    listInto(dir, (last && last.uri) || uri);
                };
            }

            var focus = null;
            entries.forEach(function (e) {
                var li = document.createElement('li');
                li.dataset.uri = e.uri || '';
                li.dataset.dir = e.isDir ? '1' : '0';
                var watched = e.playable && isWatched(e.uri);
                if (watched) li.classList.add('watched-item');
                if (e.kind === 'other') li.classList.add('unopenable');
                var watchedBadge = watched ? '<span class="watched" title="' + escapeHtml(I18n.t('browse.watched')) + '"><img class="remix-icon" src="assets/remix/check-line.svg" alt=""></span>' : '';
                var subBadge = (e.subtitles && e.subtitles.length)
                    ? '<span class="meta">CC ×' + e.subtitles.length + '</span>'
                    : '';
                li.innerHTML =
                    '<span class="icon">' + FileTypes.icon(e.kind) + '</span>' +
                    '<span class="name">' + escapeHtml(e.name) + '</span>' +
                    watchedBadge +
                    subBadge +
                    (e.isDir ? '<span class="fav-mark"><img class="remix-icon" src="assets/remix/pushpin-2-fill.svg" alt=""></span>' :
                        '<span class="meta">' + Browser.humanSize(e.size) + '</span>');
                if (e.isDir) markFavoriteRow(li, usbFavorite(e.file, e.name));
                li.addEventListener('click', function () {
                    switch (e.kind) {
                        case 'dir':
                            listInto(e.file); return;
                        case 'video': case 'audio':
                            var idx = playlist.findIndex(function (p) { return p.uri === e.uri; });
                            playFromList('browse', playlist, idx >= 0 ? idx : 0, dir);
                            return;
                        case 'playlist':
                            openPlaylist({
                                title:   e.name,
                                read:    function (cb) { Browser.readHead(e.file, MAX_PLAYLIST_BYTES, cb); },
                                resolve: function (ref) { return Playlist.resolveUrl(ref, e.uri); },
                                // A local HLS manifest: what the browser always did with it.
                                playAsStream: function () {
                                    playFromList('browse', [{ uri: e.uri, title: e.name, file: e.file }], 0, dir);
                                },
                                back:    backHere(e.uri)
                            });
                            return;
                    }
                    UI.toast(I18n.t('browse.cantOpen'));
                });
                ul.appendChild(li);
                if (focusUri && e.uri === focusUri) focus = li;
            });
            if (!ul.children.length)
                ul.innerHTML = '<li><span class="icon"><img class="remix-icon" src="assets/remix/information-fill.svg" alt=""></span><span class="name">' + escapeHtml(I18n.t('browse.empty')) + '</span></li>';
            // Carousels only on the drive's own root listing.
            UI.refreshFocusables();
            UI.focusOn(focus || ul.firstElementChild);
        });
    }

    /* ── Favorites (issue #140) ───────────────────────────────────── */
    /* What pinning this local folder stores.  The virtual root it is on is
     * kept when known, because `removable_…/Shows` resolves on every
     * firmware where a bare /opt/media/… path may not. */
    function usbFavorite(file, name) {
        var fav = { kind: 'usb', path: (file && file.fullPath) || '', name: name || (file && file.name) || '' };
        var root = state.browseRoot;
        if (root && fav.path.indexOf(root.fullPath + '/') === 0) {
            fav.root = root.name; fav.rootPath = root.fullPath;
        }
        return fav;
    }
    /* A folder row that ► can pin or unpin: what to pin rides on the row,
     * the ♥ shows it is pinned. */
    function markFavoriteRow(li, fav) {
        if (!fav || !fav.path) return;
        if (window.LibraryUI) LibraryUI.bindFolder(li, fav);
        li.dataset.fav = JSON.stringify(fav);
        li.classList.toggle('is-fav', !!Favorites.find(fav));
    }
    function favoriteWhere(f) {
        if (f.kind === 'smb') {
            var srv = SMB.serverById(f.srv);
            return (srv && srv.host ? SMB.serverLabel(srv) : '\\\\?') + f.path.replace(/\//g, '\\');
        }
        if (f.kind === 'webdav') {
            var dav = WebDAV.serverById(f.srv);
            return (dav ? WebDAV.serverLabel(dav) : '?') + f.path;
        }
        return f.path;
    }
    /* ► on a folder row pins it to the top of its folder, or takes it off
     * again.  Pins live in the same store the old Favorites list used. */
    function toggleFavoriteRow() {
        var li = document.querySelector('#browse-list li.focused');
        if (!li || !li.dataset.fav) return false;
        var fav = null;
        try { fav = JSON.parse(li.dataset.fav); } catch (e) { return false; }
        var have = Favorites.find(fav);
        if (have) {
            Favorites.remove(have.id);
            UI.toast(I18n.t('pin.removed', have.name));
        } else {
            have = Favorites.add(fav);
            if (have) UI.toast(I18n.t('pin.added', have.name));
        }
        li.classList.toggle('is-fav', !!Favorites.find(fav));
        return true;
    }
    /* File explorers present folders (and files) as a grid of tiles; the
     * playlist channel list stays a list.  Shared with the SMB, WebDAV and
     * DLNA browsers, which draw into the same view. */
    /* Which page the user is actually on — the preview harness uses it to
     * keep its links honest.  The browse view serves three surfaces, and the
     * player is a different page for audio than for video. */
    var browsePage = 'usb';
    function setBrowsePage(name) {
        browsePage = name;
        var list = document.getElementById('browse-list');
        if (list) { list.classList.remove('device-roots'); list.classList.remove('empty-devices'); }
        document.getElementById('view-browse').classList.remove('empty-storage');
        var description = document.getElementById('browse-description');
        if (description) description.textContent = I18n.t(name === 'network' ? 'network.description' : 'usb.description');
    }
    function currentPageName() {
        // Read from the visible view: the preview harness drives views
        // directly, and state.view lags behind in a few paths.
        var views = document.querySelectorAll('.view');
        for (var i = 0; i < views.length; i++) {
            if (views[i].classList.contains('hidden')) continue;
            var id = views[i].id;
            if (id === 'view-home')     return 'home';
            if (id === 'view-browse')   return browsePage;
            if (id === 'view-player')   return state.playingIsAudio ? 'audio' : 'video';
            if (id === 'view-url')      return 'stream';
            if (id === 'view-network')  return 'network';
            if (id === 'view-settings' || id === 'view-cast') return 'settings';
        }
        return state.view;
    }

    function setBrowseGrid(on) {
        var ul = document.getElementById('browse-list');
        if (ul) ul.classList.toggle('grid', !!on);
    }

    /* ► pins a folder: show that hint exactly while a pinnable row holds the
     * cursor, whichever browser drew the list. */
    function watchPinHint() {
        var hint = document.getElementById('hint-fav');
        var ul = document.getElementById('browse-list');
        if (!hint || !ul) return;
        function paint() {
            var row = ul.querySelector('li.focused');
            hint.classList.toggle('hidden', !(row && row.dataset && row.dataset.fav));
        }
        document.addEventListener('focusin', paint);
        ul.addEventListener('click', function () { setTimeout(paint, 0); });
        if (typeof MutationObserver !== 'undefined')
            new MutationObserver(paint).observe(ul, { childList: true, subtree: true, attributes: true,
                                                      attributeFilter: ['class'] });
    }

    /* The browse list is on screen — also under the SMB browser, which
     * draws into the same view without touching state.view. */
    function browseShowing() {
        var v = document.getElementById('view-browse');
        return !!v && !v.classList.contains('hidden');
    }

    function browseUp() {
        if (state.browseAtRoot) { backToHome(); return; }
        var p = Browser.parentOf(state.browseDir);
        if (!p) { openBrowserAtRoot(); return; }
        listInto(p);
    }

    /* ── Network view: the services on the LAN, with the two carousels ────
     * SMB, DLNA and WebDAV are one place now instead of three home tiles.
     * With a source set up, opening the page lands on its files — that is
     * what the user came for — and Back from the source's own root comes
     * back here to the picker. */
    function openNetwork() {
        showNetworkPicker();
    }
    function showNetworkPicker() {
        state.networkBack = null;
        networkReturn = false;
        releaseBrowsers();
        UI.showView('view-network');
        state.view = 'network';
        closeNetConfig(false);
        fillNetworkRows();
        LibraryUI.network();
    }
    /* Where a source browser's root-level BACK goes when it was opened from
     * the Network page: back on the picker, once.  false lets the browser
     * fall through to its own destination. */
    var networkReturn = false;
    function networkSourceBack() {
        showNetworkPicker();
        return true;
    }

    /* ── Cast page: the QR and address a phone scans ──────────────────────
     * The block used to sit inside Settings; it is its own page now. */
    function openCast() {
        releaseBrowsers();
        UI.showView('view-cast');
        state.view = 'cast';
        renderPairingBlock();
    }

    /* Activating a source: the chosen and configured one browses; anything
     * else opens its configuration, which also makes it the chosen method. */
    function openNetworkSource(method) {
        if (networkMethod() === method && isConfigured(method)) {
            networkReturn = true;                             // its root BACK returns to the picker
            if (method === 'smb')    return SMB.openBrowser();
            if (method === 'webdav') return WebDAV.openBrowser();
            return DLNA.openBrowser();
        }
        if (method === 'dlna') return DLNA.openBrowser();     // discovery is its setup
        openNetConfig(method === 'webdav' ? 'dav' : 'smb');
    }

    /* ── Network configuration, in a modal over the Network page ──────────
     * The SMB and WebDAV forms used to live in Settings; they belong with the
     * sources they configure. */
    function openNetConfig(which) {
        LibraryUI.editSource(which === 'dav' ? 'webdav' : 'smb', 'new');
    }
    /* Called by the SMB/WebDAV forms once a server is saved: that method
     * becomes the one network connection in use. */
    function setNetworkMethod(method) {
        Settings.set('networkMethod', method);
        fillNetworkRows();
        connectNetwork();
    }
    /* Connect the chosen method at launch (and on switch), so browsing is
     * ready before the user asks for it: SMB/WebDAV open their session, DLNA
     * looks for the pinned server so its page is populated on the way in. */
    function connectNetwork() {
        LibraryUI.refreshConnections();
    }
    function closeNetConfig(restore) {
        document.getElementById('net-config').classList.add('hidden');
        document.getElementById('net-scrim').classList.add('hidden');
        UI.refreshFocusables();
        if (restore && state.view === 'network')
            UI.focusOn(document.getElementById('tile-smb'));
    }
    /* Casting can be switched off entirely: the service stops accepting
     * links and the app stops polling for them. */
    var castChanging = false;
    function toggleCast() {
        if (castChanging) return;
        var on = !Settings.get('castEnabled');
        castChanging = true;
        var row = document.querySelector('[data-action="toggle-cast"]');
        row.setAttribute('aria-busy', 'true');
        SMB.ensureService(function (err) {
            if (err) return finish(err);
            UrlDrop.setEnabled(on, finish);
        });
        function finish(err) {
            castChanging = false;
            row.removeAttribute('aria-busy');
            if (err) { UI.toast(I18n.t('cast.unavailable')); return; }
            Settings.set('castEnabled', on);
            paintCastRow();
            if (on) toastServiceUrl(false);
        }
    }
    function paintCastRow() {
        var el = document.getElementById('settings-cast-value');
        var on = Settings.get('castEnabled') !== false;
        if (el) {
            el.classList.toggle('on', on);
            el.parentNode.setAttribute('aria-checked', String(on));
        }
    }
    /* One network method at a time: the chosen tile browses, the others offer
     * to be set up (and taking one over releases the previous). */
    function networkMethod() { return Settings.get('networkMethod') || ''; }
    function isConfigured(method) {
        try {
            if (method === 'smb')    return (SMB.servers() || []).length > 0;
            if (method === 'webdav') return (WebDAV.servers() || []).length > 0;
            if (method === 'dlna')   return !!Settings.get('dlnaServer');
        } catch (e) {}
        return false;
    }
    function fillNetworkRows() {
        var method = networkMethod();
        [['smb', 'tile-smb', 'tile-smb-sub'], ['dlna', 'tile-dlna', 'tile-dlna-sub'],
         ['webdav', 'tile-dav', 'tile-dav-sub']].forEach(function (t) {
            var tile = document.getElementById(t[1]);
            var sub  = document.getElementById(t[2]);
            if (!tile) return;
            var chosen = (method === t[0]);
            tile.classList.toggle('disabled', !!method && !chosen);
            tile.setAttribute('aria-disabled', (!!method && !chosen) ? 'true' : 'false');
            if (!sub) return;
            if (chosen && isConfigured(t[0])) {
                sub.textContent = I18n.t('net.inUse');
            } else if (isConfigured(t[0])) {
                sub.textContent = I18n.t('net.switchTo');
            } else {
                sub.textContent = I18n.t('net.setUp');
            }
        });
    }

    /* Debug logging: switch the service log page feed on or off, and show
     * where that page lives. */
    function toggleDebug() {
        var on = !(typeof Debug !== 'undefined' && Debug.enabled && Debug.enabled());
        if (typeof Debug !== 'undefined' && Debug.setEnabled) Debug.setEnabled(on);
        paintDebugRow();
        if (on) toastServiceUrl(true);
    }
    function paintDebugRow() {
        var el = document.getElementById('dbg-enabled-value');
        var on = !!(typeof Debug !== 'undefined' && Debug.enabled && Debug.enabled());
        if (el) {
            el.classList.toggle('on', on);
            el.parentNode.setAttribute('aria-checked', String(on));
        }
    }

    function toastServiceUrl(debug) {
        SMB.ensureService(function (err) {
            if (err) { UI.toast(I18n.t(debug ? 'dbg.pageUnavailable' : 'cast.unavailable')); return; }
            UrlDrop.pageUrl(function (error, address) {
                state.castPageUrl = address || '';
                state.debugPageUrl = UrlDrop.debugPageUrl || '';
                UI.toast((!error && (debug ? state.debugPageUrl : state.castPageUrl)) ||
                    I18n.t(debug ? 'dbg.pageUnavailable' : 'cast.unavailable'));
            });
        });
    }


    /* ── Playlists (issue #110) ───────────────────────────────────────
     * src: {
     *   title,
     *   read(cb)      — cb(err, Uint8Array) with the list's bytes,
     *   resolve(ref)  — an entry's reference → the URI to play, or null,
     *   playAsStream()— play the list itself (it's an HLS manifest),
     *   back()        — where BACK goes from the list
     * }
     * Entries show in the browse view, grouped by group-title when the list
     * has more than one group — a big IPTV list is thousands of channels,
     * which is too many to scroll through, and too many for the TV to lay
     * out in one go. */
    var MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;

    function openPlaylist(src) {
        setBrowsePage('playlist');
        setBrowseGrid(false);
        state.listBack = null;
        UI.showView('view-browse'); state.view = 'browse'; state.browseAtRoot = false;
        document.getElementById('browse-title').textContent = src.title;
        document.getElementById('browse-path').textContent = '';
        var ul = document.getElementById('browse-list');
        ul.innerHTML = '<li><span class="icon"><img class="remix-icon" src="assets/remix/loader-4-line.svg" alt=""></span><span class="name">' +
                       escapeHtml(I18n.t('playlist.reading')) + '</span></li>';
        // BACK works while it loads too.
        state.listBack = src.back;
        var seq = ++playlistSeq;

        src.read(function (err, bytes) {
            // Left meanwhile: BACK clears listBack, other lists replace it.
            if (seq !== playlistSeq || state.view !== 'browse' || state.listBack !== src.back) return;
            var parsed = null;
            if (!err) {
                var d = TextDecode.decode(bytes);
                if (!d.binary) parsed = Playlist.parse(d.text);
            }
            if (!parsed || parsed.hls) {
                if (typeof Debug !== 'undefined')
                    Debug.player('playlist ' + src.title + ': ' + (parsed ? 'HLS manifest' :
                                 'unreadable (' + (err && err.message || 'binary') + ')') + ' → playing as a stream');
                state.listBack = null;
                src.playAsStream();
                return;
            }
            var entries = [];
            parsed.entries.forEach(function (e) {
                var uri = src.resolve(e.ref);
                if (uri) entries.push({ uri: uri, title: e.title, group: e.group, art: logoUrl(e.logo, src) });
            });
            if (typeof Debug !== 'undefined')
                Debug.player('playlist ' + src.title + ': ' + entries.length + ' of ' +
                             parsed.entries.length + ' entries playable');
            if (!entries.length) {
                ul.innerHTML = '<li><span class="icon"><img class="remix-icon" src="assets/remix/information-fill.svg" alt=""></span><span class="name">' +
                               escapeHtml(I18n.t('playlist.empty')) + '</span></li>';
                return;
            }
            state.playlistView = { src: src, entries: entries, group: null, filter: '' };
            document.getElementById('playlist-filter').value = '';
            renderPlaylist();
        });
    }
    var playlistSeq = 0;

    /* The groups, or one group's entries (all entries when there's only one
     * group), or — while the filter has text — the matching entries of every
     * group.  focusUri puts the cursor back on the entry just played;
     * keepFocus leaves it in the filter field while the user types. */
    function renderPlaylist(focusUri, keepFocus) {
        setBrowseGrid(false);
        var pv = state.playlistView;
        if (!pv) return;
        var groups = Playlist.groups(pv.entries);
        var grouped = groups.length > 1;
        var query = foldText(pv.filter || '');
        if (!keepFocus) { UI.showView('view-browse'); state.view = 'browse'; state.browseAtRoot = false; }
        document.getElementById('browse-title').textContent = pv.src.title;
        document.getElementById('browse-path').textContent = query ? '' :
            grouped && pv.group !== null ? groupName(pv.group) : '';
        var ul = document.getElementById('browse-list');
        ul.innerHTML = '';
        var focus = null;
        if (logoObserver) { logoObserver.disconnect(); logoObserver = null; }

        if (grouped && pv.group === null && !query) {
            state.listBack = pv.src.back;
            groups.forEach(function (g) {
                var li = document.createElement('li');
                li.dataset.dir = '1';
                li.dataset.playlist = '1';
                li.innerHTML = '<span class="icon"><img class="remix-icon" src="assets/remix/folder-fill.svg" alt=""></span>' +
                               '<span class="name">' + escapeHtml(groupName(g.name)) + '</span>' +
                               '<span class="meta">' + g.count + '</span>';
                li.addEventListener('click', function () { pv.group = g.name; renderPlaylist(); });
                ul.appendChild(li);
                if (focusUri === 'group:' + g.name) focus = li;
            });
        } else {
            // Back clears the filter before it leaves the group or the list.
            state.listBack = query ? clearPlaylistFilter
                : grouped
                ? function () { var was = pv.group; pv.group = null; renderPlaylist('group:' + was); }
                : pv.src.back;
            var items = pv.entries.filter(function (e) {
                if (query) return foldText(e.title).indexOf(query) >= 0 ||
                                  (grouped && foldText(groupName(e.group)).indexOf(query) >= 0);
                return !grouped || (e.group || '') === pv.group;
            });
            // What the keyboard really typed, for a layout that doesn't find
            // what it should (Cyrillic was reported, issue #126).
            if (query && typeof Debug !== 'undefined')
                Debug.info('playlist filter ' + describeText(pv.filter) + ' (' + (lastFilterEvent || '?') +
                           '): ' + items.length + ' of ' + pv.entries.length);
            if (!items.length) {
                ul.innerHTML = '<li data-playlist="1"><span class="icon"><img class="remix-icon" src="assets/remix/information-fill.svg" alt=""></span><span class="name">' +
                               escapeHtml(I18n.t('playlist.noMatches', pv.filter.trim())) + '</span></li>';
            }
            items.forEach(function (e, i) {
                var li = document.createElement('li');
                li.dataset.playlist = '1';
                li.dataset.uri = e.uri;
                li.dataset.channel = e.title;
                if (e.art) li.dataset.logo = e.art;
                li.innerHTML = '<span class="icon channel-icon"><span class="glyph">' + FileTypes.icon(entryKind(e)) + '</span></span>' +
                               '<span class="name">' + escapeHtml(e.title) + '</span>' +
                               (query && grouped ? '<span class="meta">' + escapeHtml(groupName(e.group)) + '</span>' : '') +
                               '<span class="saved-mark"><img class="remix-icon" src="assets/remix/star-fill.svg" alt=""></span>';
                li.classList.toggle('is-saved', !!SavedStreams.findByUrl(e.uri));
                li.addEventListener('click', function () {
                    state.listBack = null;
                    playFromList('playlist', items, i, null);
                });
                ul.appendChild(li);
                if (focusUri && e.uri === focusUri) focus = li;
            });
        }
        loadLogos(ul);
        UI.refreshFocusables();
        if (!keepFocus) UI.focusOn(focus || ul.firstElementChild);
    }

    /* The playlist filter (issue #122): what's typed matches anywhere in a
     * title, folded the same way on both sides (Playlist.foldText), across
     * every group.  Redrawn a moment after typing stops, so a 10 000-channel
     * list keeps up. */
    var foldText = Playlist.foldText;
    /* `"Спорт" [U+0421 U+043F …]`: text with its code points, for the log —
     * the one way to see what a keyboard layout really put in a field. */
    function describeText(s) {
        s = String(s || '');
        var cps = [];
        for (var i = 0; i < s.length && i < 16; i++)
            cps.push('U+' + ('000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4));
        return JSON.stringify(s) + ' [' + cps.join(' ') + (s.length > 16 ? ' …' : '') + ']';
    }
    var filterTimer = null, lastFilterEvent = '';
    function onPlaylistFilterInput(ev) {
        lastFilterEvent = (ev && ev.type) || '';
        clearTimeout(filterTimer);
        filterTimer = setTimeout(function () {
            var pv = state.playlistView;
            var input = document.getElementById('playlist-filter');
            if (!pv || state.view !== 'browse' || pv.filter === input.value) return;
            pv.filter = input.value;
            renderPlaylist(null, true);
        }, 250);
    }
    function clearPlaylistFilter() {
        var pv = state.playlistView;
        clearTimeout(filterTimer);
        document.getElementById('playlist-filter').value = '';
        if (!pv) return;
        pv.filter = '';
        renderPlaylist();
    }
    /* The field only while a playlist is listed; every browse list is drawn
     * into the same <ul>, which also tells the ► hint when to show. */
    function watchPlaylistList() {
        var ul = document.getElementById('browse-list');
        var hint = document.getElementById('hint-save');
        var hintFav = document.getElementById('hint-fav');
        var filter = document.getElementById('playlist-filter-wrap');
        var input = document.getElementById('playlist-filter');
        // Not every keyboard layout reports typing as `input` on every
        // firmware (Cyrillic was reported not to filter, issue #126), so
        // every event that can follow a change is heard; the handler only
        // redraws when the text actually differs.
        if (input) ['input', 'change', 'keyup', 'compositionend'].forEach(function (ev) {
            input.addEventListener(ev, onPlaylistFilterInput);
        });
        if (!ul || typeof MutationObserver === 'undefined') return;
        new MutationObserver(function () {
            if (hint) hint.classList.toggle('hidden', !ul.querySelector('li[data-channel]'));
            if (hintFav) hintFav.classList.toggle('hidden', !ul.querySelector('li[data-fav]'));
            if (filter) filter.classList.toggle('hidden', !ul.querySelector('li[data-playlist]'));
        }).observe(ul, { childList: true });
    }

    /* Channel logos (tvg-logo, issue #123).  A relative one sits beside the
     * list, like the streams; only web addresses are kept, which covers
     * the list's own folder on SMB too (the service serves it over http). */
    function logoUrl(logo, src) {
        if (!logo) return null;
        var u = /^https?:/i.test(logo) ? logo : src.resolve(logo);
        return u && /^https?:/i.test(u) ? u : null;
    }
    /* A list of thousands of channels mustn't fetch thousands of pictures:
     * a logo is fetched once its row scrolls near the screen.  Until it has
     * loaded, and for good when it can't, the row keeps its plain icon. */
    var logoObserver = null;
    var LOGOS_WITHOUT_OBSERVER = 40;
    function loadLogos(ul) {
        var rows = ul.querySelectorAll('li[data-logo]');
        if (!rows.length) return;
        if (typeof IntersectionObserver === 'undefined') {
            for (var i = 0; i < rows.length && i < LOGOS_WITHOUT_OBSERVER; i++) showLogo(rows[i]);
            return;
        }
        logoObserver = new IntersectionObserver(function (seen, obs) {
            seen.forEach(function (s) {
                if (!s.isIntersecting) return;
                obs.unobserve(s.target);
                showLogo(s.target);
            });
        }, { root: ul, rootMargin: '400px 0px' });
        for (var j = 0; j < rows.length; j++) logoObserver.observe(rows[j]);
    }
    function showLogo(li) {
        var slot = li.querySelector('.channel-icon');
        if (!slot || slot.querySelector('.channel-logo')) return;
        var img = document.createElement('img');
        img.className = 'channel-logo';
        img.alt = '';
        img.onload  = function () { slot.classList.add('has-logo'); };
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
        img.src = li.dataset.logo;
        slot.appendChild(img);
    }
    function groupName(g) { return g || I18n.t('playlist.ungrouped'); }

    /* Right on a channel row puts it on Saved streams, or takes it off
     * again (issue #121), so a few channels out of a big IPTV list play
     * straight from the URL screen.  The ★ shows which are on it. */
    function toggleSavedChannel() {
        var li = document.querySelector('#browse-list li.focused');
        if (!li || li.dataset.channel == null) return false;
        var s = SavedStreams.findByUrl(li.dataset.uri);
        if (s) {
            SavedStreams.remove(s.id);
            UI.toast(I18n.t('saved.removed', s.name));
        } else {
            s = SavedStreams.add(li.dataset.channel, li.dataset.uri);
            if (s) UI.toast(I18n.t('saved.saved', s.name));
        }
        li.classList.toggle('is-saved', !!SavedStreams.findByUrl(li.dataset.uri));
        return true;
    }

    /* A stream URL has no extension more often than not; call it video. */
    function entryKind(e) {
        var k = FileTypes.kind(String(e.uri).split('?')[0]);
        return k === 'audio' ? 'audio' : 'video';
    }

    /* The bytes behind a URL, for a playlist typed on the URL screen.  A
     * plain GET: an IPTV panel rarely answers Range requests. */
    function fetchBytes(url, cb) {
        var done = false;
        function finish(err, bytes) { if (!done) { done = true; cb(err, bytes); } }
        try {
            var x = new XMLHttpRequest();
            x.open('GET', url, true);
            x.responseType = 'arraybuffer';
            x.timeout = 20000;
            x.onload = function () {
                if (x.status < 200 || x.status >= 300) { finish(new Error('HTTP ' + x.status)); return; }
                var b = new Uint8Array(x.response || new ArrayBuffer(0));
                finish(null, b.length > MAX_PLAYLIST_BYTES ? b.subarray(0, MAX_PLAYLIST_BYTES) : b);
            };
            x.onerror   = function () { finish(new Error('network error')); };
            x.ontimeout = function () { finish(new Error('timed out')); };
            x.send();
        } catch (e) { finish(e); }
    }

    /* ── Standby handling (issue #42) ────────────────────────────────
     * Tizen sends `visibilitychange` when the TV screen turns off / the app
     * gets hidden by another surface.  AVPlay's session doesn't survive
     * that reliably (see the standbySnapshot comment above); we tear down
     * on hidden and, on wake, re-open the same file with the saved
     * subtitles list and defer a seek-to-position + pause until the new
     * session actually reaches PLAYING (handled in the onstatechange
     * listener). */
    function onVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            if (state.view !== 'player' || !state.playingUri) return;
            var subs = [];
            var cur = state.playlist[state.playlistIndex];
            if (cur && cur.subtitles) subs = cur.subtitles;
            standbySnapshot = {
                uri:       state.playingUri,
                title:     state.playingTitle,
                subtitles: subs,
                // Preserve the live Tizen File object for standby resumes;
                // it carries size/path APIs used by incremental extraction.
                file:      cur && cur.file ? cur.file : null,
                tagSrc:    cur && cur.tagSrc ? cur.tagSrc : null,
                pos:       Player.currentTime() || 0,
                paused:    Player.state() === 'PAUSED'
            };
            if (typeof Debug !== 'undefined')
                Debug.player('visibility=hidden: snapshot pos=' + standbySnapshot.pos + 'ms paused=' + standbySnapshot.paused);
            // Persist the exact position too — if the TV never wakes back
            // into the app, the next launch still resumes from here.
            saveResumePos(state.playingUri, standbySnapshot.pos, lastProgress.duration);
            try { Player.stop(); } catch (e) {}
        } else if (document.visibilityState === 'visible') {
            if (!standbySnapshot) return;
            var ss = standbySnapshot; standbySnapshot = null;
            if (typeof Debug !== 'undefined')
                Debug.player('visibility=visible: restoring ' + ss.uri + ' at ' + ss.pos + 'ms');
            playUri(ss.uri, ss.title, {
                subtitles: ss.subtitles,
                file:      ss.file,
                tagSrc:    ss.tagSrc,
                resume:    { pos: ss.pos, paused: ss.paused }
            });
        }
    }

    /* ── Common: open a URI in player view ────────────────────────── */
    var openWatchdog = null;
    var playbackGeneration = 0;
    function playUri(uri, title, opts) {
        opts = opts || {};
        var generation = ++playbackGeneration;
        if (typeof Debug !== 'undefined') Debug.player('playUri uri=' + uri + '  title=' + title);

        // Reset the once-per-file gate so applyLanguagePreferences runs for
        // the new file (and not for the previous file).
        prefsAppliedFor = null;
        lastProgress = { time: 0, duration: 0 };
        lastResumeSaveAt = 0;
        prevRestartLit = false;
        resetScrub();          // a scrub/settle from the previous file must
                               // not freeze the new file's progress bar

        /* Seek-once-playing (applied in the onstatechange('playing')
         * handler): a standby wake passes an explicit resume point via
         * opts.resume; otherwise fall back to the persisted last-watched
         * position so a reopened file continues where the user left off.
         * Always assigned, so a stale pendingResume from a restore that
         * never reached PLAYING can't leak into the next file. */
        if (opts.resume) {
            pendingResume = { pos: opts.resume.pos, paused: opts.resume.paused };
        } else if (opts.fromStart) {
            // Explicitly starting over: drop the saved position so the file
            // also opens clean next time (until playback saves a new one).
            clearResumePos(uri);
            pendingResume = null;
        } else {
            // Anything half-watched continues where it stopped.  No prompt,
            // no toast: the position is simply where playback starts.
            var resumeAt = resumePosFor(uri);
            pendingResume = resumeAt
                ? { pos: Math.max(0, resumeAt - RESUME_BACKOFF_MS), paused: false }
                : null;
        }

        state.playingUri = uri;
        state.playingTitle = title || uri;
        updateNextPrevButtons();
        UI.showView('view-player'); state.view = 'player';
        if (typeof Debug !== 'undefined') Debug.view('player');

        document.getElementById('osd-title').textContent = title || uri;
        var isAudio = FileTypes.kind(title || '') === 'audio' ||
                      FileTypes.kind(String(uri).split('?')[0]) === 'audio';
        document.getElementById('audio-card').classList.toggle('hidden', !isAudio);
        document.getElementById('audio-title').textContent = isAudio ? (title || uri) : '';
        state.playingIsAudio = isAudio;
        refreshPlaybackOptions();
        showAudioTags(isAudio ? uri : null, opts);
        document.getElementById('osd-top').classList.remove('hidden');
        document.getElementById('osd-bottom').classList.remove('hidden');
        showSpinner(I18n.t('player.openingShort'));
        hideError();

        // Defer slightly so the <object> element is laid out before AVPlay
        // tries to bind to it.  No need to call setDisplayRect here — AVPlay
        // is in an idle state before open() and would error with INVALID_STATE.
        // The proper setDisplayRect happens after prepareAsync succeeds.
        setTimeout(function () {
            if (generation !== playbackGeneration || state.view !== 'player') return;
            Player.open(uri, {
                title:     title,
                subtitles: opts.subtitles || [],
                file:      opts.file || null,
                // Embedded subtitles are read from the file itself.
                sourceUri: uri
            });
        }, 50);

        // Watchdog: detect two failure modes —
        //   1. AVPlay never reaches PLAYING within 20 s (stuck in IDLE/READY)
        //   2. AVPlay reports PLAYING but currentTime stays at 0 for 10 s
        //      AND we're not buffering — i.e. a real codec stall, not a
        //      slow source still filling its buffer (common on the SMB
        //      proxy path for small or oddly-laid-out files).
        clearInterval(openWatchdog);
        var watchdogStart = Date.now();
        openWatchdog = setInterval(function () {
            var elapsed = Date.now() - watchdogStart;
            var state   = Player.state();
            var time    = Player.currentTime();
            var buffering  = (typeof Player.isBuffering === 'function') ? Player.isBuffering() : false;
            var lastBuffer = (typeof Player.lastBufferingMs === 'function') ? Player.lastBufferingMs() : 0;
            var bufferingRecent = buffering || (lastBuffer && Date.now() - lastBuffer < 5000);

            if (elapsed > 20000 && state !== 'PLAYING' && state !== 'PAUSED' && !bufferingRecent) {
                clearInterval(openWatchdog);
                showError(I18n.t('player.stuck', state), 'codec');
                return;
            }
            if (elapsed > 10000 && state === 'PLAYING' && (!time || time === 0) && !bufferingRecent) {
                clearInterval(openWatchdog);
                showError(I18n.t('player.stalled'));
                return;
            }
            if (state === 'PLAYING' && time > 0) {
                // We're actually progressing — disarm.
                clearInterval(openWatchdog);
            }
        }, 1000);

        scheduleOSDHide();
    }

    /* ── Now playing: tags and cover art (issue #105) ────────────────
     * Read out of the head of the file itself — the USB File, or the share
     * file straight off the smbproxy even when the transcode server is the
     * one playing it (its HLS carries no tags).  A stream URL with no music
     * extension is left alone: it may be a live radio that never ends. */
    var tagSeq = 0, artUrl = null;
    var TAG_FIRST_READ = 128 * 1024;

    function tagSourceFor(uri, opts) {
        if (opts.tagSrc) return opts.tagSrc;
        if (opts.file)   return opts.file;
        var s = String(uri || '');
        if (typeof SMB !== 'undefined' && SMB.isStreamUrl && SMB.isStreamUrl(s)) return s;
        if (typeof WebDAV !== 'undefined' && WebDAV.isStreamUrl && WebDAV.isStreamUrl(s)) return s;
        if (/^file:/i.test(s)) return s;
        if (/^https?:/i.test(s) && FileTypes.kind(s.split('?')[0].split('#')[0]) === 'audio') return s;
        return null;
    }

    /* The folder's cover picture (cover.jpg …) the list put on this file,
     * if it is the one playing; shown when the file carries no art itself. */
    function folderArtFor(uri) {
        var cur = state.playlist[state.playlistIndex];
        return cur && cur.uri === uri && cur.art ? cur.art : null;
    }

    function showAudioTags(uri, opts) {
        var seq = ++tagSeq;
        setCoverArt(null);
        document.getElementById('audio-sub').textContent = '';
        var folderArt = uri ? folderArtFor(uri) : null;
        var src = uri ? tagSourceFor(uri, opts || {}) : null;
        if (!src || typeof AudioTags === 'undefined') {
            if (folderArt) setCoverArt({ url: folderArt });
            return;
        }
        var want = TAG_FIRST_READ;
        (function read(round) {
            Browser.readHead(src, want, function (err, bytes, total) {
                if (seq !== tagSeq) return;   // another file started meanwhile
                if (err) {
                    if (typeof Debug !== 'undefined') Debug.player('tags: read failed: ' + (err.message || err));
                    if (folderArt) setCoverArt({ url: folderArt });
                    return;
                }
                var t = AudioTags.parse(bytes);
                // Cover art bigger than the first read: go again for the rest.
                if (t.need && t.need > bytes.length && round < 3 &&
                    !(total && bytes.length >= total) && bytes.length >= want) {
                    want = t.need;
                    read(round + 1);
                    return;
                }
                if (!t.picture && folderArt) t.picture = { url: folderArt };
                applyAudioTags(t);
            });
        })(0);
    }

    function applyAudioTags(t) {
        var artist = t.artist || t.albumArtist || '';
        if (typeof Debug !== 'undefined')
            Debug.player('tags: ' + JSON.stringify({ title: t.title, artist: artist, album: t.album,
                                                     art: t.picture ? (t.picture.url || t.picture.bytes.length) : 0 }));
        if (t.title) {
            document.getElementById('audio-title').textContent = t.title;
            document.getElementById('osd-title').textContent = (artist ? artist + ' — ' : '') + t.title;
        }
        document.getElementById('audio-sub').textContent =
            [artist, t.album].filter(Boolean).join('  ·  ');
        if (t.picture) setCoverArt(t.picture);
    }

    /* pic: { bytes, mime } out of the file's tags, made into a blob: URL
     * that is released again with the next file — or { url } of the
     * folder's cover picture. */
    function setCoverArt(pic) {
        var img = document.getElementById('audio-art');
        var note = document.getElementById('audio-note');
        if (artUrl) { try { URL.revokeObjectURL(artUrl); } catch (e) {} artUrl = null; }
        img.onerror = null;
        img.removeAttribute('src');
        img.classList.add('hidden');
        note.classList.remove('hidden');
        if (!pic) return;
        var src = pic.url;
        if (!src) {
            try {
                src = artUrl = URL.createObjectURL(new Blob([pic.bytes], { type: pic.mime }));
            } catch (e) { return; }
        }
        // A picture the TV can't decode leaves the note up.
        img.onload  = function () { img.classList.remove('hidden'); note.classList.add('hidden'); };
        img.onerror = function () { setCoverArt(null); };
        img.src = src;
    }

    /* ── Playlist navigation (auto-play + next/prev) ──────────────── */
    /* Fisher-Yates on a copy.  When shuffle is on we still put the user's
     * clicked item at index 0 so playback starts with what they picked and
     * only *subsequent* items are randomized — matches how music apps
     * behave when you tap a specific track with shuffle enabled. */
    function shufflePlaylist(list, keepFirstIdx) {
        var out = list.slice();
        for (var i = out.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        if (keepFirstIdx >= 0 && keepFirstIdx < list.length) {
            var pinned = list[keepFirstIdx];
            var cur = out.indexOf(pinned);
            if (cur > 0) { out[cur] = out[0]; out[0] = pinned; }
        }
        return out;
    }
    function playFromList(origin, playlist, idx, dir, back) {
        state.origin        = origin;
        state.originDir     = dir;
        state.originBack    = back || null;
        if (Settings.get('shuffle') && playlist && playlist.length > 1) {
            state.playlist      = shufflePlaylist(playlist, idx);
            state.playlistIndex = 0;
        } else {
            state.playlist      = playlist || [];
            state.playlistIndex = idx;
        }
        var item = state.playlist[state.playlistIndex];
        if (!item) return;
        Library.begin(state.playlist, state.playlistIndex);
        playUri(item.uri, item.title, { subtitles: item.subtitles || [], file: item.file || null, tagSrc: item.tagSrc || null });
    }
    /* The next (+1) or previous (−1) item, wrapping only under repeat-all. */
    function stepIndex(dir) {
        var n = state.playlist.length, i = state.playlistIndex;
        if (i < 0 || !n) return -1;
        var wrap = Settings.get('repeatMode') === 'all';
        for (var k = 0; k < n; k++) {
            i += dir;
            if (i < 0 || i >= n) {
                if (!wrap) return -1;
                i = (i + n) % n;
            }
            if (i === state.playlistIndex) return -1;   // all the way round
            return i;
        }
        return -1;
    }
    function playNext(isAuto) {
        var ni = stepIndex(+1);
        if (ni < 0) return false;
        var item = state.playlist[ni];
        state.playlistIndex = ni;
        if (isAuto) UI.toast(I18n.t('player.upNext', item.title));
        playUri(item.uri, item.title, { subtitles: item.subtitles || [], file: item.file || null, tagSrc: item.tagSrc || null,
                                        });
        return true;
    }
    /* OSD Prev / MediaTrackPrevious: restart the current file when we're
     * past the first few seconds, otherwise go to the previous item.  A
     * second press right after a restart therefore lands on the previous
     * item, exactly like a music player. */
    function handlePrev() {
        if (lastProgress.time > RESTART_THRESHOLD_MS) {
            if (scrub.active) cancelScrub(false);
            Player.seekTo(0);
            updateProgress(0, lastProgress.duration);
            flashOSD();
            UI.toast(I18n.t('player.restarted'));
            return;
        }
        if (!playPrev()) UI.toast(I18n.t('player.noPrev'));
    }
    function playPrev() {
        var pi = stepIndex(-1);
        if (pi < 0) return false;
        var item = state.playlist[pi];
        state.playlistIndex = pi;
        playUri(item.uri, item.title, { subtitles: item.subtitles || [], file: item.file || null, tagSrc: item.tagSrc || null,
                                        });
        return true;
    }
    /* Dim the prev/next OSD buttons when there's nothing on that side.
     * Prev stays lit once the file is far enough in to restart. */
    function updateNextPrevButtons() {
        var prev = document.getElementById('btn-prev');
        var next = document.getElementById('btn-next');
        var wraps = Settings.get('repeatMode') === 'all' && state.playlist.length > 1;
        if (prev) prev.classList.toggle('disabled',
            !wraps && state.playlistIndex <= 0 && lastProgress.time <= RESTART_THRESHOLD_MS);
        if (next) next.classList.toggle('disabled',
            state.playlistIndex < 0 || (!wraps && state.playlistIndex + 1 >= state.playlist.length));
        renderUpNext();
    }

    /* Up Next: the queue card under the transport controls. Shows the
     * whole queue around what's playing — previous files above, the
     * current one marked, the rest below — with OK jumping straight to a
     * row and OK on the current one restarting it. Thumbnails come from
     * channel logos and music folder art; everything else gets its file
     * icon. Progress is the saved resume position (live for the row
     * that's playing, full once watched). Hidden when there is only one
     * file. Lives inside #osd-bottom so it shows, hides and leaves
     * D-pad focus together with the controls. */
    var UP_NEXT_MAX = 8;
    function queueProgress(item) {
        if (item.uri === state.playingUri && lastProgress.duration) {
            return Math.max(0, Math.min(100, lastProgress.time / lastProgress.duration * 100));
        }
        var r = getResumeMap()[item.uri];
        if (r && r.dur) return Math.max(0, Math.min(100, r.pos / r.dur * 100));
        if (isWatched(item.uri)) return 100;
        return 0;
    }
    function queueThumb(item) {
        var wrap = document.createElement('span');
        wrap.className = 'up-next-thumb';
        // The watch progress bar overlays the picture's lower edge.
        var bar = document.createElement('span');
        bar.className = 'up-next-progress';
        var fill = document.createElement('span');
        fill.className = 'up-next-fill';
        fill.style.width = queueProgress(item).toFixed(1) + '%';
        bar.appendChild(fill);
        var glyph = document.createElement('span');
        glyph.className = 'up-next-glyph';
        var kind = 'other';
        try {
            kind = FileTypes.kind(item.title || '') ||
                   FileTypes.kind(String(item.uri).split('?')[0]) || 'other';
        } catch (e) {}
        glyph.innerHTML = FileTypes.icon(kind);
        if (item.art) {
            var img = document.createElement('img');
            img.src = item.art; img.alt = '';
            // A dead server thumbnail must not leave a broken-image box:
            // fall back to the file icon, as if there were no art.
            img.onerror = function () {
                if (img.parentNode) img.parentNode.removeChild(img);
                if (!glyph.parentNode) wrap.appendChild(glyph);
            };
            wrap.appendChild(img);
        } else {
            wrap.appendChild(glyph);
        }
        wrap.appendChild(bar);
        return wrap;
    }
    function renderUpNext() {
        var box = document.getElementById('up-next');
        var ul = document.getElementById('up-next-list');
        if (!box || !ul) return;
        ul.innerHTML = '';
        // Full queue on screen; single files hide the strip.
        var rows = [];
        for (var ri = 0; ri < state.playlist.length; ri++) {
            rows.push(ri);
        }
        var currentRow = rows.indexOf(state.playlistIndex);
        if (state.playlistIndex < 0 || rows.length <= 1) {
            box.classList.add('hidden');
            document.body.classList.remove('has-queue');
            document.body.classList.remove('up-next-open');
            return;
        }
        var mid = currentRow >= 0 ? currentRow : 0;
        var start = Math.max(0, Math.min(mid - 3, rows.length - UP_NEXT_MAX));
        var end = Math.min(rows.length, start + UP_NEXT_MAX);
        for (var r = start; r < end; r++) {
            (function (at) {
                var ci = state.playlist[at];
                var li = document.createElement('li');
                li.className = 'up-next-card';
                var btn = document.createElement('button');
                btn.dataset.action = 'play-queue-index';
                btn.dataset.index = String(at);
                btn.title = ci.title || ci.uri;
                if (at === state.playlistIndex) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-current', 'true');
                }
                btn.appendChild(queueThumb(ci));
                var name = document.createElement('span');
                name.className = 'up-next-name';
                name.textContent = ci.title || ci.uri;
                btn.appendChild(name);
                li.appendChild(btn);
                ul.appendChild(li);
            })(rows[r]);
        }
        box.classList.remove('hidden');
        document.body.classList.add('has-queue');
        if (state.view === 'player') UI.refreshFocusables();
    }
    function playQueueIndex(at) {
        at = parseInt(at, 10);
        if (isNaN(at) || at < 0 || at >= state.playlist.length) return false;
        if (at === state.playlistIndex) {
            // The row that's playing restarts, like OSD Prev past the first
            // seconds — reopening the same file would only resume it.
            if (scrub.active) cancelScrub(false);
            Player.seekTo(0);
            updateProgress(0, lastProgress.duration);
            flashOSD();
            UI.toast(I18n.t('player.restarted'));
            return true;
        }
        var item = state.playlist[at];
        state.playlistIndex = at;
        playUri(item.uri, item.title, { subtitles: item.subtitles || [], file: item.file || null, tagSrc: item.tagSrc || null,
                                        });
        return true;
    }

    /* Leave the player and return to the menu playback was launched from,
     * rather than always jumping back to the home screen. */
    function exitPlayer() {
        stopPlayback();
        returnToOrigin();
    }

    /* Stop for good: watched/resume bookkeeping and decoder release. */
    function stopPlayback() {
        playbackGeneration++;
        standbySnapshot = null;
        pendingResume = null;
        clearInterval(openWatchdog);
        clearTimeout(osdHideTimer);
        playerPopupReturn = null;
        closeMore(false);
        // Watched ≥ 90 % counts as seen even if the user stops before the end
        // (markWatched also drops the resume position); anything short of
        // that keeps its position so the file can pick up where it left off.
        if (lastProgress.duration && lastProgress.time / lastProgress.duration >= 0.95)
            markWatched(state.playingUri);
        else if (lastProgress.time > 0)   // time===0 → playback never started;
            saveResumePos(state.playingUri, lastProgress.time, lastProgress.duration);

        resetScrub();
        Player.stop();
        hideError();
        document.getElementById('osd-top').classList.add('hidden');
        document.getElementById('osd-bottom').classList.add('hidden');
        closeTrackMenu();
    }

    /* Back to the list playback was launched from, rather than always
     * jumping home. */
    function returnToOrigin() {
        if (state.originBack) {
            if (typeof Debug !== 'undefined') Debug.view('origin (return)');
            state.view = 'browse';
            state.originBack({ uri: state.playingUri, title: state.playingTitle });
        } else if (state.origin === 'browse' && state.originDir) {
            if (typeof Debug !== 'undefined') Debug.view('browse (return)');
            UI.showView('view-browse'); state.view = 'browse'; state.browseAtRoot = false;
            listInto(state.originDir, state.playingUri);
        } else if (state.origin === 'playlist' && state.playlistView) {
            if (typeof Debug !== 'undefined') Debug.view('playlist (return)');
            renderPlaylist(state.playingUri);
        } else {
            backToHome();
        }
    }

    function backToHome() {
        if (typeof Debug !== 'undefined') Debug.view('home');
        releaseBrowsers();
        resetScrub();
        Player.stop();
        state.view = 'home';
        state.listBack = null;
        state.playlistView = null;
        UI.showView('view-home');
        refreshHome();
        hideError();
        document.getElementById('osd-top').classList.add('hidden');
        document.getElementById('osd-bottom').classList.add('hidden');
        closeTrackMenu();
    }

    /* Cleanly quit the app from the home view (issue #57).  Tizen exposes
     * this on the current-application object; window.close() is a fallback
     * for the emulator / desktop-preview environment where the tizen
     * namespace isn't present.  Player is stopped first so AVPlay isn't
     * left holding a decoder handle if the user quit mid-playback via
     * exitPlayer → home → BACK. */
    function exitApp() {
        if (typeof Debug !== 'undefined') Debug.action('exit-app');
        try { Player.stop(); } catch (e) {}
        try {
            if (typeof tizen !== 'undefined' && tizen.application) {
                tizen.application.getCurrentApplication().exit();
                return;
            }
        } catch (e) {
            if (typeof Debug !== 'undefined') Debug.warn('tizen.application.exit failed: ' + (e.message || e));
        }
        try { window.close(); } catch (e) {}
    }

    /* ── OSD show/hide ────────────────────────────────────────────── */
    var osdHideTimer = null;
    var playerPopupReturn = null;
    function fmtSyncDelay(value) {
        return (value > 0 ? '+' : '') + (value / 1000).toFixed(1) + ' s';
    }
    function updateSubtitleSync() {
        document.getElementById('subtitle-sync-value').textContent = fmtSyncDelay(Player.getSubtitleDelay());
    }
    function adjustSubtitleSync(delta) {
        if (!Player.setSubtitleDelay(delta === null ? 0 : Player.getSubtitleDelay() + delta)) UI.toast(I18n.t('sync.unsupported'));
        else rememberPlaybackChoice({ delay: Player.getSubtitleDelay() });
        updateSubtitleSync();
        updateTrackSettingValues();
    }
    function returnPlayerPopup() {
        var action = playerPopupReturn;
        playerPopupReturn = null;
        if (action) {
            openMore();
            UI.focusOn(document.querySelector('#player-more [data-action="' + action + '"]'));
        } else {
            UI.refreshFocusables(); UI.focusOn(document.getElementById('btn-more'));
            scheduleOSDHide();
        }
    }
    function focusTimeline() {
        UI.refreshFocusables();
        UI.focusOn(document.getElementById('player-timeline'));
    }
    /* Is the cursor in the queue strip?  The Up/Down handlers need it to put
     * the transport row between the queue and the timeline. */
    function inUpNext() {
        var box = document.getElementById('up-next');
        var el = document.querySelector('#view-player .focused') || document.activeElement;
        return !!(box && el && box.contains(el));
    }
    function closeMore(restore) {
        if (cardLevel && cardLevel.owner === 'player-more') closeCardLevel(false);
        document.getElementById('player-more').classList.add('hidden');
        document.getElementById('btn-more').setAttribute('aria-expanded', 'false');
        if (restore) { playerPopupReturn = null; returnPlayerPopup(); }
    }
    /* ── In-card levels ─────────────────────────────────────────────────
     * In playback an option list, and the sync control, open as the next
     * level of the card they came from — replacing its rows — rather than
     * as a second floating modal. Back returns to the card's own rows. */
    var LEVEL_IDS = {
        'player-more': { level: 'more-level', title: 'more-level-title', options: 'more-level-options' },
        'track-menu':  { level: 'track-level', title: 'track-level-title', options: 'track-level-options' }
    };
    var cardLevel = null;   // { owner, returnEl }

    function setCardLevel(ownerId, open) {
        var ids = LEVEL_IDS[ownerId];
        var owner = document.getElementById(ownerId);
        for (var i = 0; i < owner.children.length; i++) {
            var el = owner.children[i];
            if (el.id === ids.level) continue;
            el.classList.toggle('hidden', open);
        }
        document.getElementById(ids.level).classList.toggle('hidden', !open);
    }
    function closeCardLevel(restore) {
        if (!cardLevel) return false;
        var lv = cardLevel;
        cardLevel = null;
        setCardLevel(lv.owner, false);
        document.getElementById('track-level-sync').classList.add('hidden');
        UI.refreshFocusables();
        if (restore && lv.returnEl) UI.focusOn(lv.returnEl);
        scheduleOSDHide();
        return true;
    }
    function openCardLevel(ownerId, title, options, currentValue, onPick, returnEl) {
        var ids = LEVEL_IDS[ownerId];
        var ul = document.getElementById(ids.options);
        document.getElementById(ids.title).textContent = title;
        ul.innerHTML = '';
        options.forEach(function (opt) {
            var li = document.createElement('li');
            li.tabIndex = 0;
            li.textContent = opt.name;
            if (opt.code === currentValue) li.classList.add('active');
            li.addEventListener('click', function () {
                // Choosing updates the parent card's value and stays put, so
                // the alternatives are still there to compare against.
                if (onPick(opt.code) === false) return;
                Array.prototype.forEach.call(ul.children, function (row) {
                    row.classList.toggle('active', row === li);
                });
                UI.focusOn(li);
            });
            ul.appendChild(li);
        });
        document.getElementById('track-level-sync').classList.add('hidden');
        cardLevel = { owner: ownerId, returnEl: returnEl };
        clearTimeout(osdHideTimer);
        setCardLevel(ownerId, true);
        UI.refreshFocusables();
        var first = ul.querySelector('.active') || ul.firstElementChild;
        if (first) UI.focusOn(first);
    }
    /* The synchronization control is a level of the subtitles card too. */
    function openSyncLevel(returnEl) {
        var ids = LEVEL_IDS['track-menu'];
        document.getElementById(ids.title).textContent = I18n.t('sync.title');
        document.getElementById(ids.options).innerHTML = '';
        document.getElementById('track-level-sync').classList.remove('hidden');
        updateSubtitleSync();
        cardLevel = { owner: 'track-menu', returnEl: returnEl };
        clearTimeout(osdHideTimer);
        setCardLevel('track-menu', true);
        UI.refreshFocusables();
        UI.focusOn(document.getElementById('subtitle-sync-control'));
    }
    /* A playback option list is a level of the card it came from; Settings
     * keeps the floating picker it has always used. */
    function cardPicker(ownerId, returnAction, title, options, currentValue, onPick) {
        if (state.view !== 'player') return openPicker(title, options, currentValue, onPick);
        var row = document.querySelector('#' + ownerId + ' [data-action="' + returnAction + '"]');
        openCardLevel(ownerId, title, options, currentValue, onPick, row);
    }
    function refreshPlaybackOptions() {
        var menu = document.getElementById('player-more');
        menu.querySelector('[data-action="open-subtitles"]').classList.toggle('hidden', state.playingIsAudio);
        menu.querySelector('[data-action="open-aspect-picker"]').classList.toggle('hidden', state.playingIsAudio);
        menu.querySelector('[data-action="open-audio"]').classList.toggle('hidden', Player.getTracks().audio.length < 2);
        updateAutoplayRow();
    }
    function openMore() {
        clearTimeout(osdHideTimer);
        showOSD(true);
        refreshPlaybackOptions();
        document.getElementById('player-more').classList.remove('hidden');
        document.getElementById('btn-more').setAttribute('aria-expanded', 'true');
        UI.refreshFocusables();
        UI.focusOn(document.querySelector('#player-more button:not(.hidden)'));
    }
    function showOSD(visible) {
        // A page other than playback must not take OSD focus.
        if (visible && state.view !== 'player') return;
        var wasHidden = document.getElementById('osd-bottom').classList.contains('hidden');
        document.getElementById('osd-top').classList.toggle('hidden', !visible);
        document.getElementById('osd-bottom').classList.toggle('hidden', !visible);
        document.body.classList.toggle('player-osd-visible', visible);
        if (visible) {
            UI.refreshFocusables();
            // Revealing controls starts on the timeline. Down enters buttons.
            if (wasHidden) {
                focusTimeline();
            }
        } else {
            var focused = document.querySelector('#osd-bottom .focused');
            if (focused) { focused.classList.remove('focused'); focused.blur(); }
        }
    }
    function scheduleOSDHide() {
        clearTimeout(osdHideTimer);
        osdHideTimer = setTimeout(function () {
            if (!document.querySelector('#view-player .track-menu:not(.hidden), #picker:not(.hidden)')) showOSD(false);
        }, 5000);
    }
    function flashOSD() { showOSD(true); scheduleOSDHide(); }

    /* Timeline/FF/RW preview a seek until input pauses or OK commits it.
     * Back cancels the preview. Immediate jumps and preview scrubs share
     * duration-aware steps and acceleration, with a fixed live fallback. */
    var scrub = { active: false, waiting: false, pos: 0, dir: 0, steps: 0, timer: null, commitAt: 0 };
    var SCRUB_COMMIT_MS = 600;   // quiet time before the preview position is seeked
    var jump = { dir: 0, steps: 0, at: 0 }; // immediate seeks share the same repeat window
    // AVPlay's seekTo is asynchronous: getCurrentTime() keeps reporting the
    // PRE-seek playhead until the pipeline flushes — seconds, on SMB/network
    // streams.  So after committing we keep painting the preview position
    // (scrub.waiting) until a progress sample lands near the target, with a
    // hard timeout in case the seek silently fails.
    var SCRUB_SETTLE_TOL_MS = 4000;
    var SCRUB_SETTLE_MAX_MS = 10000;

    /* One policy for every seek input: 1% rounded to seconds, 1–15 s.
     * Repeated scrubbing doubles at 3, 6, 12… presses, bounded by 5%
     * of the file (at most 120 s). Unknown durations keep a 15 s step. */
    function scrubStepSize(n, duration) {
        if (!(duration > 0) || !isFinite(duration)) return 15000;
        var step = Math.max(1000, Math.min(15000, Math.round(duration / 100000) * 1000));
        var cap = Math.max(step, Math.min(120000, Math.round(duration / 20000) * 1000));
        var threshold = 3;
        while (n >= threshold && step < cap) { step = Math.min(cap, step * 2); threshold *= 2; }
        return step;
    }
    function seekJump(dir) {
        var now = Date.now();
        if (dir !== jump.dir || now - jump.at > SCRUB_COMMIT_MS) jump.steps = 0;
        jump.dir = dir; jump.at = now; jump.steps++;
        if (scrub.active) cancelScrub(false);
        Player.seekRel(dir * scrubStepSize(jump.steps, Player.duration() || lastProgress.duration));
    }

    function scrubStep(dir) {
        var dur = Player.duration() || lastProgress.duration;
        if (!(dur > 0) || !isFinite(dur)) {   // duration unknown → seek directly
            seekJump(dir);
            flashOSD();
            return;
        }
        if (!scrub.active) {
            scrub.active = true;
            // If a committed seek is still in flight, currentTime() is stale
            // (pre-seek) — continue from the target we already committed to.
            if (!scrub.waiting)
                scrub.pos = Player.currentTime() || lastProgress.time;
            scrub.dir    = 0;
            scrub.steps  = 0;
        }
        if (dir !== scrub.dir) { scrub.dir = dir; scrub.steps = 0; }
        scrub.steps++;
        scrub.pos = Math.max(0, Math.min(dur - 1000,
                        scrub.pos + dir * scrubStepSize(scrub.steps, dur)));
        updateProgress(scrub.pos, dur);
        updateScrubUI(true, scrub.pos);
        // Pin the OSD while scrubbing; the hide timer restarts on commit.
        showOSD(true);
        clearTimeout(osdHideTimer);
        clearTimeout(scrub.timer);
        scrub.timer = setTimeout(commitScrub, SCRUB_COMMIT_MS);
    }

    function commitScrub() {
        if (!scrub.active) return;
        clearTimeout(scrub.timer);
        scrub.active = false;
        scrub.steps  = 0;
        scrubSeekTo(scrub.pos);
        updateScrubUI(false);
        flashOSD();
    }

    /* Seek and keep painting `ms` on the bar until the seek completes.
     * Shared by scrub commits and 0-9 jumps.  Completion comes from
     * Player.seekTo's callback — AVPlay lands on a keyframe, possibly tens
     * of seconds from the target, so distance-to-target can't detect it
     * (SCRUB_SETTLE_* in onprogress remain as backstops in case a firmware
     * never fires the callback).  The seq token keeps a late callback from
     * an overridden seek from unfreezing a newer one still in flight. */
    function scrubSeekTo(ms) {
        scrub.pos      = ms;
        scrub.waiting  = true;
        scrub.commitAt = Date.now();
        scrub.seq      = (scrub.seq || 0) + 1;
        var seq = scrub.seq;
        Player.seekTo(ms, function () {
            if (seq !== scrub.seq || !scrub.waiting) return;
            scrub.waiting = false;
            if (!scrub.active)
                updateProgress(Player.currentTime(), Player.duration() || lastProgress.duration);
        });
        updateProgress(ms, Player.duration() || lastProgress.duration);
    }

    function cancelScrub(restoreBar) {
        clearTimeout(scrub.timer);
        scrub.active = false;
        scrub.steps  = 0;
        updateScrubUI(false);
        if (restoreBar) {
            // A still-settling earlier commit means the bar should show its
            // target, not the stale pre-seek playhead.
            if (scrub.waiting) updateProgress(scrub.pos, Player.duration() || lastProgress.duration);
            else               updateProgress(lastProgress.time, lastProgress.duration);
            flashOSD();
        }
    }

    /* Full reset — leaving the player or starting a new file.  Unlike
     * cancelScrub this also drops the settle-wait, which would otherwise
     * suppress the next file's progress updates. */
    function resetScrub() {
        cancelScrub(false);
        jump.dir = 0; jump.steps = 0; jump.at = 0;
        scrub.waiting  = false;
        scrub.commitAt = 0;
    }

    function updateScrubUI(on, posMs) {
        document.getElementById('progress-fill').classList.toggle('scrubbing', !!on);
        var delta = document.getElementById('time-scrub-delta');
        if (!delta) return;
        if (!on) { delta.classList.add('hidden'); return; }
        var d = posMs - lastProgress.time;
        delta.textContent = (Math.abs(d) < 1000 ? '' : d < 0 ? '−' : '+') + fmtTime(Math.abs(d));
        var dur = Player.duration() || lastProgress.duration || 0;
        delta.classList.remove('hidden');
        if (dur > 0) {
            // Keep the chip inside the track at both seek boundaries.
            var width = delta.parentNode.clientWidth, half = delta.offsetWidth / 2;
            delta.style.left = Math.min(width - half, Math.max(half, posMs / dur * width)) + 'px';
        }
    }

    function installMediaSessionHandlers() {
        if (!('mediaSession' in navigator)) return;
        function ifPlaying(fn) {
            return function () { if (state.view === 'player') { fn(); flashOSD(); } };
        }
        var pairs = [
            ['play',          ifPlaying(function () { Player.play(); })],
            ['pause',         ifPlaying(function () { Player.pause(); })],
            ['stop',          ifPlaying(function () { exitPlayer(); })],
            ['seekbackward',  ifPlaying(function () { seekJump(-1); })],
            ['seekforward',   ifPlaying(function () { seekJump(1); })],
            ['previoustrack', ifPlaying(function () { handlePrev(); })],
            ['nexttrack',     ifPlaying(function () { playNext(false); })]
        ];
        for (var i = 0; i < pairs.length; i++) {
            try { navigator.mediaSession.setActionHandler(pairs[i][0], pairs[i][1]); } catch (e) {}
        }
    }

    function showSpinner(msg) {
        var sp = document.getElementById('spinner');
        sp.querySelector('.spinner-text').textContent = msg || I18n.t('common.loading');
        sp.classList.remove('hidden');
    }
    function hideSpinner() { document.getElementById('spinner').classList.add('hidden'); }

    /* kind 'codec': the message is our own (and so translated), and the
     * codec hint below can't be matched out of its text. */
    function showError(msg, kind) {
        // Hide all sibling overlays so the error stays the only focusable thing
        document.getElementById('osd-top').classList.add('hidden');
        document.getElementById('osd-bottom').classList.add('hidden');
        document.getElementById('track-menu').classList.add('hidden');
        hideSpinner();
        clearInterval(openWatchdog);

        // Hint for opaque codec-not-supported errors
        var hint = '';
        var uri = state.playingUri || '';
        // AVPlay-failed-on-MKV is signalled with the "MKV_CODEC:" prefix from
        // player.js.  The old "MKV not supported" HTML5 message is kept in the
        // match for safety, but AVPlay DOES support the MKV container on these
        // TVs — a failure is a codec inside it, most often DTS/TrueHD audio.
        var isMkv = /^MKV_CODEC:/.test(msg) || /\.mkv($|\?)/i.test(uri) || /MKV not supported/i.test(msg);
        // Legacy containers that AVPlay opens but rejects fast on codec grounds
        // — DivX/Xvid AVI, WMV (VC-1/WMV9), FLV, old MPEG.  We see this as a
        // sub-second "Unknown error" from AVPlay after a clean network/SMB
        // transport.  No path forward in-app: TV's hardware decoder doesn't
        // know these codecs.
        var isLegacyContainer = /\.(avi|wmv|flv|rm|rmvb|mpe?g|vob|divx|asf)($|\?)/i.test(uri);

        if (isLegacyContainer) {
            var ext = (uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i) || [,''])[1].toLowerCase();
            msg = I18n.t('err.legacyTitle', ext.toUpperCase());
            hint = I18n.t('err.legacyHint', ext.toUpperCase(),
                          'ffmpeg -i input.' + ext + ' -c:v libx264 -preset fast -c:a aac -b:a 192k output.mp4');
        } else if (isMkv) {
            msg = I18n.t('err.mkvTitle');
            hint = I18n.t('err.mkvHint', 'ffmpeg -i input.mkv -c:v copy -c:a ac3 -b:a 640k output.mkv');
        } else if (kind === 'codec' || /unknown error|not supported|invalid|stuck loading|unsupported source/i.test(msg)) {
            hint = I18n.t('err.codecHint', 'ffmpeg -i input.ext -c copy output.mp4');
        } else if (/connection|network|timeout/i.test(msg)) {
            hint = I18n.t('err.networkHint');
        }

        document.getElementById('error-title').textContent = msg;
        document.getElementById('error-hint').textContent  = hint;
        document.getElementById('error-overlay').classList.remove('hidden');

        UI.refreshFocusables();
        var btn = document.querySelector('#error-overlay .btn');
        if (btn) UI.focusOn(btn);
    }
    function hideError() {
        document.getElementById('error-overlay').classList.add('hidden');
    }

    function updatePlayPauseButton(state) {
        var btn = document.getElementById('btn-playpause');
        btn.querySelector('img').src = 'assets/remix/' + (state === 'playing' ? 'pause-fill' : 'play-fill') + '.svg';
        btn.setAttribute('aria-label', state === 'playing' ? 'Pause' : 'Play');
    }

    function updateProgress(timeMs, durMs) {
        document.getElementById('time-current').textContent  = fmtTime(timeMs);
        document.getElementById('time-duration').textContent = fmtTime(durMs);
        var pct = (durMs && durMs > 0) ? Math.min(100, (timeMs / durMs) * 100) : 0;
        document.getElementById('progress-fill').style.width = pct.toFixed(1) + '%';
        document.getElementById('player-timeline').setAttribute('aria-valuenow', Math.round(pct));
        document.getElementById('player-timeline').setAttribute('aria-valuetext', fmtTime(timeMs) + ' / ' + fmtTime(durMs));
    }

    function fmtTime(ms) {
        if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '00:00';
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600); s -= h * 3600;
        var m = Math.floor(s / 60);   s -= m * 60;
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return (h ? p(h) + ':' : '') + p(m) + ':' + p(s);
    }

    /* ── Settings view ────────────────────────────────────────────── */
    function openSettings() {
        releaseBrowsers();
        UI.showView('view-settings'); state.view = 'settings';
        refreshSettingsValues();
        renderPairingBlock();
        renderTvInfo();
    }
    function refreshSettingsValues() {
        document.getElementById('setting-ui-lang-value').textContent       = uiLanguageName(Settings.get('uiLanguage'));
        paintCastRow();
        paintDebugRow();
        // Mirror repeat + aspect state to the OSD buttons if visible
        updateRepeatButton();
        updateAspectButton();
    }
    function renderTvInfo() {
        var box  = document.getElementById('tvinfo');
        var pInfo = TvInfo.getProductInfo();
        var codecs = TvInfo.getCodecs();
        var ua = TvInfo.getUA();

        // Kick off the async build query; we render placeholder rows first.
        TvInfo.getBuild(function (b) {
            var rows = [];
            function row(k, v) { rows.push('<div class="row"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v || '—') + '</div></div>'); }
            row(I18n.t('tv.appVersion'),   TvInfo.getAppVersion() || '—');
            row(I18n.t('tv.model'),        pInfo.realModel || b.model || '—');
            row(I18n.t('tv.marketingName'), pInfo.tvName    || b.buildDescription || '—');
            row(I18n.t('tv.firmware'),     pInfo.firmwareVersion || b.buildVersion || '—');
            row(I18n.t('tv.buildRelease'), b.buildReleaseDate || '—');
            row(I18n.t('tv.manufacturer'), b.manufacturer || '—');
            row('User-Agent',              ua);
            function codec(name, cls, label) {
                return '<div class="codec"><span class="name">' + escapeHtml(name) + '</span>' +
                       '<span class="status ' + cls + '"><img class="remix-icon" src="assets/remix/' +
                       (cls === 'ok' ? 'check-line' : cls === 'maybe' ? 'question-line' : 'close-line') + '.svg" alt=""> ' + escapeHtml(label) + '</span></div>';
            }

            var codecHtml = '<section class="info-panel" tabindex="0"><h3>' + escapeHtml(I18n.t('tv.html5Codecs')) + '</h3><p class="muted">' + escapeHtml(I18n.t('tv.probeNote')) + '</p><div class="codecs">';
            Object.keys(codecs).forEach(function (name) {
                var status = codecs[name];
                var cls = status === 'probably' ? 'ok' : status === 'maybe' ? 'maybe' : 'no';
                var label = status === 'probably' ? I18n.t('tv.supported') :
                            status === 'maybe'    ? I18n.t('tv.possibly') :
                                                    I18n.t('tv.notSupported');
                codecHtml += codec(name, cls, label);
            });
            codecHtml += '</div></section>';

            codecHtml += '<section class="info-panel" tabindex="0"><h3>' + escapeHtml(I18n.t('tv.streaming')) + '</h3><p class="muted">' + escapeHtml(I18n.t('tv.protocolNote')) + '</p><div class="codecs">';
            codecHtml += codec('HTTP / HLS / DASH', 'maybe', I18n.t('tv.deviceDependent'));
            codecHtml += codec('RTSP / RTMP', 'maybe', I18n.t('tv.deviceDependent'));
            codecHtml += codec(I18n.t('tv.usbFiles'), 'maybe', I18n.t('tv.viaHtml5'));
            codecHtml += codec(I18n.t('tv.mkv'), 'maybe', I18n.t('tv.viaAvplay'));
            codecHtml += codec(I18n.t('tv.dtsAudio'), 'maybe', I18n.t('tv.deviceDependent'));
            codecHtml += '</div></section>';

            box.innerHTML = '<section class="info-panel" tabindex="0"><h3>' + escapeHtml(I18n.t('settings.tvInfo')) + '</h3>' + rows.join('') + '</section>' + codecHtml;
            UI.refreshFocusables();
        });
    }

    /* ── Picker (generic option list, used for settings choices) ──── */
    var pickerSetting = null;        // which setting we're editing
    function openPicker(title, options, currentValue, onPick) {
        // Playback preferences apply immediately. Command/resume/settings pickers retain their existing one-shot behavior.
        var keepOpen = state.view === 'player' && !!playerPopupReturn;
        document.getElementById('picker-title').textContent = title;
        var ul = document.getElementById('picker-options');
        ul.innerHTML = '';
        options.forEach(function (opt) {
            var li = document.createElement('li');
            li.tabIndex = 0;
            li.textContent = opt.name;
            if (opt.code === currentValue) li.classList.add('active');
            li.addEventListener('click', function () {
                var applied = onPick(opt.code);
                if (!keepOpen) { closePicker(); return; }
                if (applied === false) return;
                Array.prototype.forEach.call(ul.children, function (row) { row.classList.toggle('active', row === li); });
                UI.focusOn(li);
            });
            ul.appendChild(li);
        });
        document.getElementById('picker').classList.remove('hidden');
        UI.refreshFocusables();
        var first = document.querySelector('#picker .active') ||
                    document.querySelector('#picker li, #picker button');
        if (first) UI.focusOn(first);
    }
    function closePicker() {
        document.getElementById('picker').classList.add('hidden');
        pickerSetting = null;
        UI.refreshFocusables();
        if (state.view === 'player') returnPlayerPopup();
    }
    /* The app's own language.  Every language is listed by its own name, so
     * someone stuck in a language they can't read still finds theirs. */
    function uiLanguageName(code) {
        return code ? I18n.languageName(I18n.match(code))
                    : I18n.t('uiLang.followTv', I18n.languageName(I18n.current()));
    }
    function openUiLangPicker() {
        pickerSetting = 'uiLanguage';
        var opts = [{ code: '', name: uiLanguageName('') }].concat(I18n.languages());
        openPicker(I18n.t('settings.uiLang'), opts, Settings.get('uiLanguage'), function (val) {
            if (val === Settings.get('uiLanguage')) return;
            I18n.setLanguage(val);
        });
    }
    function applyRepeatOption(val) {
        Settings.set('repeatMode', val);
        refreshSettingsValues();
        updateNextPrevButtons();
        scheduleOSDHide();
    }
    /* Subtitle appearance now lives in the playback Subtitles menu; the
     * rows below share these option tables for both picking and stepping. */
    var SUBTITLE_SETTINGS = [
        { key: 'subtitleSize', labelKey: 'settings.subSize',
          options: function () { return SubtitleStyle.forSize(); },
          name: function (v) { return SubtitleStyle.nameForSize(v); } },
        { key: 'subtitleFont', labelKey: 'settings.subFont',
          options: function () { return SubtitleStyle.forFont(); },
          name: function (v) { return SubtitleStyle.nameForFont(v); } },
        { key: 'subtitlePosition', labelKey: 'settings.subPosition',
          options: function () { return SubtitleStyle.forPosition(); },
          name: function (v) { return SubtitleStyle.nameForPosition(v); } },
        { key: 'subtitleBg', labelKey: 'settings.subBg',
          options: function () { return SubtitleStyle.forBg(); },
          name: function (v) { return SubtitleStyle.nameForBg(v); } }
    ];
    function subtitleSettingByKey(key) {
        for (var i = 0; i < SUBTITLE_SETTINGS.length; i++)
            if (SUBTITLE_SETTINGS[i].key === key) return SUBTITLE_SETTINGS[i];
        return null;
    }
    function applySubtitleSetting(key, val) {
        Settings.set(key, val);
        SubtitleStyle.apply();
        refreshSettingsValues();
        updateTrackSettingValues();
        scheduleOSDHide();
    }
    function stepSubtitleSetting(key, dir) {
        var entry = subtitleSettingByKey(key);
        if (!entry) return false;
        var codes = entry.options().map(function (o) { return o.code; });
        applySubtitleSetting(key, stepList(Settings.get(key), codes, dir));
        return true;
    }
    /* Subtitle-appearance pickers — share the generic option list, then
     * re-apply the live style so changes show immediately on the overlay. */
    function openSubtitlePicker(settingKey, title, options) {
        var cur = Settings.get(settingKey);
        // Opened from the Subtitles card, so its list is the next level there.
        openCardLevel('track-menu', title, options, cur, function (val) {
            applySubtitleSetting(settingKey, val);
        }, document.querySelector('#track-menu [data-step="' + settingKey + '"]'));
    }
    /* Playback-speed picker (issue #28 part 3).  Six rates from 0.5× to 2×,
     * applied via Player.setSpeed() which targets AVPlay's setSpeed on the
     * TV and HTMLVideoElement.playbackRate as the fallback.  Speed is
     * deliberately session-only — every Player.open() resets to 1× so a
     * binge-watch session doesn't accidentally play episode 2 at 1.5×
     * because episode 1 was. */
    function applySpeedOption(val) {
        var changed = String(Player.getSpeed ? Player.getSpeed() : 1) !== String(val);
        if (!Player.setSpeed(parseFloat(val))) {
            UI.toast(I18n.t('speed.unsupported'));
            return false;
        }
        updateSpeedButton();
        rememberPlaybackChoice({ speed: String(val) });
        if (!changed) return true;
        // Only the mute warning toasts: audio going silent is not visible.
        if (Player.isSpeedMuted && Player.isSpeedMuted()) UI.toast(I18n.t('speed.mutedToast'));
        scheduleOSDHide();
        return true;
    }
    function openSpeedPicker() {
        var cur = String(Player.getSpeed ? Player.getSpeed() : 1);
        /* On the AVPlay backend, non-1× rates silence audio (Samsung
         * hardware-decoder limitation — issue #49).  Note that inline in
         * the option labels so the user isn't blindsided by a mute the
         * moment they pick 1.5×. */
        var avplay = Player.getBackend && Player.getBackend() === 'avplay';
        var muteNote = avplay ? '  ' + I18n.t('speed.mutedNote') : '';
        cardPicker('player-more', 'open-speed-picker', I18n.t('player.speed'), [
            { code: '0.25', name: '0.25×' + muteNote },
            { code: '0.5',  name: '0.5×' + muteNote },
            { code: '0.75', name: '0.75×' + muteNote },
            { code: '1',    name: I18n.t('speed.normalOption') },
            { code: '1.25', name: '1.25×' + muteNote },
            { code: '1.5',  name: '1.5×' + muteNote },
            { code: '1.75', name: '1.75×' + muteNote },
            { code: '2',    name: '2×' + muteNote }
        ], cur, function (val) {
            return applySpeedOption(val);
        });
    }
    function updateSpeedButton() {
        var btn = document.getElementById('btn-speed');
        if (!btn) return;
        var s = Player.getSpeed ? Player.getSpeed() : 1;
        // Compact label: "1×" / "1.5×" — no trailing zeros so "1.5×" not "1.50×".
        var label = (s === Math.floor(s) ? s : (Math.round(s * 100) / 100)) + '×';
        // 🔇 postfix when audio is silenced by the speed change so the OSD
        // makes the trade-off visible at a glance (issue #49).
        if (Player.isSpeedMuted && Player.isSpeedMuted()) label += ' ' + I18n.t('speed.mutedNote');
        btn.textContent = label;
    }
    /* Video aspect (user request: "remove the black bars").  Unlike playback
     * speed this IS persisted — someone who wants a filled screen wants it
     * for every file, not just the one that's open.  Applying it mid-playback
     * is safe on both backends, so the OSD button and the settings row share
     * this one picker. */
    function applyAspectOption(val) {
        Settings.set('aspectMode', val);
        Player.applyAspect();
        updateAspectButton();
        refreshSettingsValues();
        rememberPlaybackChoice({ aspect: val });
        scheduleOSDHide();
    }
    function openAspectPicker() {
        var cur = Settings.get('aspectMode');
        cardPicker('player-more', 'open-aspect-picker', I18n.t('settings.aspect'),
            AspectRatio.forList().map(function (opt) {
                return { code: opt.code, name: AspectRatio.shortFor(opt.code) };
            }), cur, function (val) {
                applyAspectOption(val);
            });
    }

    function updateAspectButton() {
        var btn = document.getElementById('btn-aspect');
        if (!btn) return;
        var mode = Settings.get('aspectMode');
        btn.textContent = AspectRatio.shortFor(mode);
        // Highlight whenever the picture is NOT in the default fit mode, so
        // a cropped/stretched picture is never a mystery.
        btn.classList.toggle('aspect-on', AspectRatio.isKnown(mode) && mode !== 'fit');
    }
    /* Autoplay in the More menu: play the next file when one finishes.
     * OK opens its On/Off list as the card's next level, like speed and
     * aspect; Left/Right toggles directly. Repeat-all implies continuing
     * regardless. */
    function applyAutoplayOption(val) {
        var next = (val === 'on');
        if (next === !!Settings.get('autoPlay')) return true;
        Settings.set('autoPlay', next);
        updateAutoplayRow();
        scheduleOSDHide();
        return true;
    }
    function toggleAutoplay() {
        applyAutoplayOption(Settings.get('autoPlay') ? 'off' : 'on');
    }
    function openAutoplayOptions() {
        cardPicker('player-more', 'toggle-autoplay', I18n.t('player.autoplay'), [
            { code: 'on',  name: I18n.t('common.on') },
            { code: 'off', name: I18n.t('common.off') }
        ], Settings.get('autoPlay') ? 'on' : 'off', function (val) {
            return applyAutoplayOption(val);
        });
    }
    function updateAutoplayRow() {
        var el = document.getElementById('autoplay-value');
        if (el) el.textContent = I18n.t(Settings.get('autoPlay') ? 'common.on' : 'common.off');
    }
    /* ── Repeat toggle from the OSD ───────────────────────────────── */
    /* Off → all → one → off, like a music player's repeat button. */
    /* Repeat updates its visible icon and accessible value silently. */
    function toggleRepeat() {
        var cur = Settings.get('repeatMode');
        var next = cur === 'off' ? 'all' : cur === 'all' ? 'one' : 'off';
        applyRepeatOption(next);
        scheduleOSDHide();
    }
    function repeatName(code) {
        return I18n.t(code === 'one' ? 'repeat.one' : code === 'all' ? 'repeat.all' : 'common.off');
    }
    function updateRepeatButton() {
        var btn = document.getElementById('btn-repeat');
        if (!btn) return;
        var mode = Settings.get('repeatMode');
        var one = mode === 'one';
        var on = one || mode === 'all';
        // repeat-2 for all (or off), repeat-one for the single-file mode.
        btn.querySelector('img').src = 'assets/remix/' + (one ? 'repeat-one-fill' : 'repeat-2-fill') + '.svg';
        btn.classList.toggle('repeat-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', I18n.t('toast.repeat', repeatName(mode)));
    }

    /* ── Shuffle (issue #43) ──────────────────────────────────────────
     * Randomize playlist order for folder + recent playback.  Toggling
     * during playback re-shuffles the live playlist in place, keeping the
     * currently-playing item at index 0 so the current file isn't yanked
     * mid-play; turning it back off would ideally restore the alphabetical
     * order, but the app doesn't retain the pre-shuffle list — restoring
     * alphabetical requires re-entering the folder, which is a fair trade
     * for keeping the state minimal. */
    /* Shuffle updates the pressed state without a success toast. */
    function toggleShuffle() {
        var next = !Settings.get('shuffle');
        applyShuffle(next);
        document.getElementById('btn-shuffle').setAttribute('aria-label', I18n.t('toast.shuffle', I18n.t(next ? 'common.on' : 'common.off')));
        scheduleOSDHide();
    }
    function applyShuffle(on) {
        Settings.set('shuffle', !!on);
        updateShuffleButton();
        // If a playlist is live and shuffle just turned on, reshuffle
        // the remaining items around the currently-playing one.
        if (on && state.playlist.length > 1 && state.playlistIndex >= 0) {
            state.playlist = shufflePlaylist(state.playlist, state.playlistIndex);
            state.playlistIndex = 0;
            Library.begin(state.playlist, state.playlistIndex);
            updateNextPrevButtons();
        }
    }
    function updateShuffleButton() {
        var btn = document.getElementById('btn-shuffle');
        if (!btn) return;
        var on = !!Settings.get('shuffle');
        btn.classList.toggle('shuffle-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    /* ── More value rows: Left/Right steps the option directly, OK opens
     * its picker. The sync value row adjusts the subtitle delay the same
     * way instead of using Earlier/Later menu items. */
    var SPEED_STEPS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'];
    function stepList(current, list, dir) {
        // Steps stop at the ends rather than wrapping round.
        var i = list.indexOf(current);
        if (i < 0) return dir > 0 ? list[0] : list[list.length - 1];
        return list[Math.min(list.length - 1, Math.max(0, i + dir))];
    }
    function stepSpeed(dir) {
        return applySpeedOption(stepList(String(Player.getSpeed ? Player.getSpeed() : 1), SPEED_STEPS, dir));
    }
    function stepAspect(dir) {
        var codes = AspectRatio.forList().map(function (m) { return m.code; });
        applyAspectOption(stepList(Settings.get('aspectMode'), codes, dir));
        return true;
    }
    function stepOption(kind, dir) {
        if (kind === 'sync') { adjustSubtitleSync(dir * 500); scheduleOSDHide(); return true; }
        if (kind === 'speed') return stepSpeed(dir);
        if (kind === 'aspect') return stepAspect(dir);
        if (kind === 'autoplay') { toggleAutoplay(); return true; }
        if (subtitleSettingByKey(kind)) return stepSubtitleSetting(kind, dir);
        return false;
    }
    function stepFocusedOption(dir) {
        var el = document.querySelector('#view-player .focused');
        var row = el && el.closest ? el.closest('[data-step]') : null;
        if (!row) return false;
        return stepOption(row.getAttribute('data-step'), dir);
    }

    /* ── Track menu ───────────────────────────────────────────────── */
    /* "Audio" / "Subtitle (23)" — the count is what tells a user with a
     * 20-track rip that the list they're looking at is complete and simply
     * scrolls, rather than truncated. */
    function setTrackSectionTitle(id, label, count) {
        var h = document.getElementById(id);
        if (h) h.textContent = count > 1 ? (label + ' (' + count + ')') : label;
    }
    /* Re-rendering while a track is being read out of the container must not
     * throw the cursor back to the active row — the user may be part way
     * down a 40-item list, and the progress label updates every few
     * seconds. */
    function focusedTrackRow() {
        var setting = document.querySelector('#track-menu-body [data-step].focused');
        if (setting) return { step: setting.getAttribute('data-step') };
        var el = document.querySelector('#track-menu li.focused');
        var ul = el && el.parentNode;
        if (!ul || (ul.id !== 'audio-tracks' && ul.id !== 'subtitle-tracks')) return null;
        return { list: ul.id, index: [].indexOf.call(ul.children, el) };
    }
    function restoreTrackRowFocus(mark) {
        if (!mark) return false;
        if (mark.step) {
            var row = document.querySelector('#track-menu-body [data-step="' + mark.step + '"]');
            if (!row) return false;
            UI.focusOn(row);
            return true;
        }
        var ul = document.getElementById(mark.list);
        var li = ul && ul.children[mark.index];
        if (!li) return false;
        UI.focusOn(li);
        return true;
    }
    /* section narrows the entry point: the More menu offers Audio and
     * Subtitles separately, each landing in its own panel. Re-renders
     * (subtitle extraction progress) keep the panel that is already open. */
    var trackMenuSection = null;
    function trackSubsection(titleKey) {
        var box = document.createElement('div');
        box.className = 'track-subsection';
        if (titleKey) {
            var h = document.createElement('div');
            h.className = 'track-subsection-title';
            h.textContent = I18n.t(titleKey);
            box.appendChild(h);
        }
        return box;
    }
    /* A settings-style row inside a track panel: label left, live value
     * right, arrow-adjustable via data-step, opening its editor on OK. */
    function trackSettingRow(label, valFor, value, stepKind, onActivate) {
        var btn = document.createElement('button');
        btn.className = 'more-option';
        btn.setAttribute('data-step', stepKind);
        var lab = document.createElement('span');
        lab.className = 'more-label';
        lab.textContent = label;
        var val = document.createElement('span');
        val.className = 'more-value';
        val.setAttribute('data-val-for', valFor);
        val.textContent = value;
        btn.appendChild(lab);
        btn.appendChild(val);
        var chevron = document.createElement('img');
        chevron.className = 'chevron';
        chevron.src = 'assets/remix/arrow-right-s-line.svg';
        chevron.alt = '';
        btn.appendChild(chevron);
        btn.addEventListener('click', onActivate);
        return btn;
    }
    /* Keep all playback card headings text-only. */
    function setTrackMenuTitle(mode) {
        var menuTitle = document.querySelector('#track-menu > h2');
        if (!menuTitle) return;
        var text = mode === 'audio' ? I18n.t('tracks.audio') :
            mode === 'subtitle' ? I18n.t('tracks.subtitlesTitle') : I18n.t('tracks.title');
        menuTitle.textContent = text;
    }
    function updateTrackSettingValues() {
        var menu = document.getElementById('track-menu');
        if (!menu) return;
        var sync = menu.querySelector('[data-val-for="syncDelay"]');
        if (sync) sync.textContent = fmtSyncDelay(Player.getSubtitleDelay());
        SUBTITLE_SETTINGS.forEach(function (s) {
            var el = menu.querySelector('[data-val-for="' + s.key + '"]');
            if (el) el.textContent = s.name(Settings.get(s.key));
        });
    }
    function openTrackMenu(section) {
        if (section) trackMenuSection = section;
        var mode = trackMenuSection;
        var keepFocus = focusedTrackRow();
        var t = Player.getTracks();
        var aUL = document.getElementById('audio-tracks');
        var sUL = document.getElementById('subtitle-tracks');
        aUL.innerHTML = ''; sUL.innerHTML = '';
        setTrackSectionTitle('audio-tracks-title', I18n.t('tracks.audio'), t.audio.length);
        // Count only real, selectable tracks: not the synthetic "Off" row and
        // not the "+N can't be drawn" note.
        var subCount = 0;
        t.subtitle.forEach(function (tr) { if (!tr.off && !tr.muted) subCount++; });
        setTrackSectionTitle('subtitle-tracks-title', I18n.t('tracks.subtitle'), subCount);

        if (!t.audio.length) {
            aUL.innerHTML = '<li class="muted">' + escapeHtml(I18n.t('tracks.oneAudio')) + '</li>';
        } else {
            t.audio.forEach(function (tr) {
                var li = document.createElement('li');
                li.tabIndex = 0;
                li.textContent = tr.name;
                li.setAttribute('aria-label', I18n.t('toast.audio', tr.name));
                if (tr.active) li.classList.add('active');
                li.addEventListener('click', function () {
                    Player.setAudioTrack(tr.index);
                    // A hand-picked track becomes the preference: remembered
                    // for this file and the rest of the queue, and promoted
                    // to the global default for future files.
                    var lang = (tr.lang || '').toLowerCase();
                    if (lang) rememberPlaybackChoice({ audioLang: lang }, 'audioLang', lang);
                    else if (state.playingUri) savePlayPrefs(state.playingUri, { audioIndex: tr.index });
                    UI.focusOn(li);
                    openTrackMenu();
                });
                aUL.appendChild(li);
            });
        }

        // Subtitle list always has at least the "Off" entry from getTracks()
        t.subtitle.forEach(function (tr) {
            var li = document.createElement('li');
            li.textContent = tr.name;
            li.setAttribute('aria-label', I18n.t('toast.subtitle', tr.name));
            if (tr.beyondAvplay && !tr.extractable) {
                var warning = document.createElement('img');
                warning.className = 'remix-icon track-warning';
                warning.src = 'assets/remix/error-warning-line.svg'; warning.alt = '';
                li.appendChild(warning);
                li.title = I18n.t('tracks.cantShow', tr.name);
                li.setAttribute('aria-label', li.title);
            }
            if (tr.active) li.classList.add('active');
            // Informational rows (e.g. "+3 embedded tracks this TV can't
            // draw") are shown but not selectable — .muted keeps them out of
            // the focus order too.
            if (tr.muted) { li.classList.add('muted'); sUL.appendChild(li); return; }
            li.tabIndex = 0;
            li.addEventListener('click', function () {
                // The row, not just its index: a track AVPlay can't select
                // is read out of the container instead, and that path needs
                // the container's own track number.
                var how = Player.setSubtitleTrack(tr.off ? -1 : tr);
                // Success is visible in the selection mark. Extraction and
                // failure notices still explain an unavailable subtitle.
                if (how === null) UI.toast(I18n.t('tracks.cantShow', tr.name));
                else {
                    // A hand-picked subtitle becomes the preference: 'off'
                    // or the track language, for this file, the queue and
                    // future files.
                    var subLang = tr.off ? 'off' : (tr.lang || '').toLowerCase();
                    if (subLang) rememberPlaybackChoice({ subLang: subLang }, 'subtitleLang', subLang);
                }
                UI.focusOn(li);
                openTrackMenu();
            });
            sUL.appendChild(li);
        });

        /* One Settings section under the subtitle list: synchronization
         * followed by the appearance rows, each a settings-style row that
         * steps with Left/Right and opens its editor as the card's next
         * level.  Labels are bare ("Size", not "Subtitle size") because the
         * card is already the Subtitles one. */
        var menuBody = document.getElementById('track-menu-body');
        Array.prototype.forEach.call(menuBody.querySelectorAll('.track-subsection'), function (d) {
            d.parentNode.removeChild(d);
        });
        var subSection = sUL.parentNode;
        var settingsBox = trackSubsection(null);
        var syncRow = trackSettingRow(I18n.t('sync.title'), 'syncDelay',
            fmtSyncDelay(Player.getSubtitleDelay()), 'sync', function () {
                openSyncLevel(syncRow);
            });
        syncRow.setAttribute('data-sync-row', '1');
        settingsBox.appendChild(syncRow);
        SUBTITLE_SETTINGS.forEach(function (s) {
            settingsBox.appendChild(trackSettingRow(I18n.t(s.labelKey), s.key,
                s.name(Settings.get(s.key)), s.key, function () {
                    openSubtitlePicker(s.key, I18n.t(s.labelKey), s.options());
                }));
        });
        subSection.appendChild(settingsBox);

        /* Split panels: Audio shows only its list under an Audio heading,
         * Subtitles only its list and settings under a Subtitles heading.
         * The per-list subheaders are redundant there. */
        setTrackMenuTitle(mode);
        aUL.parentNode.classList.toggle('hidden', mode === 'subtitle');
        subSection.classList.toggle('hidden', mode === 'audio');
        document.getElementById('audio-tracks-title').classList.toggle('hidden', !!mode);
        document.getElementById('subtitle-tracks-title').classList.toggle('hidden', !!mode);

        document.getElementById('track-menu').classList.remove('hidden');
        updateTrackSettingValues();
        UI.refreshFocusables();
        // Extraction progress rebuilds the parent rows, not the open level.
        // Keep its focus and replace the now-detached Back destination.
        if (cardLevel && cardLevel.owner === 'track-menu') {
            var step = cardLevel.returnEl && cardLevel.returnEl.getAttribute('data-step');
            if (step) cardLevel.returnEl = menuBody.querySelector('[data-step="' + step + '"]');
            return;
        }
        // Where the user already was, if this is a re-render.  Otherwise the
        // visible section's first row, so Audio never lands in the subtitle
        // list or vice versa.
        if (restoreTrackRowFocus(keepFocus)) return;
        // A submenu or picker owns focus: a background track refresh (cue
        // index progress) must not yank the cursor out of it.
        var overlayOpen = !document.getElementById('picker').classList.contains('hidden');
        if (overlayOpen) return;
        var visibleSection = mode === 'audio' ? aUL.parentNode :
                             mode === 'subtitle' ? subSection :
                             document.getElementById('track-menu');
        var first = visibleSection.querySelector('li:not(.muted)') ||
                    visibleSection.querySelector('button');
        if (first) UI.focusOn(first);
    }
    function closeTrackMenu(restore) {
        if (cardLevel && cardLevel.owner === 'track-menu') closeCardLevel(false);
        document.getElementById('track-menu').classList.add('hidden');
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('file-info-scrim').classList.add('hidden');
        UI.refreshFocusables();
        if (state.view === 'player') {
            if (restore) returnPlayerPopup();
            else UI.focusOn(document.getElementById('btn-more'));
        }
    }

    /* INFO helpers: the decoder backend, the byte route, and the tracks
     * actually selected. Unknown rows stay empty so toggleFileInfo skips
     * them instead of showing a guess. */
    function backendName() {
        var b = (Player.getBackend && Player.getBackend()) || '';
        if (b === 'avplay') return 'AVPlay';
        if (b === 'html5') return 'HTML5';
        if (b && b !== 'none') return b.charAt(0).toUpperCase() + b.slice(1);
        return '';
    }
    function selectedAudioName() {
        try {
            var list = (Player.getTracks() || {}).audio || [];
            for (var i = 0; i < list.length; i++) if (list[i].active) return list[i].name;
        } catch (e) {}
        return '';
    }
    function selectedSubtitleName() {
        try {
            var list = (Player.getTracks() || {}).subtitle || [];
            for (var i = 0; i < list.length; i++) if (list[i].active) return list[i].name;
        } catch (e) {}
        return I18n.t('info.none');
    }

    /* INFO (issue #128): what's playing, as far as the player can tell —
     * codec and picture size, HDR (with a warning for Dolby Vision, which
     * no Samsung TV decodes), the selected audio/subtitle tracks, the
     * decoder backend, whether the bytes come direct or via the transcode
     * server, and the duration.  Rows the player knows nothing about are
     * left out. */
    function toggleFileInfo() {
        var panel = document.getElementById('file-info');
        if (!panel.classList.contains('hidden')) { closeFileInfo(); return; }
        closeTrackMenu();
        closeMore(false);
        var d = Player.describe();
        var dl = document.getElementById('file-info-list');
        dl.innerHTML = '';
        function row(label, value, warn) {
            if (!value) return;
            var dt = document.createElement('dt'), dd = document.createElement('dd');
            dt.textContent = label;
            if (Array.isArray(value)) value.forEach(function (v, i) {
                if (i) dd.appendChild(document.createElement('br'));
                dd.appendChild(document.createTextNode(v));
            }); else dd.textContent = value;
            if (warn) dd.className = 'warn';
            dl.appendChild(dt); dl.appendChild(dd);
        }
        var size = d.video.width && d.video.height ? d.video.width + ' × ' + d.video.height : '';
        row(I18n.t('info.video'), [d.video.codec, size].filter(Boolean).join(' · '));
        // As the stream declares it; AVPlay doesn't report one for every file.
        if (d.video.bitrate > 0) row(I18n.t('info.bitrate'), (d.video.bitrate / 1e6).toFixed(1) + ' Mbps');
        if (d.hdr) {
            var h = d.hdr, text, warn = false;
            if (h.kind === 'DV') {
                warn = true;
                text = h.profile === 5 ? I18n.t('info.dv5') : I18n.t('info.dv', h.profile || '?');
            } else text = I18n.t(h.kind === 'HDR10' ? 'info.hdr10' : h.kind === 'HLG' ? 'info.hlg' : 'info.sdr');
            row(I18n.t('info.hdr'), text, warn);
        }
        row(I18n.t('tracks.audio'), selectedAudioName());
        if (!state.playingIsAudio) row(I18n.t('tracks.subtitle'), selectedSubtitleName());
        row(I18n.t('info.backend'), backendName());
        row(I18n.t('info.duration'), d.duration > 0 ? fmtTime(d.duration) : '');
        row(I18n.t('info.container'), d.container);
        if (!dl.childElementCount) row(I18n.t('info.video'), I18n.t('info.unknown'));
        panel.classList.remove('hidden');
        document.getElementById('file-info-scrim').classList.remove('hidden');
        UI.refreshFocusables();
        UI.focusOn(panel.querySelector('.btn.ghost'));
        if (typeof Debug !== 'undefined') Debug.player('file info: ' + JSON.stringify(d));
    }
    /* The INFO modal closes on its own button or Back, returning to the
     * transport button that opened it. */
    function closeFileInfo() {
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('file-info-scrim').classList.add('hidden');
        UI.refreshFocusables();
        if (state.view === 'player') UI.focusOn(document.getElementById('btn-info'));
        scheduleOSDHide();
    }

    /* Type a digit from a remote number key (0-9) into the focused text field.
     * The TV's on-screen keyboard handles letters; the hardware number keys
     * arrive as key events that the browser doesn't insert on their own, so we
     * insert them ourselves (handy for IP / port / numeric entry). Returns true
     * if a field actually took the digit. */
    function typeDigitIntoField(digit) {
        var el = document.querySelector('.focused') || document.activeElement;
        if (!el || el.tagName !== 'INPUT') return false;
        var t = (el.type || 'text').toLowerCase();
        if (t !== 'text' && t !== 'password' && t !== 'search' && t !== 'tel' && t !== 'number') return false;
        var ch = String(digit);
        try {
            var s = el.selectionStart, e = el.selectionEnd;
            if (s != null && e != null) {
                el.value = el.value.slice(0, s) + ch + el.value.slice(e);
                el.selectionStart = el.selectionEnd = s + ch.length;
            } else { el.value += ch; }
        } catch (ex) { el.value += ch; }
        return true;
    }

    function isTextField(el) {
        return !!el && el.tagName === 'INPUT';
    }

    /* Left / Right in a text field move the cursor through what's typed, so
     * a typo can be fixed (issue #115); only past either end do they move
     * focus on.  The key is then left to the browser. */
    function caretCanMove(delta) {
        var el = document.activeElement;
        if (!isTextField(el) || !el.classList.contains('focused')) return false;
        try {
            var s = el.selectionStart, e = el.selectionEnd;
            if (s == null || e == null) return false;
            return delta < 0 ? e > 0 : s < el.value.length;
        } catch (ex) { return false; }
    }

    /* Number-key seek: digit n → n × 10 % of the duration.  Returns false
     * when an overlay owns the keys or the duration isn't known yet. */
    function seekToTenth(digit) {
        if (!document.getElementById('error-overlay').classList.contains('hidden') ||
            !document.getElementById('track-menu').classList.contains('hidden') ||
            !document.getElementById('picker').classList.contains('hidden')) return false;
        var dur = Player.duration() || lastProgress.duration;
        if (digit > 0 && !dur) return false;
        var target = digit ? Math.floor(dur * digit / 10) : 0;
        if (scrub.active) cancelScrub(false);
        Player.seekTo(target);
        updateProgress(target, dur || lastProgress.duration);
        flashOSD();
        UI.toast(digit ? I18n.t('player.jumped', digit * 10, fmtTime(target)) : I18n.t('player.restarted'));
        return true;
    }

    /* ── Global remote key dispatcher ─────────────────────────────── */
    function globalKeyHandler(code, ev) {
        var K = Remote.KEY;
        if (typeof Debug !== 'undefined') Debug.key('code=' + code + ' view=' + state.view);


        // Remote number buttons (0-9) type into a focused text field, so the
        // hardware keys work alongside the on-screen keyboard. Only consumes the
        // key when a text field actually took it, otherwise it falls through.
        if (code >= K.ZERO && code <= K.NINE && typeDigitIntoField(code - K.ZERO)) return true;

        // In the player, the number keys jump by tenths: 0 restarts, 1–9 go
        // to 10 %–90 % of the file (issue #78).  Only when nothing modal is
        // up, and only for files with a known duration (0 always works).
        if (code >= K.ZERO && code <= K.NINE && state.view === 'player' &&
            seekToTenth(code - K.ZERO)) return true;

        // URL input view: OK on the field opens the on-screen keyboard (see
        // ENTER below), and the keyboard's Done moves on to the Play button.
        // The keyboard's Done in the playlist filter: filter now, then on to
        // the first result.
        if (state.view === 'browse' && code === K.IME_DONE && document.activeElement &&
            document.activeElement.id === 'playlist-filter' && state.playlistView) {
            clearTimeout(filterTimer);
            // A composing keyboard layout may still be committing its last
            // word when Done arrives, so the field is read a moment later.
            var field = document.activeElement;
            lastFilterEvent = 'done';
            setTimeout(function () {
                if (!state.playlistView || state.view !== 'browse') return;
                state.playlistView.filter = field.value;
                renderPlaylist();
            }, 50);
            return true;
        }

        if (state.view === 'url') {
            if (code === K.BACK) {
                if (!document.getElementById('picker').classList.contains('hidden')) {
                    closePicker();
                    if (savedMenuFor) focusSaved(savedMenuFor, 'saved-menu');
                } else if (savedEditing !== null) closeSavedEdit();
                else backToHome();
                return true;
            }
            // In the save form the keyboard's Done goes on to the URL, then saves.
            if (code === K.IME_DONE && savedEditing !== null && document.activeElement) {
                if (document.activeElement.id === 'saved-name') {
                    UI.focusOn(document.getElementById('saved-url'));
                    return true;
                }
                if (document.activeElement.id === 'saved-url') { finishSavedEdit(); return true; }
            }
            // Done on the URL field fills it in and lands on Play, so Save
            // and the other buttons are one step away rather than the
            // stream already playing (issue #126).
            if (code === K.IME_DONE && document.activeElement &&
                document.activeElement.id === 'url-input') {
                UI.focusOn(document.querySelector('#view-url [data-action="open-current-url"]'));
                return true;
            }
        }

        // When the error overlay is up, route ALL navigation/activation to it
        // (no seeking, no OSD flashing — the only thing on screen that matters
        // is the "Back to Home" button).
        var errorUp = !document.getElementById('error-overlay').classList.contains('hidden');

        // Track menu / settings picker open? Routes through normal focus.
        var trackMenuOpen = !document.getElementById('track-menu').classList.contains('hidden') ||
                            !document.getElementById('file-info').classList.contains('hidden') ||
                            !document.getElementById('player-more').classList.contains('hidden');
        var pickerOpen    = !document.getElementById('picker').classList.contains('hidden');
        trackMenuOpen = trackMenuOpen || pickerOpen;
        // OSD currently visible? Determines whether keys navigate within OSD
        // or perform seek shortcuts.
        var osdVisible = !document.getElementById('osd-bottom').classList.contains('hidden');

        switch (code) {
            // Up/Down switch hidden → timeline → transport row.
            // Left/Right on a More value row or the sync control step that
            // option directly; on the timeline they scrub with duration-aware
            // steps; hidden they seek and reveal controls. FF/RW share the
            // same bounded acceleration curve.
            // Scrub steps only preview on the progress bar; the real seek is
            // committed after a short pause in input, or instantly on OK.
            // BACK during a scrub cancels it without seeking.
            case K.UP:
                if (state.view === 'player' && !errorUp && !trackMenuOpen) {
                    if (!osdVisible) return true;
                    if (document.activeElement === document.getElementById('player-timeline')) {
                        if (scrub.active) commitScrub();
                        clearTimeout(osdHideTimer); showOSD(false);
                    } else if (inUpNext()) {
                        // Up from the queue lands on the transport row, not
                        // straight past it to the timeline.
                        UI.focusOn(document.getElementById('btn-playpause'));
                    } else { focusTimeline(); scheduleOSDHide(); }
                    return true;
                }
                if (state.view === 'settings' && !pickerOpen) {
                    scrollSettingsIfNoFocusMove(-200, 'up');
                    return true;
                }
                UI.moveFocus('up', state.view === 'player' && trackMenuOpen);
                return true;
            case K.DOWN:
                if (state.view === 'player' && !errorUp && !trackMenuOpen) {
                    if (!osdVisible) { flashOSD(); return true; }
                    if (scrub.active) commitScrub();
                    // From the timeline Down enters the transport row; from
                    // anywhere else it moves geometrically, which is what
                    // reaches the Up Next cards below the transport.
                    if (document.activeElement === document.getElementById('player-timeline')) {
                        UI.focusOn(document.getElementById('btn-playpause'));
                    } else {
                        UI.moveFocus('down');
                    }
                    scheduleOSDHide();
                    return true;
                }
                if (state.view === 'settings' && !pickerOpen) {
                    scrollSettingsIfNoFocusMove(+200, 'down');
                    return true;
                }
                UI.moveFocus('down', state.view === 'player' && trackMenuOpen);
                return true;
            case K.LEFT:
                if (state.view === 'player' && !errorUp && stepFocusedOption(-1)) return true;
                if (state.view === 'player' && !errorUp && !trackMenuOpen) {
                    if (osdVisible && document.activeElement !== document.getElementById('player-timeline')) {
                        UI.moveFocus('left'); scheduleOSDHide(); return true;
                    }
                    if (!osdVisible) { seekJump(-1); flashOSD(); return true; }
                    scrubStep(-1);
                    return true;
                }
                if (caretCanMove(-1)) return false;
                UI.moveFocus('left', state.view === 'player' && trackMenuOpen); return true;
            case K.RIGHT:
                if (state.view === 'player' && !errorUp && stepFocusedOption(+1)) return true;
                if (state.view === 'player' && !errorUp && !trackMenuOpen) {
                    if (osdVisible && document.activeElement !== document.getElementById('player-timeline')) {
                        UI.moveFocus('right'); scheduleOSDHide(); return true;
                    }
                    if (!osdVisible) { seekJump(1); flashOSD(); return true; }
                    scrubStep(+1);
                    return true;
                }
                if (caretCanMove(+1)) return false;
                UI.moveFocus('right', state.view === 'player' && trackMenuOpen); return true;
            case K.ENTER:
                // OK commits timeline scrubs, activates buttons, or toggles
                // playback and reveals hidden controls.
                if (state.view === 'player' && !errorUp && !trackMenuOpen) {
                    if (scrub.active) { commitScrub(); return true; }
                    if (!osdVisible) { Player.togglePause(); flashOSD(); return true; }
                    if (document.activeElement === document.getElementById('player-timeline')) { Player.togglePause(); scheduleOSDHide(); return true; }
                    if (!UI.activateFocused()) flashOSD();
                    return true;
                }
                // A text field: let OK through untouched.  That key press is
                // the user action that opens the on-screen keyboard — merely
                // landing on the field no longer does (config.xml, issue #111).
                if (!UI.activateFocused() && isTextField(document.activeElement)) return false;
                return true;
            case K.INFO:
                if (state.view === 'player' && !errorUp) { toggleFileInfo(); return true; }
                return false;
            /* Tools does the second-level thing to the focused row: pin a
             * folder, or save a channel in a playlist. */
            case K.TOOLS:
                if (browseShowing() && !pickerOpen && (toggleSavedChannel() || toggleFavoriteRow())) return true;
                return false;
            case K.BACK:
                if (pickerOpen)                 { closePicker();     return true; }
                // A card level is the topmost thing: Back raises it, leaving
                // the card's own rows in place.
                if (cardLevel)                  { closeCardLevel(true); return true; }
                if (!document.getElementById('player-more').classList.contains('hidden')) {
                    // Back inside a level raises it; at the top it closes More.
                    closeMore(true); return true;
                }
                // Back closes the INFO modal itself rather than walking out
                // of the player underneath it.
                if (!document.getElementById('file-info').classList.contains('hidden')) { closeFileInfo(); return true; }
                if (trackMenuOpen)              { closeTrackMenu(true);  return true; }
                // A dead channel is routine in an IPTV list: back to the list,
                // not all the way home.
                if (errorUp && state.origin === 'playlist') { exitPlayer(); return true; }
                if (errorUp && state.view === 'player') { exitPlayer(); return true; }
                if (state.view === 'browse' && state.listBack) {
                    var listBack = state.listBack; state.listBack = null;
                    listBack();
                    return true;
                }
                if (state.view === 'browse')    { browseUp();        return true; }
                if (state.view === 'player' && scrub.active) { cancelScrub(true); return true; }
                if (state.view === 'player')    { exitPlayer();      return true; }
                if (state.view === 'url')       { backToHome();      return true; }
                if (!document.getElementById('net-config').classList.contains('hidden')) {
                    closeNetConfig(true); return true;
                }
                if (state.view === 'cast')      { openSettings();    return true; }
                if (state.view === 'network')   { backToHome();      return true; }
                if (state.view === 'settings')  { backToHome();      return true; }
                /* Home view: explicitly exit the app rather than trusting the
                 * TV launcher to intercept an unhandled BACK — that fallback
                 * doesn't fire on Smart Monitors, leaving the user with no
                 * way out (issue #57). */
                if (state.view === 'home')      { exitApp();         return true; }
                return false;
            case K.PLAY:
            case K.PAUSE:
            case K.PLAYPAUSE:
                if (state.view === 'player') {
                    if (scrub.active) commitScrub();
                    Player.togglePause(); flashOSD(); return true;
                }
                return false;
            case K.STOP:
                if (state.view === 'player') { exitPlayer(); return true; }
                return false;
            // Channel ± and the track keys step through the list (issue #105).
            case K.CH_UP: case K.TRACK_NEXT:
                if (state.view === 'player' && !errorUp) {
                    if (!playNext(false)) UI.toast(I18n.t('player.noNext'));
                    return true;
                }
                return false;
            case K.CH_DOWN: case K.TRACK_PREV:
                if (state.view === 'player' && !errorUp) { handlePrev(); return true; }
                return false;
            case K.REWIND:
                if (state.view === 'player') { scrubStep(-1); return true; }
                return false;
            case K.FF:
                if (state.view === 'player') { scrubStep(+1); return true; }
                return false;
        }
        return false;
    }

    /* ── Auto-apply preferred audio + subtitle language ─────────────
     * Called after the player reaches state=PLAYING so the AVPlay/HTML5
     * track list is populated.  Finds the first track whose name (or, for
     * HTML5 external subs, lang tag) matches the preferred ISO code and
     * activates it.  Subtitle 'off' explicitly disables.  No-op if the
     * preference is empty (Auto). */
    /* Pick the audio track to play, balancing two goals:
     *   1. the user's preferred audio language (Settings → audioLang), and
     *   2. actually getting sound — Samsung TVs can't decode DTS/TrueHD, so a
     *      track flagged `unsupported` by Player.getTracks() plays silently.
     * Priority: preferred-language + decodable  >  any decodable  >  the
     * preferred-language track even if silent (at least it's the right
     * language).  Only switches when it improves on the current/default track,
     * and surfaces a toast so the user understands a silent file. */
    function chooseAudioTrack(tracks, prefOverride) {
        var audio = (tracks && tracks.audio) || [];
        if (!audio.length) return;

        var pref = (typeof prefOverride !== 'undefined' ? prefOverride : Settings.get('audioLang') || '').toLowerCase();
        function langMatches(t) {
            if (!pref) return false;
            // Shared with the subtitle picker: matches the language tag, the
            // ISO 639-2 spelling ('ger', 'vie'), the English name and the
            // endonym — see LanguageList.matchScore in settings.js.
            return LanguageList.matchScore(pref, t.lang, t.name) > 0;
        }
        function firstSupported(list) {
            for (var i = 0; i < list.length; i++) if (!list[i].unsupported) return list[i];
            return null;
        }

        var active = null;
        for (var i = 0; i < audio.length; i++) if (audio[i].active) { active = audio[i]; break; }

        var target = null;
        if (pref) {
            var matchSupported = null, matchAny = null;
            for (var j = 0; j < audio.length; j++) {
                if (!langMatches(audio[j])) continue;
                if (!matchAny) matchAny = audio[j];
                if (!audio[j].unsupported && !matchSupported) matchSupported = audio[j];
            }
            if (matchSupported)      target = matchSupported;          // ideal
            else if (matchAny)       target = firstSupported(audio) || matchAny;
        }
        // No preference (or none usable): only step in if the current track is
        // undecodable but a decodable one exists.
        if (!target && active && active.unsupported) target = firstSupported(audio);

        if (target && (!active || target.index !== active.index)) {
            Player.setAudioTrack(target.index);
            if (active && active.unsupported && !target.unsupported)
                UI.toast(target.codec && active.codec
                    ? I18n.t('audio.switched', target.codec, active.codec)
                    : I18n.t('audio.switchedGeneric'));
            if (typeof Debug !== 'undefined')
                Debug.player('chooseAudioTrack → ' + target.name +
                             ' (active was ' + (active ? active.name : 'none') + ')');
        }

        // If we still can't get a decodable track, tell the user why it's silent.
        var finalT = target || active;
        if (finalT && finalT.unsupported && !firstSupported(audio)) {
            UI.toast(I18n.t('audio.noneDecodable', finalT.codec || 'DTS/TrueHD'));
        }
    }

    var prefsAppliedFor = null;
    var subPrefSettled  = false;
    /* The language track-matching falls back to when nothing was picked:
     * the base code of the app language (pl-PL → pl).  Recently picked
     * languages outrank it — a hand pick promotes its language to the
     * global default, and per-file memory outranks that. */
    function appLanguageBase() {
        var ui = Settings.get('uiLanguage') ||
                 (typeof I18n !== 'undefined' && I18n.current ? I18n.current() : '');
        return String(ui).split('-')[0].toLowerCase();
    }
    function effectiveAudioLang(stored) {
        if (stored && typeof stored.audioLang !== 'undefined') return stored.audioLang;
        return Settings.get('audioLang') || appLanguageBase();
    }
    function effectiveSubLang(stored) {
        if (stored && typeof stored.subLang !== 'undefined') return stored.subLang;
        return Settings.get('subtitleLang') || appLanguageBase();
    }
    function applyLanguagePreferences() {
        // Only apply once per file to avoid clobbering manual selections
        if (prefsAppliedFor === state.playingUri) return;
        prefsAppliedFor = state.playingUri;
        subPrefSettled  = false;

        // Per-file memory wins, then recently picked languages, then the
        // app language.
        var stored  = playPrefsFor(state.playingUri) || {};
        var prefSub = effectiveSubLang(stored);
        var tracks  = Player.getTracks();

        // Audio: honour the language preference, but never leave the user on a
        // track the TV can't decode (DTS/TrueHD) when a playable one exists.
        chooseAudioTrack(tracks, effectiveAudioLang(stored));

        // Subtitle: 'off' explicit, '' auto (no action), code → match
        if (prefSub === 'off') {
            Player.setSubtitleTrack(-1);
            subPrefSettled = true;
            if (typeof Debug !== 'undefined') Debug.player('subtitle pref: off (silent)');
        } else if (prefSub) {
            applySubtitlePreference(prefSub, tracks);
        } else {
            subPrefSettled = true;
            adoptFileDefaultSubtitle(tracks);
        }

        // The remaining per-file choices re-apply on top of the decoder's
        // per-open resets (speed and delay always reset; aspect is global).
        try {
            if (typeof stored.delay !== 'undefined' && stored.delay !== Player.getSubtitleDelay())
                Player.setSubtitleDelay(stored.delay);
        } catch (e) {}
        try {
            if (stored.speed && stored.speed !== (Player.getSpeed ? Player.getSpeed() : 1)) {
                if (Player.setSpeed(parseFloat(stored.speed))) updateSpeedButton();
            }
        } catch (e) {}
        try {
            if (stored.aspect && stored.aspect !== Settings.get('aspectMode') && AspectRatio.isKnown(stored.aspect)) {
                Settings.set('aspectMode', stored.aspect);
                Player.applyAspect();
                updateAspectButton();
                refreshSettingsValues();
            }
        } catch (e) {}
        updateTrackSettingValues();
    }

    /* 'Auto (file default)': show the track the file itself marks default.
     * AVPlay opens with that track current, and used to leave it there:
     * the CC menu marked it selected, but the subtitle callback stays gated
     * until a track is selected through Player.setSubtitleTrack, so nothing
     * reached the screen until the user toggled it off and on (issue #73).
     * Select it the way the CC menu does, so what the menu says and what
     * the screen shows are the same thing. */
    function adoptFileDefaultSubtitle(tracks) {
        for (var j = 0; j < tracks.subtitle.length; j++) {
            var st = tracks.subtitle[j];
            if (st.off || st.muted || !st.avCurrent) continue;
            var how = Player.setSubtitleTrack(st);
            if (typeof Debug !== 'undefined')
                Debug.player('subtitle pref: auto → file default ' + st.name + ' (' + how + ')');
            return true;
        }
        if (typeof Debug !== 'undefined')
            Debug.player('subtitle pref: auto — file has no default subtitle track');
        return false;
    }

    /* Score every candidate and take the best.  External subs are reliable
     * on this firmware and embedded ones often aren't, so they win ties. */
    function applySubtitlePreference(prefSub, tracks) {
        var wantSub   = prefSub.toLowerCase();
        var bestMatch = null;
        var bestScore = 0;
        for (var j = 0; j < tracks.subtitle.length; j++) {
            var st = tracks.subtitle[j];
            if (st.off || st.muted) continue;

            var sc = LanguageList.matchScore(wantSub, st.lang, st.name);
            if (!sc) continue;
            if (st.type === 'AVPLAY_EXTERNAL' || st.type === 'HTML5_EXTERNAL') sc += 15;

            if (sc > bestScore) { bestScore = sc; bestMatch = st; }
        }
        if (bestMatch) {
            subPrefSettled = true;
            Player.setSubtitleTrack(bestMatch);
            if (typeof Debug !== 'undefined')
                Debug.player('applied subtitle pref ' + prefSub + ' → ' + bestMatch.name +
                             ' (score ' + bestScore + ')');
            return true;
        }
        if (typeof Debug !== 'undefined')
            Debug.player('subtitle pref ' + prefSub + ': no matching track in ' +
                         tracks.subtitle.map(function (x) { return x.name; }).join(' / '));
        return false;
    }

    /* The container's own track list is read after playback starts, so a
     * preferred language that only exists in the tail of a 40-track mux
     * becomes matchable a second or two late.  Retry then — but never over
     * the top of a subtitle that is already showing, which would undo a
     * choice the user just made by hand. */
    function retrySubtitlePreference() {
        if (subPrefSettled) return;
        if (prefsAppliedFor !== state.playingUri) return;
        var stored = playPrefsFor(state.playingUri) || {};
        var prefSub = effectiveSubLang(stored);
        if (!prefSub || prefSub === 'off') { subPrefSettled = true; return; }
        var tracks = Player.getTracks();
        if (!tracks.subtitle.length || !tracks.subtitle[0].active) return;   // one is showing
        applySubtitlePreference(prefSub, tracks);
    }

    /* On the settings view, after the last focusable row there's a TV-info
     * panel that has no focusables.  Up/Down should:
     *   1. Try to move focus geometrically (noWrap = don't cyclic-fallback).
     *   2. If no element is in that direction, scroll the settings-content
     *      panel instead so the user can read past the bottom of the info.
     * Without noWrap the cyclic fallback would jump focus back to the
     * opposite end and never trigger the scroll. */
    function scrollSettingsIfNoFocusMove(dy, dir) {
        if (UI.moveFocus(dir, /*noWrap*/ true)) return;   // focus moved, done
        var c = document.querySelector('.settings-content');
        if (c) {
            if (c.scrollBy) c.scrollBy({ top: dy, behavior: 'smooth' });
            else            c.scrollTop += dy;
        }
    }

    /* ── Helpers ──────────────────────────────────────────────────── */
    function prettifyRootName(name) {
        if (!name) return I18n.t('root.unknown');
        if (/^removable.*/i.test(name)) return I18n.t('browse.usbTitle');
        if (/^usb/i.test(name)) return I18n.t('browse.usbTitle');
        if (name === 'downloads') return I18n.t('root.downloads');
        if (name === 'videos')    return I18n.t('root.videos');
        if (name === 'music')     return I18n.t('root.music');
        if (name === 'images')    return I18n.t('root.pictures');
        if (name === 'documents') return I18n.t('root.documents');
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function refreshHome() { if (window.LibraryUI) LibraryUI.home(getResumeMap(), getWatched()); }
    function openUsbFolder(pin) {
        releaseBrowsers();
        var seq = browseSequence;
        tizen.filesystem.resolve(LibraryUI.usbPath(pin, pin.path), function (dir) {
            if (seq !== browseSequence) return;
            UI.showView('view-browse'); state.view = 'browse'; state.browseAtRoot = false;
            state.browseRoot = { name: pin.root || '', fullPath: pin.rootPath || pin.path };
            listInto(dir);
        }, function () { UI.toast(I18n.t('source.unavailable')); }, 'r');
    }

    // Public hooks used by js/smb.js to hand SMB playback back to the app so it
    // reuses next/prev, auto-play, recent & watched tracking.
    window.VlcApp = {
        play: playFromList, home: backToHome, openSettings: openSettings,
        leavePlayback: exitPlayer,
        refreshHome: refreshHome,
        openStream: openUrl,
        openUsbFolder: openUsbFolder,
        sourceSaved: function (kind, id) { LibraryUI.sourceSaved(kind, id); },
        prepareSourceBrowse: function () { releaseBrowsers(); networkReturn = true; },
        // smb.js hands a playlist on a share over the same way.
        openPlaylist: openPlaylist, maxPlaylistBytes: MAX_PLAYLIST_BYTES,
        // The network browsers draw into the same browse view and need the
        // grid/tile treatment and the roots' carousels.
        setBrowseGrid: setBrowseGrid,
        setBrowsePage: setBrowsePage,
        currentPageName: currentPageName,
        // A source opened from the Network page returns to its picker.
        networkSourceBack: networkSourceBack,
        // The SMB / WebDAV forms and the DLNA server pick call this once a
        // source is saved: it becomes the one network connection in use.
        setNetworkMethod: setNetworkMethod,
        // Harnesses (preview and simulator): open screens directly.
        openNetwork: openNetwork,
        showNetworkPicker: showNetworkPicker,
        browseUsbRoot: openBrowserAtRoot,
        openNetConfig: openNetConfig,
        openUrlView: openUrlView,
        openCast: openCast,
        openPicker: openPicker,
        // The scrub acceleration curve and the option stepper, exposed for
        // the Node tests. Both are pure.
        scrubStepSize: scrubStepSize,
        stepList: stepList,
        // Per-file playback memory, exposed so the Node tests can drive
        // the merge/propagate rules without a DOM.
        playbackPrefsFor: playPrefsFor,
        savePlaybackPrefs: savePlayPrefs
    };

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();

})();
