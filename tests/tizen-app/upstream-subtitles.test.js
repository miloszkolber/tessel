'use strict';

var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
var AssStyle = require('../../tizen-app/js/ass-style.js');
var LanguageList = require('../../tizen-app/js/settings.js').LanguageList;
var TextDecode = require('../../tizen-app/js/text-decode.js');
var context = { module: { exports: {} }, AssStyle: AssStyle };
vm.createContext(context);
vm.runInContext(fs.readFileSync('tizen-app/js/player.js', 'utf8'), context);
var parsers = context.module.exports;

test('TXT parsers honor MicroDVD FPS, MPL2 tenths and TMPlayer multiline/open ends', function () {
    var cues = parsers.parseTxtCues('{1}{1}25\n{125}{200}{y:i}Hello|world\n{250}{}Next\n{400}{450}End');
    assert.equal(cues[0].start, 5); assert.equal(cues[0].end, 8); assert.equal(cues[0].text, 'Hello\nworld');
    assert.equal(cues[1].end, 14);
    cues = parsers.parseTxtCues('[12][38]/First|second\n[40][]Third');
    assert.equal(cues[0].start, 1.2); assert.equal(cues[0].end, 3.8); assert.equal(cues[0].text, 'First\nsecond');
    cues = parsers.parseTxtCues('00:00:05,1:One\n00:00:05,2:Two\n00:00:07:Next');
    assert.equal(cues[0].text, 'One\nTwo'); assert.equal(cues[0].end, 7); assert.equal(cues[1].end, 11);
    assert.equal(parsers.parseTxtCues('notes for the film').length, 0);
    assert.equal(parsers.parseTxtCues('1\n00:00:01,000 --> 00:00:02,000\nRenamed SRT')[0].text, 'Renamed SRT');
});

test('ASS positioning honors style and inline overrides without positioning literal dialogue', function () {
    var ass = '[V4+ Styles]\nFormat: Name, Alignment\nStyle: Default,2\nStyle: Sign,7\n[Events]\nFormat: Start, End, Style, Text\n' +
        'Dialogue: 0:00:01.00,0:00:04.00,Sign,Top sign\n' +
        'Dialogue: 0:00:02.00,0:00:03.00,Default,Dialogue\n' +
        'Dialogue: 0:00:02.00,0:00:03.00,Default,{\\an6}Right';
    var cues = parsers.parseAssCues(ass);
    assert.equal(cues.length, 3); assert.equal(cues[0].band, 'top'); assert.equal(cues[0].halign, 'left');
    assert.equal(cues[1].band, null); assert.equal(cues[2].band, 'middle'); assert.equal(cues[2].halign, 'right');
    assert.equal(AssStyle.inlineAlignment('literal \\an8 outside tags'), null);
    assert.equal(AssStyle.ssaToNumpad(6), 8);
});

test('automatic sidecars prefer app language before untagged or sole fallback', function () {
    var plain = { lang: '' }, english = { lang: 'eng' }, polish = { lang: 'pl' };
    assert.equal(LanguageList.pickAutoSubtitle([plain, english], 'en-US'), english);
    assert.equal(LanguageList.pickAutoSubtitle([plain, polish], 'en'), plain);
    assert.equal(LanguageList.pickAutoSubtitle([polish], 'en'), polish);
    assert.equal(LanguageList.pickAutoSubtitle([polish, english], 'de'), null);
    assert.equal(LanguageList.pickAutoSubtitle([], 'en'), null);
});

test('subtitle byte reader decodes legacy Western text, rejects oversized input and closes readers', function () {
    var text = 'N\xe3o sei por qu\xea voc\xea est\xe1 aqui. N\xe3o h\xe1 raz\xe3o para isso. A\xe7\xe3o e emo\xe7\xe3o.', bytes = Uint8Array.from(Buffer.from(text, 'latin1'));
    var closed = 0, streamed = 0, calls = 0, size = bytes.length;
    var ctx = { TextDecode: TextDecode, FileTypes: require('../../tizen-app/js/filetypes.js'), Uint8Array: Uint8Array,
        Mp4Subs: { openReader: function (src, cb) { cb(null, {
            getSize: function (done) { done(null, size); },
            readRange: function (offset, len, done) { done(null, bytes.buffer); }, close: function () { closed++; }
        }); } }
    };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync('tizen-app/js/browser.js', 'utf8'), ctx);
    var file = { openStream: function () { streamed++; } };
    ctx.Browser.readSubtitleText({ file: file }, function (err, actual) { assert.ifError(err); calls++; assert.equal(actual, text); });
    assert.equal(calls, 1); assert.equal(closed, 1); assert.equal(streamed, 0);
    size = 32 * 1024 * 1024;
    ctx.Browser.readSubtitleText({ file: file }, function (err) { assert.match(err.message, /too large/); calls++; });
    assert.equal(calls, 2); assert.equal(closed, 2);
});

test('Central European page hints do not misclassify ordinary Western accents', function () {
    var polish1250 = [0xA5, 0xB9, 0x8C, 0x9C, 0x8F, 0x9F, 0xA3, 0xB3];
    var polish8859 = [0xA6, 0xB6, 0xAC, 0xBC, 0xB1, 0xB3];
    assert.equal(TextDecode.decode(polish1250).encoding, 'WINDOWS-1250');
    assert.equal(TextDecode.decode(polish8859).encoding, 'ISO-8859-2');
    var western = Buffer.from('Je pr\xe9f\xe8re les films fran\xe7ais et les soir\xe9es tranquilles, avec du caf\xe9.', 'latin1');
    assert.equal(TextDecode.decode(western).encoding, 'WINDOWS-1252');
});

test('HTTP subtitle reads reject oversized and truncated replies without a fallback download', function () {
    function run(mode) {
        var requests = 0, aborted = 0, calls = 0, error;
        var ctx = { TextDecode: TextDecode, Uint8Array: Uint8Array, ArrayBuffer: ArrayBuffer,
            XMLHttpRequest: function () {
                requests++;
                this.open = function () {}; this.setRequestHeader = function () {};
                this.abort = function () { aborted++; if (this.onerror) this.onerror(); };
                this.getResponseHeader = function () { return 'bytes 0-19/20'; };
                this.send = function () {
                    if (mode === 'large') {
                        this.onprogress({ loaded: 17 * 1024 * 1024 });
                    } else {
                        this.status = 206; this.response = Uint8Array.from([65, 66, 67]).buffer; this.onload();
                    }
                };
            }
        };
        vm.createContext(ctx); vm.runInContext(fs.readFileSync('tizen-app/js/browser.js', 'utf8'), ctx);
        ctx.Browser.readSubtitleText({ uri: 'https://media/sub.srt' }, function (err) { calls++; error = err; });
        assert.equal(requests, 1); assert.equal(calls, 1);
        assert.match(error.message, mode === 'large' ? /too large/ : /truncated/);
        assert.equal(aborted, mode === 'large' ? 1 : 0);
    }
    run('large'); run('truncated');
});

test('missing byte readers retain USB UTF-8 fallback and fullPath resolution with one callback', function () {
    var calls = 0, closed = 0, path;
    var file = { openStream: function (mode, cb) { cb({ bytesAvailable: 5, read: function () { return 'Hello'; }, close: function () { closed++; } }); } };
    var ctx = { TextDecode: TextDecode, tizen: { filesystem: { resolve: function (value, cb) { path = value; cb(file); cb(file); } } } };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync('tizen-app/js/browser.js', 'utf8'), ctx);
    ctx.Browser.readSubtitleText({ fullPath: '/drive/film.srt' }, function (err, text) { assert.ifError(err); assert.equal(text, 'Hello'); calls++; });
    assert.equal(path, '/drive/film.srt'); assert.equal(calls, 1); assert.ok(closed >= 1);
});
