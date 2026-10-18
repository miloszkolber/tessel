/* url-drop.js — "paste a URL on your phone, pull it on the TV", entirely on
 * the local network.
 *
 * The TV's own background service (js/service via the smbproxy) already runs
 * an HTTP server on the LAN.  It serves the phone page at /cast, accepts a
 * posted URL at /cast/send, and hands the latest one to the app at /cast/poll.
 * No internet, no relay, no pairing code: anyone on the same network can send
 * a link, which is exactly the trust model of the SMB share itself.
 *
 * ES5 + XHR on purpose — safest on the Tizen 5.0 WebView.
 */
var UrlDrop = (function () {
    'use strict';

    var SVC = 'http://127.0.0.1:8127';

    function log(m) { if (typeof Debug !== 'undefined' && Debug.net) Debug.net('[url-drop] ' + m); }

    function enabled() {
        try { return typeof Settings === 'undefined' || Settings.get('castEnabled') !== false; }
        catch (e) { return true; }
    }
    /* Tell the service whether to accept links at all. */
    function setEnabled(on, cb) {
        cb = cb || function () {};
        var done = false;
        function finish(err) { if (done) return; done = true; cb(err || null); }
        try {
            var x = new XMLHttpRequest();
            x.open('POST', SVC + '/cast/set', true);
            x.timeout = 10000;
            x.setRequestHeader('Content-Type', 'application/json');
            x.onload = function () {
                var res;
                try { res = JSON.parse(x.responseText); } catch (e) {}
                if (x.status !== 200 || !res || !res.ok || res.on !== !!on)
                    return finish(new Error('casting setting rejected'));
                finish(null);
            };
            x.onerror = function () { finish(new Error('service unreachable')); };
            x.ontimeout = function () { finish(new Error('timeout')); };
            x.send(JSON.stringify({ on: !!on }));
        } catch (e) { finish(e); }
    }

    /* The pairing code key stays in Settings (urlDropCode) so an upgrade
     * from an older build doesn't drop the stored blob — but nothing reads
     * it any more: the LAN page needs no code. */

    function xhrGet(url, cb) {
        var done = false;
        function finish(err, text) { if (done) return; done = true; cb(err, text); }
        try {
            var x = new XMLHttpRequest();
            x.open('GET', url, true);
            x.timeout = 10000;
            x.onreadystatechange = function () {
                if (x.readyState !== 4) return;
                if (x.status >= 200 && x.status < 300) finish(null, x.responseText);
                else finish(new Error('HTTP ' + x.status));
            };
            x.ontimeout = function () { finish(new Error('timeout')); };
            x.onerror   = function () { finish(new Error('network')); };
            x.send();
        } catch (e) { finish(e); }
    }

    /* The LAN address the phone should open, plus the log page.  The service
     * knows the TV's own IP; asked once per Settings/Cast render. */
    function pageUrl(cb) {
        try {
            xhrGet(SVC + '/cast/info', function (err, text) {
                if (err) return cb(err);
                var obj = null;
                try { obj = JSON.parse(text); } catch (e) {}
                if (obj && obj.debug) debugPageUrl = String(obj.debug);
                cb(null, obj && obj.address ? String(obj.address) : null);
            });
        } catch (e) { cb(e); }
    }
    var debugPageUrl = '';

    /* Take the newest URL a phone posted, if any.  The service clears the
     * slot on read, so one pull delivers one link. */
    function fetchLatest(cb) {
        if (!enabled()) return cb(null, null);
        try {
            xhrGet(SVC + '/cast/poll', function (err, text) {
                if (err) return cb(err);
                var obj = null;
                try { obj = JSON.parse(text); } catch (e) {}
                cb(null, obj && obj.ok && obj.url ? String(obj.url).trim() : null);
            });
        } catch (e) { cb(e); }
    }

    return {
        pageUrl:     pageUrl,
        fetchLatest: fetchLatest,
        setEnabled:  setEnabled,
        get debugPageUrl() { return debugPageUrl; }
    };
})();
