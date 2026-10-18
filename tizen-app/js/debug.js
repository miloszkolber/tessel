/* Debug telemetry — every line goes to the browser console; with debug
 * logging switched on it also goes to the TV service, which serves the live
 * log page at http://<tv-ip>:8129/debug.
 *
 * The console needs no setup: Apps2Samsung → Installed apps → Debug puts the
 * app in debug mode and opens chrome://inspect.  The service page needs no
 * setup either — the app posts over loopback while it runs, and anyone on the
 * network can watch the page.  Lines are tagged [vlctv] so they're one filter
 * away from whatever else the WebView is saying.
 *
 * The last MAX_LINES lines are also kept in memory for reference.
 */

var Debug = (function () {
    var CFG_KEY = 'vlctv_debug_on_v1';
    var startTs = Date.now();
    var seq     = 0;

    /* Publishing to the TV service's log page is opt-in; the console half
     * always runs. */
    function loadEnabled() {
        try { return localStorage.getItem(CFG_KEY) === 'on'; } catch (e) { return false; }
    }
    var logging = loadEnabled();
    function enabled() { return logging; }
    function setEnabled(on) {
        logging = !!on;
        try { localStorage.setItem(CFG_KEY, logging ? 'on' : 'off'); } catch (e) {}
        if (logging) send('INFO', 'debug logging switched on');
    }

    var MAX_LINES = 2000;        // ~200 KB at most; hours at the usual rate
    var lines     = [];
    var dropped   = 0;
    var startedAt = new Date();

    /* Whether the POST half has somewhere to go.  The console half is always
     * on: it costs nothing when no inspector is attached, and having to go
     * and enable something before the interesting thing happens again is
     * exactly what makes a bug hard to catch. */

    function ts() {
        var t = (Date.now() - startTs) / 1000;
        return '[' + t.toFixed(3) + ']';
    }

    function send(tag, msg) {
        seq++;
        var payload = ts() + ' #' + seq + ' [' + tag + '] ' +
                      (typeof msg === 'string' ? msg : JSON.stringify(msg));

        lines.push(payload);
        // Trim in chunks rather than a shift per line once the buffer is full.
        if (lines.length > MAX_LINES + 200) {
            dropped += lines.length - MAX_LINES;
            lines.splice(0, lines.length - MAX_LINES);
        }
        publish(tag, payload);

        /* DevTools first, so a line still lands there when the POST path is
         * off or the listener has gone away.  console.error for the tags that
         * mean something went wrong, so they keep DevTools' red styling and
         * its error filter. */
        try {
            var out = (tag === 'ERROR' || tag === 'WARN' ||
                       tag === 'JSERR' || tag === 'JSREJECT')
                ? console.error : console.log;
            out.call(console, '[vlctv]' + payload);
        } catch (e) {}

        publish(tag, payload);
    }

    /* Every line goes to the TV service, which serves the live log page at
     * http://<tv-ip>:8129/debug.  Loopback, fire-and-forget; that page is the
     * only log destination besides DevTools. */
    function publish(tag, payload) {
        if (!logging) return;
        try {
            var x = new XMLHttpRequest();
            x.open('POST', 'http://127.0.0.1:8127/debug/log', true);
            /* text/plain keeps this a simple request: no CORS preflight, and
             * the service parses the body as JSON either way. */
            x.setRequestHeader('Content-Type', 'text/plain');
            x.send(JSON.stringify({ tag: tag, text: payload }));
        } catch (e) {}
    }

    /* Convenience helpers — every "category" gets its own short tag */
    function info (m) { send('INFO',   m); }
    function warn (m) { send('WARN',   m); }
    function error(m) { send('ERROR',  m); }
    function view (m) { send('VIEW',   m); }
    function action(m){ send('ACTION', m); }
    function player(m){ send('PLAYER', m); }
    function browse(m){ send('BROWSE', m); }
    function key   (m){ send('KEY',    m); }

    /* The log so far as one text: a header with what `info` says about the
     * build and the TV, then the lines as they went to the console, oldest
     * first.  The timestamps are seconds since the app started, which the
     * header gives as a clock time. */
    function exportText(info) {
        var head = ['Tessel debug log',
                    'exported: ' + new Date().toISOString(),
                    'started:  ' + startedAt.toISOString() + ' (line timestamps count seconds from then)'];
        for (var k in info) if (info[k]) head.push(k + ': ' + info[k]);
        head.push('lines: ' + lines.length + (dropped ? ' (' + dropped + ' earlier lines dropped)' : ''));
        return head.join('\n') + '\n\n' + lines.join('\n') + '\n';
    }
    function lineCount() { return lines.length; }

    /* debug.js loads before i18n.js; the form is wired once the page has
     * parsed, when I18n is there — except in the Node tests. */
    function tr(key, english) { return (typeof I18n !== 'undefined') ? I18n.t(key) : english; }

    /* Capture unhandled JS errors automatically */
    window.addEventListener('error', function (ev) {
        send('JSERR',
             (ev.message || '?') + ' @ ' + (ev.filename || '?') + ':' + ev.lineno);
    });
    window.addEventListener('unhandledrejection', function (ev) {
        send('JSREJECT',
             ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason));
    });

    /* Boot banner — confirms the app loaded and which build it is. */
    send('BOOT',
         'Tessel starting; UA=' + navigator.userAgent +
         '; href=' + location.href);

    return {
        send: send,
        info: info, warn: warn, error: error,
        view: view, action: action,
        player: player, browse: browse, key: key,
        exportText: exportText, lineCount: lineCount,
        enabled: enabled, setEnabled: setEnabled
    };
})();

// Ignored by the Tizen/browser build; lets Node tests check what goes where.
if (typeof module !== 'undefined' && module.exports) module.exports = Debug;
