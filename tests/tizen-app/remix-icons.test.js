'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var path = require('node:path');
var FileTypes = require('../../tizen-app/js/filetypes.js');
var ROOT = path.join(__dirname, '../../tizen-app');

test('every file icon is a bundled decorative SVG, including unknown kinds', function () {
    ['dir', 'video', 'audio', 'image', 'text', 'playlist', 'other', 'unknown', '__proto__', '"><script>'].forEach(function (kind) {
        var html = FileTypes.icon(kind);
        assert.match(html, /^<img class="remix-icon" src="assets\/remix\/[a-z0-9-]+\.svg" alt="">$/);
        var src = html.match(/src="([^"]+)"/)[1];
        assert.ok(fs.existsSync(path.join(ROOT, src)), src);
    });
});

test('static Remix references resolve to offline assets', function () {
    var sources = ['index.html', 'css/style.css'].concat(fs.readdirSync(path.join(ROOT, 'js')).map(function (name) { return 'js/' + name; }));
    sources.forEach(function (file) {
        var src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        var re = /assets\/remix\/([a-z0-9-]+\.svg)/g, match;
        while ((match = re.exec(src))) assert.ok(fs.existsSync(path.join(ROOT, 'assets/remix', match[1])), file + ': ' + match[1]);
    });
});

test('UI source and translations do not use font glyphs as icons', function () {
    var files = ['index.html', 'css/style.css'];
    ['js', 'i18n'].forEach(function (dir) {
        fs.readdirSync(path.join(ROOT, dir)).forEach(function (name) { files.push(dir + '/' + name); });
    });
    // Breadcrumb arrows and MP4's ©-prefixed atom identifiers are text, not icons.
    var icons = /[★☆♥♡♪♫♬♩▶◀►◄▸▾⋮⋯✓✔✕✖✗⚠⚙↻↩↑↓]|(?:(?![©®™])\p{Extended_Pictographic})/u;
    files.forEach(function (file) {
        var src = fs.readFileSync(path.join(ROOT, file), 'utf8')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '');
        assert.doesNotMatch(src, icons, file);
        assert.doesNotMatch(src, /class="(?:key|icon)"[^>]*>[^<]*[←→]/, file + ': arrow icon');
    });
});
