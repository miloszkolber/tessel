'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var source = fs.readFileSync(path.join(__dirname, '../../tizen-app/js/app.js'), 'utf8');
var start = source.indexOf('    function scrollSettingsIfNoFocusMove(');
var end = source.indexOf('    /* ── Helpers', start);
assert.ok(start >= 0 && end > start);

function run(options) {
    var revealed = [], scrolled = [];
    var focused = {
        getBoundingClientRect: function () { return options.bounds || { top: 350, bottom: 600 }; },
        scrollIntoView: function (value) { revealed.push(value); }
    };
    var container = {
        querySelector: function () { return focused; },
        getBoundingClientRect: function () { return { top: 300, bottom: 950 }; },
        scrollBy: function (value) { scrolled.push(value); }
    };
    vm.runInNewContext(source.slice(start, end) + '\nscrollSettingsIfNoFocusMove(200, "down");', {
        UI: { moveFocus: function () { return !!options.moved; } },
        window: { matchMedia: function () { return { matches: !!options.reduced }; } },
        document: { querySelector: function () { return container; } }
    });
    return { revealed: revealed, scrolled: scrolled };
}

test('settings recovers an offscreen focus target before another scroll interrupts it', function () {
    [{ top: 1600, bottom: 1930 }, { top: 0, bottom: 200 }].forEach(function (bounds) {
        var result = run({ bounds: bounds });
        assert.equal(result.scrolled.length, 0, 'no competing manual smooth scroll');
        assert.equal(result.revealed.length, 1);
        assert.equal(result.revealed[0].behavior, 'auto');
        assert.equal(result.revealed[0].block, 'nearest');
    });
});

test('settings manual scrolling honours reduced motion and leaves normal focus movement alone', function () {
    [false, true].forEach(function (reduced) {
        var result = run({ reduced: reduced });
        assert.equal(result.revealed.length, 0);
        assert.equal(result.scrolled[0].top, 200);
        assert.equal(result.scrolled[0].behavior, reduced ? 'auto' : 'smooth');
    });
    var moved = run({ moved: true });
    assert.equal(moved.revealed.length + moved.scrolled.length, 0);
});
