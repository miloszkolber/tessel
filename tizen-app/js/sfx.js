/* sfx.js — short interface ticks, synthesized in the WebView.
 *
 * APL-inspired feedback: a quiet high tick for a focus move, a two-step
 * click for activation and a lower tick for Back.  Nothing is downloaded:
 * a 40–70 ms oscillator envelope is enough, and an unavailable WebAudio
 * context (older firmware) simply stays silent.  The Settings switch turns
 * the whole module off immediately.
 */
var Sfx = (function () {
    'use strict';
    var ctx = null, enabled = null;

    function wanted() {
        if (enabled === null) {
            try { enabled = Settings.get('uiSounds') !== false; } catch (e) { enabled = true; }
        }
        return enabled;
    }
    function audio() {
        if (!wanted()) return null;
        try {
            if (!ctx) {
                var Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor) return null;
                ctx = new Ctor();
            }
            if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
            return ctx;
        } catch (e) { return null; }
    }
    function blip(freq, seconds, volume) {
        var c = audio();
        if (!c) return;
        try {
            var osc = c.createOscillator(), gain = c.createGain(), t = c.currentTime;
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
            osc.connect(gain); gain.connect(c.destination);
            osc.start(t); osc.stop(t + seconds + 0.02);
        } catch (e) {}
    }
    function move() { blip(1320, 0.045, 0.035); }
    function select() {
        blip(760, 0.055, 0.05);
        setTimeout(function () { blip(1180, 0.07, 0.04); }, 45);
    }
    function back() { blip(520, 0.06, 0.04); }
    function setEnabled(on) {
        enabled = !!on;
        if (!enabled && ctx && ctx.suspend) { try { ctx.suspend(); } catch (e) {} }
        if (enabled) move();
    }
    /* A settings change elsewhere (or the TV restoring preferences) picks up
     * the stored value again on the next sound. */
    function refresh() { enabled = null; }

    return { move: move, select: select, back: back, setEnabled: setEnabled, refresh: refresh };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Sfx;
