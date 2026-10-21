/* Tessel simulator — the decoder.
 *
 * Stands in for js/player.js: same interface the app calls, no AVPlay and no
 * real media.  It keeps a real clock and a real state machine (READY →
 * PLAYING → PAUSED → IDLE), reports tracks and subtitles, and paces itself so
 * the OSD, queue, seeking and speed behave as they do on a
 * TV. ES5, like the app. */
var Player = (function () {
    'use strict';

    var listeners = {};
    var status = 'IDLE';
    var time = 0;                 // ms
    var duration = 0;             // ms
    var speed = 1;
    var subtitleDelay = 0;
    var buffering = false;
    var lastBufferingAt = 0;
    var title = '';
    var openTimer = null;
    var tick = null;
    var cues = [];                // [{ start, end, text }]
    var activeCue = null;
    var externalSubs = [];        // sibling files the app handed over
    var selectedSub = -1;         // -1 = off, otherwise an external index
    var selectedAudio = 0;
    var timer = null;             // the interval driving progress
    var nextScene = 'default';    // one-shot harness state, never a playback preference

    function emit(name, value) { if (listeners[name]) listeners[name](value); }
    function progress() { emit('onprogress', { time: time, duration: duration }); }

    /* A file's length: the demo world knows the durations, and a URL we were
     * handed (a cast link, a stream) gets a plausible one. */
    function durationFor(url, name) {
        var base = String(name || url || '').split('/').pop().split('?')[0];
        if (typeof Simulator !== 'undefined' && Simulator.DURATIONS && Simulator.DURATIONS[base]) {
            return Simulator.DURATIONS[base];
        }
        if (/\.mp3$/i.test(base) || /audio/i.test(base)) return 240000;
        return 1800000;
    }

    function parseSrt(text) {
        var out = [], blocks = String(text || '').replace(/\r/g, '').split('\n\n');
        blocks.forEach(function (block) {
            var lines = block.split('\n').filter(function (l) { return l.trim(); });
            if (lines.length < 2) return;
            var m = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/.exec(lines[0]);
            if (!m) m = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/.exec(lines[1]);
            if (!m) return;
            var start = ((+m[1] * 3600) + (+m[2] * 60) + (+m[3])) * 1000 + (+m[4]);
            var end = ((+m[5] * 3600) + (+m[6] * 60) + (+m[7])) * 1000 + (+m[8]);
            var text = lines.slice(lines[0].indexOf('-->') >= 0 ? 1 : 2).join(' ');
            out.push({ start: start, end: end, text: text });
        });
        return out;
    }

    /* Read the sidecar the app passed in (a URL through the simulated
     * service, or a virtual file) and index its cues. */
    function loadExternalSubs(subs) {
        cues = [];
        externalSubs = subs || [];
        if (typeof Debug !== 'undefined') {
            Debug.player('simulator: ' + externalSubs.length + ' external subtitle(s) offered');
        }
        if (!externalSubs.length) { paintCue(null); return; }
        if (typeof Browser !== 'undefined' && Browser.readSubtitleText) {
            Browser.readSubtitleText(externalSubs[0], function (err, text) {
                if (err) {
                    if (typeof Debug !== 'undefined') Debug.error('simulator: external sub: ' + (err.message || err));
                    return;
                }
                cues = parseSrt(text);
                if (typeof Debug !== 'undefined') Debug.player('simulator: external sub loaded, ' + cues.length + ' cues');
            });
        }
    }

    function paintCue(cue) {
        var ov = document.getElementById('subtitle-overlay');
        if (!ov) return;
        if (!cue || selectedSub < 0) {
            ov.textContent = '';
            ov.classList.add('hidden');
            return;
        }
        ov.textContent = '';
        var line = document.createElement('span');
        line.className = 'sub-line';
        line.textContent = cue.text;
        ov.appendChild(line);
        ov.classList.remove('hidden');
    }

    function cueAt(ms) {
        if (!cues.length || selectedSub < 0) return null;
        var t = ms - subtitleDelay;
        for (var i = 0; i < cues.length; i++) {
            if (t >= cues[i].start && t <= cues[i].end) return cues[i];
        }
        return null;
    }

    function startClock() {
        clearInterval(timer);
        timer = setInterval(function () {
            if (status !== 'PLAYING' || buffering) return;
            time = Math.min(duration, time + 250 * speed);
            progress();
            var cue = cueAt(time);
            if ((cue && cue !== activeCue) || (!cue && activeCue)) {
                activeCue = cue;
                paintCue(cue);
            }
            if (time >= duration) {
                status = 'IDLE';
                clearInterval(timer);
                emit('onstatechange', 'idle');
                emit('oncomplete');
            }
        }, 250);
    }

    return {
        setDemoState: function (scene) { nextScene = /^(loading|buffering|error)$/.test(scene) ? scene : 'default'; },
        setListener: function (name, fn) { listeners[name] = fn; },

        open: function (url, opts) {
            opts = opts || {};
            var scene = nextScene; nextScene = 'default';
            clearInterval(timer);
            title = opts.title || url;
            duration = durationFor(url, opts.title);
            time = 0;
            speed = 1;
            subtitleDelay = 0;
            buffering = false;
            lastBufferingAt = 0;
            activeCue = null;
            selectedSub = externalSubs.length ? -1 : -1;
            selectedAudio = 0;
            status = 'READY';
            emit('onstatechange', 'ready');
            loadExternalSubs(opts.subtitles || []);
            if (typeof Debug !== 'undefined') Debug.player('simulator: open ' + title + ' (' + duration + ' ms)');
            /* A short, honest "opening" beat, then playback — the app's own
             * spinner and 20 s watchdog both see normal behaviour. */
            clearTimeout(openTimer);
            if (scene === 'loading') { buffering = true; lastBufferingAt = Date.now(); return; }
            openTimer = setTimeout(function () {
                if (scene === 'error') {
                    status = 'ERROR';
                    emit('onstatechange', 'error');
                    emit('onerror', 'Simulated playback failure. This preview does not test TV decoding.');
                    return;
                }
                status = 'PLAYING';
                emit('onstatechange', 'playing');
                if (scene === 'buffering') {
                    buffering = true; lastBufferingAt = Date.now(); emit('onbuffering', true);
                }
                startClock();
                progress();
            }, 350);
        },

        play: function () {
            if (status === 'PAUSED' || status === 'READY') {
                if (buffering) { buffering = false; emit('onbuffering', false); }
                status = 'PLAYING';
                emit('onstatechange', 'playing');
                startClock();
            }
        },
        pause: function () {
            if (status === 'PLAYING') {
                if (buffering) { buffering = false; emit('onbuffering', false); }
                status = 'PAUSED';
                emit('onstatechange', 'paused');
            }
        },
        togglePause: function () { if (status === 'PLAYING') this.pause(); else this.play(); },
        stop: function () {
            clearTimeout(openTimer);
            clearInterval(timer);
            status = 'IDLE';
            time = 0;
            buffering = false;
            activeCue = null;
            paintCue(null);
            emit('onstatechange', 'idle');
        },

        seekTo: function (ms, cb) {
            time = Math.max(0, Math.min(duration, +ms || 0));
            progress();
            var cue = cueAt(time);
            activeCue = cue;
            paintCue(cue);
            if (cb) setTimeout(cb, 120);
        },
        seekRel: function (delta, cb) { this.seekTo(time + (+delta || 0), cb); },
        currentTime: function () { return time; },
        duration:    function () { return duration; },
        state:       function () { return status; },

        getSpeed:     function () { return speed; },
        setSpeed:     function (rate) { speed = Math.max(0.25, Math.min(4, +rate)); return true; },
        isSpeedMuted: function () { return false; },

        isBuffering:      function () { return buffering; },
        lastBufferingMs:  function () { return lastBufferingAt; },

        getSubtitleDelay: function () { return subtitleDelay; },
        setSubtitleDelay: function (v) {
            subtitleDelay = Math.max(-60000, Math.min(60000, Math.round(v / 500) * 500));
            activeCue = cueAt(time);
            paintCue(activeCue);
            return true;
        },

        /* Tracks: a video file offers two audio tracks and the sidecar
         * subtitle; audio files offer one track and no subtitles. */
        getTracks: function () {
            var isAudio = /\.(mp3|flac|m4a|aac|ogg|opus|wav)$/i.test(title);
            var audio = isAudio
                ? [{ index: 0, name: 'Simulated stereo', lang: 'en', active: selectedAudio === 0 }]
                : [{ index: 0, name: 'English · AAC stereo', lang: 'en', active: selectedAudio === 0 },
                   { index: 1, name: 'Polish · AC3 5.1', lang: 'pl', active: selectedAudio === 1 }];
            var subtitle = [];
            if (!isAudio) {
                subtitle.push({ index: -1, name: 'Off', off: true, active: selectedSub < 0 });
                externalSubs.forEach(function (s, i) {
                    subtitle.push({ index: 'ext:' + i, name: s.name || ('Subtitle ' + (i + 1)),
                                    lang: s.lang || '', type: 'AVPLAY_EXTERNAL', sub: s,
                                    active: selectedSub === i });
                });
                if (!externalSubs.length) {
                    subtitle.push({ index: 0, name: 'English (embedded)', lang: 'en',
                                    type: 'AVPLAY_EMBED', avCurrent: false, active: false });
                }
            }
            return { audio: audio, subtitle: subtitle };
        },
        setAudioTrack: function (index) {
            selectedAudio = typeof index === 'number' ? index : 0;
            return true;
        },
        setSubtitleTrack: function (track) {
            if (typeof track !== 'object') { selectedSub = -1; activeCue = null; paintCue(null); return true; }
            if (track.off) { selectedSub = -1; activeCue = null; paintCue(null); return true; }
            if (typeof track.index === 'string' && track.index.indexOf('ext:') === 0) {
                selectedSub = parseInt(track.index.slice(4), 10) || 0;
                // The app may select a sidecar before its text has been read
                // (the preference is applied as soon as tracks exist), so the
                // cues are fetched from the track's own source when needed.
                if (!cues.length && track.sub) loadExternalSubs([track.sub]);
            } else if (externalSubs.length) {
                selectedSub = 0;
                if (!cues.length) loadExternalSubs([externalSubs[0]]);
            } else {
                /* No sidecar: the embedded track "paints" a sample cue, which
                 * is what the TV's own overlay would show. */
                selectedSub = 0;
                cues = cues.length ? cues : parseSrt(srtSample());
            }
            activeCue = cueAt(time);
            // A sidecar with no cue at this instant shows nothing, as on a TV.
            paintCue(activeCue || (externalSubs.length ? null : { text: 'Simulated subtitle cue' }));
            return true;
        },

        /* The INFO panel and the More menu read these. */
        describe: function () {
            var isAudio = /\.(mp3|flac|m4a|aac|ogg|opus|wav)$/i.test(title);
            return {
                container: isAudio ? 'MP3 (simulated)' : 'MP4 / MKV (simulated)',
                duration: duration,
                video: isAudio ? { codec: '', width: 0, height: 0, bitrate: 0 }
                               : { codec: 'H.264 High', width: 1920, height: 1080, bitrate: 8200000 },
                audio: isAudio ? ['Simulated stereo'] : ['English · AAC stereo', 'Polish · AC3 5.1'],
                subtitles: isAudio ? 0 : (externalSubs.length || 1),
                hdr: null
            };
        },
        getBackend: function () { return 'simulated'; },
        applyAspect: function () {},
        describeAspect: function () { return { mode: 'simulated' }; },
        setDisplayRect: function () {},
        headerSourceUri: function (uri) { return uri; }
    };

    function srtSample() {
        return ['1', '00:00:01,000 --> 00:00:04,000',
                'Simulated embedded subtitle — painted by the app.',
                '', '2', '00:00:05,000 --> 00:00:08,000',
                'It follows the same overlay path as a real track.', ''].join('\n');
    }
})();
