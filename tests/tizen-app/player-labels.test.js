'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var ROOT = path.join(__dirname, '../../tizen-app');

test('subtitle positions follow their spatial order without changing the saved default', function () {
    var context = {
        module: { exports: {} },
        localStorage: { getItem: function () { return null; } }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8'), context);
    var helpers = context.module.exports;
    assert.equal(helpers.SubtitleStyle.forPosition().map(function (p) { return p.code; }).join(','), 'top,middle,bottom');
    assert.equal(helpers.Settings.get('subtitlePosition'), 'bottom');
});

test('every locale supplies playback subtitle labels and concise background states', function () {
    var keys = ['tracks.subtitlesTitle', 'sync.title', 'sync.reset',
        'settings.subSize', 'settings.subFont', 'settings.subPosition', 'settings.subBg'];
    fs.readdirSync(path.join(ROOT, 'i18n')).filter(function (f) { return /\.json$/.test(f); }).forEach(function (file) {
        var strings = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', file), 'utf8'));
        keys.forEach(function (key) {
            assert.equal(typeof strings[key], 'string', file + ': ' + key);
            assert.ok(strings[key].trim(), file + ': empty ' + key);
        });
        assert.equal(strings['sub.bg.none'], strings['common.off'], file + ': background Off');
        assert.equal(strings['sub.bg.box'], strings['common.on'], file + ': background On');
    });
});
