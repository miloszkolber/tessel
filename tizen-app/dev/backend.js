/* Development-only simulated decoder. UI, focus, menus and remote routing are real. */
var Player = (function () {
    var listeners = {}, time = 754000, duration = 2154000, status = 'IDLE', speed = 1, audio = 0, subtitle = -1, delay = 0;
    // The harness passes page+state; the decoder only cares which scene it is.
    var pq = new URLSearchParams(location.search);
    var pageName = pq.get('page') || '';
    var stateName = pq.get('state') || '';
    var scene = (pageName === 'audio' || stateName === 'audio') ? 'audio'
              : (stateName === 'loading' || stateName === 'buffering') ? stateName
              : (pageName ? 'video' : (stateName || 'video'));
    var buffering = scene === 'loading' || scene === 'buffering';
    function emit(name, value) { if (listeners[name]) listeners[name](value); }
    function progress() { emit('onprogress', { time: time, duration: duration }); }
    function play() { status = 'PLAYING'; emit('onstatechange', 'playing'); }
    function pause() { status = 'PAUSED'; emit('onstatechange', 'paused'); }
    function seekTo(value) { time = Math.max(0, Math.min(duration, value)); progress(); }
    setInterval(function () { if (status === 'PLAYING' && !buffering) seekTo((time + 500 * speed) % duration); }, 500);
    return {
        setListener: function (name, fn) { listeners[name] = fn; },
        open: function () {
            duration = scene === 'audio' ? 240000 : 2154000;
            time = scene === 'audio' ? 62000 : scene === 'loading' ? 0 : 754000;
            delay = 0;
            if (scene === 'loading') { status = 'READY'; return; }
            play(); progress();
            if (buffering) emit('onbuffering', true);
        },
        getSubtitleDelay: function () { return delay; },
        setSubtitleDelay: function (value) { delay = Math.max(-60000, Math.min(60000, Math.round(value / 500) * 500)); return true; },
        stop: function () {
            status = 'IDLE';
            var ov = document.getElementById('subtitle-overlay');
            if (ov) { ov.textContent = ''; ov.classList.add('hidden'); }
        },
        play: play, pause: pause,
        togglePause: function () { if (status === 'PLAYING') pause(); else play(); },
        seekTo: seekTo, seekRel: function (delta) { seekTo(time + delta); },
        state: function () { return status; }, currentTime: function () { return time; }, duration: function () { return duration; },
        getSpeed: function () { return speed; }, setSpeed: function (value) { speed = Number(value); return true; },
        isSpeedMuted: function () { return false; }, isBuffering: function () { return buffering; },
        getBackend: function () { return 'preview'; },
        setDisplayRect: function () {}, applyAspect: function () {},
        describeAspect: function () { return { noop: false }; },
        describe: function () { return { video: scene === 'audio' ? {} : { codec: 'H.264 (simulated)', width: 1920, height: 1080, bitrate: 8200000 }, audio: ['AAC stereo (simulated)'], subtitles: scene === 'audio' ? 0 : 1, duration: duration, container: 'Preview fixture' }; },
        getTracks: function () { return {
            audio: scene === 'audio' ? [{ index: 0, name: 'AAC stereo', lang: 'en', active: true }] : [{ index: 0, name: 'English · AAC stereo', lang: 'en', active: audio === 0 }, { index: 1, name: 'Polish · AAC stereo', lang: 'pl', active: audio === 1 }],
            subtitle: scene === 'audio' ? [] : [{ index: -1, name: I18n.t('common.off'), off: true, active: subtitle === -1 }, { index: 0, name: 'English · preview subtitle', lang: 'en', active: subtitle === 0 }]
        }; },
        setAudioTrack: function (index) { audio = index; },
        setSubtitleTrack: function (track) {
            if (typeof track !== 'object') track = { index: track, off: track === -1 };
            subtitle = track.index;
            // Mirror the production overlay structure (a .sub-line span),
            // which the subtitle-appearance CSS targets.
            var ov = document.getElementById('subtitle-overlay');
            ov.textContent = '';
            if (!track.off) {
                var line = document.createElement('span');
                line.className = 'sub-line';
                line.textContent = 'This is a preview subtitle.';
                ov.appendChild(line);
            }
            ov.classList.toggle('hidden', !!track.off);
            return true;
        }
    };
})();
