/* What a file in a USB or SMB listing is, going by its extension, and so
 * what opens it: the player (video, audio), the picture viewer (image), the
 * text viewer (text, which takes in subtitle files too), or the playlist
 * reader (playlist).  Anything else is 'other' and is only listed.
 *
 * Images are the formats the TV's browser engine decodes itself.  HEIC and
 * TIFF are left out on purpose: Chromium can't show them, and listing them
 * as pictures would only lead to a broken image. */

var FileTypes = (function () {
    var KINDS = {
        video:    ['mp4', 'm4v', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'ts', 'm2ts',
                   'mpg', 'mpeg', '3gp', 'mpd'],
        audio:    ['mp3', 'aac', 'flac', 'wav', 'ogg', 'oga', 'm4a', 'wma', 'opus'],
        image:    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
        text:     ['txt', 'log', 'nfo', 'md', 'srt', 'vtt', 'ass', 'ssa', 'smi', 'sami', 'sub',
                   'json', 'xml', 'csv', 'ini', 'cfg', 'conf', 'yml', 'yaml'],
        playlist: ['m3u', 'm3u8', 'pls']
    };
    var byExt = {};
    Object.keys(KINDS).forEach(function (k) {
        KINDS[k].forEach(function (e) { byExt[e] = k; });
    });

    function ext(name) {
        var s = String(name || '');
        var slash = s.lastIndexOf('/');
        if (slash >= 0) s = s.slice(slash + 1);
        var dot = s.lastIndexOf('.');
        return dot < 0 ? '' : s.slice(dot + 1).toLowerCase();
    }

    /* 'video' | 'audio' | 'image' | 'text' | 'playlist' | 'other' */
    function kind(name) { return byExt[ext(name)] || 'other'; }

    /* Goes to the player, and so into the folder's next / prev list. */
    function isPlayable(name) {
        var k = kind(name);
        return k === 'video' || k === 'audio';
    }

    function subtitleStem(name) { return String(name).replace(/\.[^.]+$/, '').toLowerCase(); }
    function subtitleMatches(media, subtitle) {
        var base = subtitleStem(media), candidate = subtitleStem(subtitle);
        if (candidate === base || candidate.indexOf(base + '.') === 0) return true;
        // Also accept common Movie_en, Movie-eng and Movie en sidecars, but
        // do not attach another numbered episode such as Movie-2.srt.
        if (candidate.indexOf(base) !== 0) return false;
        return /^[ _-][a-z]{2,3}(?:-[a-z]{2})?(?:[._ -](?:forced|sdh|cc|default))*$/.test(candidate.slice(base.length));
    }
    function subtitleLanguage(name) {
        var m = /[._ -]([a-z]{2,3}(?:-[a-z]{2})?)(?:[._ -](?:forced|sdh|cc|default))*$/i.exec(subtitleStem(name));
        return m ? m[1].toLowerCase() : '';
    }

    /* The picture in a music folder that stands for the album, by the names
     * music players look for (cover.jpg, folder.jpg, front.png, Windows
     * Media Player's AlbumArt_….jpg …), best first.  names: the folder's file
     * names.  Returns one of them, or null. */
    var ART_NAMES = ['cover', 'folder', 'front', 'album', 'albumart'];
    function folderArt(names) {
        var best = null, bestRank = Infinity;
        for (var i = 0; i < (names || []).length; i++) {
            var n = String(names[i]);
            if (kind(n) !== 'image') continue;
            var base = n.slice(0, n.lastIndexOf('.')).toLowerCase();
            var rank = ART_NAMES.indexOf(base);
            if (rank < 0 && /^albumart/.test(base)) rank = ART_NAMES.length + (/large$/.test(base) ? 0 : 1);
            if (rank >= 0 && rank < bestRank) { bestRank = rank; best = n; }
        }
        return best;
    }

    var ICONS = { dir: 'folder-fill', video: 'file-video-fill', audio: 'file-music-fill', image: 'image-fill', text: 'file-text-fill', playlist: 'play-list-fill', other: 'file-line' };
    // Trusted markup from a fixed map, never a filename supplied by a server.
    function icon(k) {
        var name = Object.prototype.hasOwnProperty.call(ICONS, k) ? ICONS[k] : ICONS.other;
        return '<img class="remix-icon" src="assets/remix/' + name + '.svg" alt="">';
    }

    return { ext: ext, kind: kind, isPlayable: isPlayable, folderArt: folderArt, icon: icon,
        subtitleMatches: subtitleMatches, subtitleLanguage: subtitleLanguage };
})();

// Ignored by the Tizen/browser build; lets Node tests drive the module.
if (typeof module !== 'undefined' && module.exports) module.exports = FileTypes;
