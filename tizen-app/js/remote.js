/* Remote-control key handling.
 *
 * Tizen TV remote keys arrive as standard `keydown` events on `window`, but
 * with TV-specific keyCodes.  Special media keys (Play/Pause/FF/RW) need to
 * be explicitly registered via tizen.tvinputdevice.registerKey() or they're
 * not delivered at all.  We register every media key up-front. */

var Remote = (function () {
    var KEY = {
        TAB:    9,
        LEFT:   37,
        UP:     38,
        RIGHT:  39,
        DOWN:   40,
        ENTER:  13,
        BACK:   10009,
        EXIT:   10182,

        PLAY:   415,
        PAUSE:  19,
        STOP:   413,
        REWIND: 412,
        FF:     417,
        PLAYPAUSE: 10252,

        ZERO:   48, ONE: 49, TWO: 50, THREE: 51, FOUR: 52,
        FIVE: 53, SIX: 54, SEVEN: 55, EIGHT: 56, NINE: 57,

        VOL_UP: 447, VOL_DOWN: 448, MUTE: 449,
        CH_UP:  427, CH_DOWN: 428,
        RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
        INFO: 457, GUIDE: 458,
        /* The second-level action key: pin a folder, save a channel.  10135
         * is the Tools button on Tizen remotes (Samsung's key-code table). */
        TOOLS: 10135,

        // MediaTrackPrevious / MediaTrackNext; registerMediaKeys() takes the
        // TV's own codes when it can.
        TRACK_PREV: 10232, TRACK_NEXT: 10233,

        // The on-screen keyboard's own Done / Cancel keys.
        IME_DONE: 65376, IME_CANCEL: 65385,

        MEDIA_PLAY: 415, MEDIA_PAUSE: 19, MEDIA_STOP: 413,
        MEDIA_REWIND: 412, MEDIA_FF: 417,
        MEDIA_RECORD: 416, MEDIA_PLAYPAUSE: 10252
    };

    /* Register media keys so they're delivered to our handler. */
    function registerMediaKeys() {
        if (typeof tizen === 'undefined' || !tizen.tvinputdevice) return;
        var keys = [
            'MediaPlay', 'MediaPause', 'MediaStop',
            'MediaRewind', 'MediaFastForward',
            'MediaPlayPause', 'MediaRecord',
            /* MediaTrackPrevious / MediaTrackNext land on some Smart Monitor
             * firmwares that don't ship a full media strip on the remote
             * (issue #42).  Silently skipped by registerKey if unknown. */
            'MediaTrackPrevious', 'MediaTrackNext',
            'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
            'Info', 'Guide', 'Tools',
            'ChannelUp', 'ChannelDown',
            'Exit',
        ];
        var failed = [];
        for (var i = 0; i < keys.length; i++) {
            try { tizen.tvinputdevice.registerKey(keys[i]); }
            catch (e) { failed.push(keys[i] + ' (' + ((e && e.name) || e) + ')'); }
        }
        var ask = { MediaTrackPrevious: 'TRACK_PREV', MediaTrackNext: 'TRACK_NEXT' };
        for (var name in ask) {
            try { var k = tizen.tvinputdevice.getKey(name); if (k && k.code) KEY[ask[name]] = k.code; } catch (e) {}
        }
        /* A SecurityError here means config.xml lacks the tv.inputdevice
         * privilege and NO media key will reach the app — the TV shows its
         * own "key not supported" toast instead.  Surface it loudly. */
        if (failed.length && typeof Debug !== 'undefined') {
            Debug.warn('registerKey failed: ' + failed.join(', '));
        }
    }

    var listeners = [];
    var hold = null;
    var HOLD_MS = 650;
    function cancelHold() {
        if (hold) { clearTimeout(hold.timer); hold.cancelled = true; }
    }
    function consume(ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }
    function onDown(ev) {
        if (ev.keyCode !== KEY.ENTER) { if (hold) cancelHold(); dispatch(ev); return; }
        if (hold) { consume(ev); return; }
        var target = document.activeElement;
        if (!target || target.tagName === 'INPUT' || !target.__context) { dispatch(ev); return; }
        consume(ev);
        hold = { target: target, cancelled: false, long: false };
        var pending = hold;
        pending.timer = setTimeout(function () {
            if (pending.cancelled || document.activeElement !== target || target.closest('.hidden')) return;
            pending.long = true;
            target.__context();
        }, HOLD_MS);
    }
    function onUp(ev) {
        if (ev.keyCode !== KEY.ENTER || !hold) return;
        consume(ev);
        var pending = hold; hold = null; clearTimeout(pending.timer);
        if (!pending.cancelled && !pending.long && document.activeElement === pending.target) dispatch(ev);
    }

    function init() {
        registerMediaKeys();
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        window.addEventListener('blur', function () { cancelHold(); hold = null; });
        document.addEventListener('contextmenu', function (ev) {
            var target = ev.target.closest('[data-context]');
            if (target && target.__context) { consume(ev); target.__context(); }
        });
    }

    function dispatch(ev) {
        var code = ev.keyCode;
        /* Browsers and the desktop preview send Escape where the TV sends
         * RETURN (10009); treat it as Back so the same navigation works off
         * the TV. Arrow keys and Enter already share the remote's codes. */
        if (code === 27) code = KEY.BACK;
        for (var i = 0; i < listeners.length; i++) {
            if (listeners[i](code, ev) === true) {
                /* preventDefault is critical for BACK: without it, Tizen's
                 * launchpad treats it as "exit app" alongside our handler,
                 * leading to a half-exit / app-restart cycle on some TVs. */
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                return;
            }
        }
        /* Log unhandled keycodes so users hitting a remote key that does
         * nothing (issue #42, Smart Monitor M5) can share the numeric code
         * with us and we can wire it into globalKeyHandler. */
        if (typeof Debug !== 'undefined') Debug.key('unhandled ' + code);
    }

    /* Listeners are tried in REVERSE registration order (most-recently-pushed
     * has priority — like a modal stack). */
    function push(fn) { listeners.unshift(fn); return fn; }
    function pop(fn) {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
    }

    return { KEY: KEY, init: init, push: push, pop: pop, cancelHold: cancelHold };
})();
