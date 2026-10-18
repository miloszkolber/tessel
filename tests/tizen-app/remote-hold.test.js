var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
function fixture() {
    var handlers = {}, timers = [], activations = 0, contexts = 0;
    var target = { tagName: 'BUTTON', closest: function () { return null; }, __context: function () { contexts++; } };
    var document = { activeElement: target, addEventListener: function () {} };
    var scope = { document: document, window: { addEventListener: function (k, fn) { handlers[k] = fn; } },
        setTimeout: function (fn) { timers.push(fn); return fn; }, clearTimeout: function (fn) { timers = timers.filter(function (t) { return t !== fn; }); } };
    vm.runInNewContext(fs.readFileSync('tizen-app/js/remote.js', 'utf8'), scope);
    scope.Remote.init(); scope.Remote.push(function (code) { if (code === 13) activations++; return true; });
    function event(name, code) { handlers[name]({ keyCode: code || 13, preventDefault: function () {}, stopPropagation: function () {} }); }
    return { event: event, fire: function () { var pending = timers; timers = []; pending.forEach(function (fn) { fn(); }); },
        counts: function () { return [activations, contexts]; }, remote: scope.Remote, doc: document };
}
test('short OK activates once on release and ignores repeated keydowns', function () {
    var f = fixture(); f.event('keydown'); f.event('keydown'); assert.deepEqual(f.counts(), [0, 0]);
    f.event('keyup'); assert.deepEqual(f.counts(), [1, 0]); f.fire(); assert.deepEqual(f.counts(), [1, 0]);
});
test('hold opens once and releasing over the menu never activates', function () {
    var f = fixture(); f.event('keydown'); f.fire(); f.event('keydown'); f.event('keyup');
    assert.deepEqual(f.counts(), [0, 1]);
});
test('view cancellation, changed focus and blur cannot open a stale context', function () {
    var f = fixture(); f.event('keydown'); f.remote.cancelHold(); f.fire(); f.event('keyup'); assert.deepEqual(f.counts(), [0, 0]);
    f.event('keydown'); f.doc.activeElement = {}; f.fire(); f.event('keyup'); assert.deepEqual(f.counts(), [0, 0]);
    f = fixture(); f.event('keydown'); f.event('blur'); f.fire(); assert.deepEqual(f.counts(), [0, 0]);
    f.event('keydown'); f.event('keyup'); assert.deepEqual(f.counts(), [1, 0]);
});
