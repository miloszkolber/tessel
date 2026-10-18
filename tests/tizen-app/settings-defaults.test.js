'use strict';

var assert = require('assert');
var test   = require('node:test');
var fs     = require('fs');
var vm     = require('vm');
var path   = require('path');

var SRC = fs.readFileSync(
    path.join(__dirname, '../../tizen-app/js/settings.js'), 'utf8');

/* settings.js reads localStorage as it loads; hand it a stored blob (or
 * none) and get the Settings object back. */
function loadSettings(stored) {
    var store = {};
    if (stored) store['vlctv_settings_v1'] = JSON.stringify(stored);
    var sandbox = {
        module: { exports: {} },
        localStorage: {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
            setItem: function (k, v) { store[k] = String(v); }
        },
        navigator: { userAgent: 'test' },
        document:  { createElement: function () { return { canPlayType: function () { return ''; } }; } }
    };
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox);
    return sandbox.module.exports.Settings;
}

test('a fresh install plays the next file automatically (issue #126)', function () {
    var s = loadSettings(null);
    assert.strictEqual(s.get('autoPlay'), true);
});

test('a TV that had auto-play switched off keeps it off', function () {
    var s = loadSettings({ autoPlay: false, repeatMode: 'off' });
    assert.strictEqual(s.get('autoPlay'), false);
});

test('the chosen network source survives the next launch', function () {
    // load() rebuilds the cache from the defaults, so a key missing there is
    // dropped and the Network page forgets which source is in use.
    assert.strictEqual(loadSettings(null).get('networkMethod'), '');
    assert.strictEqual(loadSettings({ networkMethod: 'webdav' }).get('networkMethod'), 'webdav');
});

test('the pinned media server survives the next launch', function () {
    // Same rule: an unlisted key is dropped, and DLNA would offer the whole
    // server list again on every visit.
    assert.strictEqual(loadSettings(null).get('dlnaServer'), '');
    assert.strictEqual(loadSettings({ dlnaServer: 'demo-minidlna' }).get('dlnaServer'), 'demo-minidlna');
});
