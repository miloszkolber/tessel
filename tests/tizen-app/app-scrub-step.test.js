'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var vm = require('node:vm');
var I18n = require('./helpers/i18n.js');

// The scrub acceleration curve and the option stepper are pure:
// Duration-aware seeking doubles at the 3rd, 6th, 12th… press within a
// bounded cap. Option steps stop at the ends rather than wrapping round.
function loadApp() {
    var context = {
        console: console,
        I18n: I18n,
        window: {},
        Playlist: { foldText: function (s) { return String(s || ''); } },
        document: { readyState: 'loading', addEventListener: function () {} },
        localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        setInterval: function () { return 0; }, clearInterval: function () {},
        setTimeout: function () { return 0; }, clearTimeout: function () {}
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../../tizen-app/js/app.js'), 'utf8'), context);
    return context.window.VlcApp;
}

test('base seek is 1% rounded to seconds and clamped to 1–15 seconds', function () {
    var step = loadApp().scrubStepSize;
    assert.equal(step(1, 90000), 1000);
    assert.equal(step(1, 240000), 2000);
    assert.equal(step(1, 600000), 6000);
    assert.equal(step(1, 1800000), 15000);
    assert.equal(step(1, 7200000), 15000);
    assert.equal(step(1, 500), 1000);
});

test('repeated seeking doubles at 3, 6, 12… and caps near 5% or 120 seconds', function () {
    var step = loadApp().scrubStepSize;
    assert.equal(step(2, 240000), 2000);
    assert.equal(step(3, 240000), 4000);
    assert.equal(step(5, 240000), 4000);
    assert.equal(step(6, 240000), 8000);
    assert.equal(step(12, 240000), 12000);
    assert.equal(step(48, 240000), 12000);
    assert.equal(step(12, 1800000), 90000);
    assert.equal(step(48, 7200000), 120000);
    assert.equal(step(1000000, 7200000), 120000);
});

test('unknown or invalid durations retain a fixed 15-second fallback', function () {
    var step = loadApp().scrubStepSize;
    [undefined, 0, -1, NaN, Infinity].forEach(function (duration) {
        assert.equal(step(1, duration), 15000);
        assert.equal(step(48, duration), 15000);
    });
});

test('option steps stop at the ends instead of wrapping round', function () {
    var step = loadApp().stepList;
    var list = ['0.5', '1', '2'];
    assert.equal(step('0.5', list, -1), '0.5');
    assert.equal(step('2', list, 1), '2');
    assert.equal(step('1', list, 1), '2');
    assert.equal(step('1', list, -1), '0.5');
    assert.equal(step('missing', list, 1), '0.5');
    assert.equal(step('missing', list, -1), '2');
});
