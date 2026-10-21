'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var ROOT = path.join(__dirname, '../../tizen-app');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

/* A small focus/DOM boundary fixture, not a renderer. The same flows are
 * checked in Chromium for geometry, actual key dispatch and the CSS cascade. */
function harness(nested, player) {
    var document = { activeElement: null }, events = {}, listeners = [], picked = [];
    function descendants(node) {
        return node.children.reduce(function (all, child) { return all.concat(child, descendants(child)); }, []);
    }
    function Element(tag) {
        var self = this, classes = {}, text = '';
        this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attributes = {}; this.handlers = {};
        this.classList = {
            add: function (name) { classes[name] = true; }, remove: function () { Array.from(arguments).forEach(function (name) { delete classes[name]; }); },
            contains: function (name) { return !!classes[name]; },
            toggle: function (name, on) { classes[name] = on === undefined ? !classes[name] : on; }
        };
        this.setAttribute = function (key, value) { self.attributes[key] = String(value); };
        this.getAttribute = function (key) { return self.attributes[key] === undefined ? null : self.attributes[key]; };
        this.contains = function (node) { return node === self || descendants(self).indexOf(node) >= 0; };
        this.appendChild = function (node) {
            if (node.parentNode) node.parentNode.removeChild(node);
            self.children.push(node); node.parentNode = self; return node;
        };
        this.removeChild = function (node) { self.children.splice(self.children.indexOf(node), 1); node.parentNode = null; };
        this.insertBefore = function (node, next) {
            if (node.parentNode) node.parentNode.removeChild(node);
            var at = self.children.indexOf(next);
            self.children.splice(at < 0 ? self.children.length : at, 0, node); node.parentNode = self;
        };
        Object.defineProperty(this, 'nextSibling', { get: function () {
            if (!self.parentNode) return null;
            return self.parentNode.children[self.parentNode.children.indexOf(self) + 1] || null;
        } });
        Object.defineProperty(this, 'nextElementSibling', { get: function () { return self.nextSibling; } });
        Object.defineProperty(this, 'previousElementSibling', { get: function () {
            return self.parentNode ? self.parentNode.children[self.parentNode.children.indexOf(self) - 1] || null : null;
        } });
        this.closest = function (selector) {
            var node = self;
            while (node) {
                if (selector === '.hidden' ? node.classList.contains('hidden') : /BUTTON|INPUT/.test(node.tagName) || node.tabIndex === 0) return node;
                node = node.parentNode;
            }
            return null;
        };
        this.querySelectorAll = function (selector) {
            return descendants(self).filter(function (node) {
                if (selector === '.focused' || selector === '.view' || selector === '.active') return node.classList.contains(selector.slice(1));
                if (selector === '[data-focus]') return node.getAttribute('data-focus') !== null;
                return node.tagName === 'BUTTON' || node.tagName === 'INPUT' || node.tabIndex === 0;
            });
        };
        this.querySelector = function (selector) { return self.querySelectorAll(selector)[0] || null; };
        this.getBoundingClientRect = function () {
            if (self.rect) return self.rect;
            var at = self.parentNode ? self.parentNode.children.indexOf(self) : 0;
            return { left: 0, right: 460, width: 460, top: at * 80, bottom: at * 80 + 78, height: 78 };
        };
        this.scrollIntoView = function () { self.scrolls = (self.scrolls || 0) + 1; };
        this.focus = function () {
            document.activeElement = self;
            (events.focusin || []).forEach(function (fn) { fn({ target: self }); });
        };
        this.blur = function () { document.activeElement = document.body; };
        this.addEventListener = function (type, fn) { self.handlers[type] = fn; };
        this.click = function () { if (self.handlers.click) self.handlers.click(); };
        Object.defineProperty(this, 'textContent', {
            get: function () { return self.children.length ? self.children.map(function (c) { return c.textContent; }).join('') : text; },
            set: function (value) { text = String(value); self.children = []; }
        });
        Object.defineProperty(this, 'offsetParent', { get: function () { return self.closest('.hidden') ? null : self.parentNode; } });
        Object.defineProperty(this, 'innerHTML', { set: function () { self.children.forEach(function (c) { c.parentNode = null; }); self.children = []; } });
    }
    document.body = new Element('body'); document.activeElement = document.body;
    document.createElement = function (tag) { return new Element(tag); };
    document.getElementById = function (id) { return descendants(document.body).filter(function (el) { return el.id === id; })[0] || null; };
    document.querySelectorAll = function (selector) { return document.body.querySelectorAll(selector); };
    document.querySelector = function (selector) {
        if (selector[0] === '#') {
            var split = selector.indexOf(' '), root = document.getElementById(selector.slice(1, split));
            return root && root.querySelector(selector.indexOf('.active') >= 0 ? '.active' : selector.slice(split + 1));
        }
        return document.body.querySelector(selector);
    };
    document.addEventListener = function (type, fn) { (events[type] || (events[type] = [])).push(fn); };
    document.removeEventListener = function (type, fn) { events[type].splice(events[type].indexOf(fn), 1); };
    var view = document.body.appendChild(new Element('section')); view.id = 'view-settings'; view.classList.add('view');
    var origin = view.appendChild(new Element('button')); origin.textContent = 'Language';
    origin.setAttribute('aria-controls', 'picker'); origin.rect = { top: 294, bottom: 372, right: 2379 };
    var panel = document.body.appendChild(new Element('div')); panel.id = 'picker'; panel.classList.add('hidden');
    var title = panel.appendChild(new Element('h2')); title.id = 'picker-title';
    var list = panel.appendChild(new Element('ul')); list.id = 'picker-options';
    var cancel = panel.appendChild(new Element('button')); cancel.textContent = 'Cancel';
    var context = {
        document: document, window: { innerWidth: 3029, innerHeight: 1704, matchMedia: function () { return { matches: true }; } },
        state: { view: player ? 'player' : 'settings' }, playerPopupReturn: player ? 'more' : null,
        returnPlayerPopup: function () { origin.focus(); },
        Remote: {
            KEY: { TAB: 9, ENTER: 13, BACK: 10009, UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, IME_CANCEL: 65385 },
            push: function (fn) { listeners.unshift(fn); return fn; },
            pop: function (fn) { listeners.splice(listeners.indexOf(fn), 1); }
        }
    };
    vm.createContext(context); vm.runInContext(read('js/ui.js'), context);
    context.UI.showView('view-settings');
    if (nested) {
        var dialog = document.body.appendChild(new Element('div')); dialog.id = 'library-modal';
        dialog.appendChild(origin); origin.focus();
        listeners.push(function () { throw new Error('the underlying dialog stole a picker key'); });
    }
    var app = read('js/app.js'), start = app.indexOf('    var pickerSetting = null;'), end = app.indexOf("    /* The app's own language", start);
    assert.ok(start >= 0 && end > start);
    var label = app.indexOf('    function labelOption(');
    vm.runInContext(app.slice(label, app.indexOf('    var cardLevel =', label)), context);
    vm.runInContext(app.slice(start, end), context);
    return { context: context, document: document, view: view, origin: origin, panel: panel, list: list, listeners: listeners,
        open: function (callback, anchor) {
            context.openPicker('Choose', [{ code: 'a', name: 'First' }, { code: 'b', name: 'Second' }], 'a', callback || function (code) { picked.push(code); }, anchor ? origin : null);
        },
        key: function (code, shift) { return listeners[0](code, { shiftKey: !!shift }); },
        clickOutside: function (target) { (events.click || []).slice().forEach(function (fn) { fn({ target: target }); }); },
        picked: picked
    };
}

test('a picker owns arrow/Tab navigation above a dialog and restores its trigger on Back', function () {
    var h = harness(true); h.open();
    assert.equal(h.document.activeElement.textContent, 'First');
    assert.equal(h.key(40), true);
    assert.equal(h.document.activeElement.textContent, 'Second');
    h.key(9, true);
    assert.equal(h.document.activeElement.textContent, 'First');
    h.key(10009);
    assert.ok(h.panel.classList.contains('hidden'));
    assert.equal(h.document.activeElement, h.origin);
    assert.equal(h.listeners.length, 1, 'only the underlying key owner remains');
    assert.equal(h.origin.getAttribute('aria-expanded'), 'false');
});

test('picker selection preserves callback-directed focus and updates live-choice semantics', function () {
    var h = harness(false);
    var next = h.view.appendChild(h.document.createElement('button'));
    h.open(function () { next.focus(); }); h.list.children[1].click();
    assert.equal(h.document.activeElement, next, 'do not overwrite the focus chosen by a mutation callback');
    assert.ok(next.classList.contains('focused'), 'native callback focus becomes the visible remote cursor after dismissal');
    var live = harness(false, true); live.open(); live.list.children[1].click();
    assert.ok(!live.panel.classList.contains('hidden'));
    assert.equal(live.list.children[0].getAttribute('aria-checked'), 'false');
    assert.equal(live.list.children[1].getAttribute('aria-checked'), 'true');
    assert.equal(live.list.children[1].getAttribute('role'), 'menuitemradio');
});

test('native focus, outside dismissal and removed-trigger recovery stay in the visible scope', function () {
    var h = harness(false), next = h.view.appendChild(h.document.createElement('button'));
    next.focus();
    assert.ok(next.classList.contains('focused'), 'native focus synchronises the remote cursor');
    assert.equal(next.scrolls, undefined, 'native focus does not start a duplicate scroll');
    h.context.UI.focusOn(h.origin); h.open(null, true); h.clickOutside(next);
    assert.equal(h.document.activeElement, next);
    assert.ok(h.panel.classList.contains('hidden'));
    h.context.UI.focusOn(h.origin); h.open(null, true); h.view.removeChild(h.origin); h.key(10009);
    assert.equal(h.document.activeElement, next, 'a replaced origin cannot leave focus inside the hidden picker');
});

test('anchored menus reposition after resize, cap their height and flip when space below is short', function () {
    var h = harness(false); h.open(null, true);
    assert.equal(h.panel.style.right, '650px');
    assert.equal(h.panel.style.maxHeight, '640px');
    h.context.window.innerWidth = 1153; h.context.window.innerHeight = 1297;
    h.origin.rect.right = 878; h.context.positionPicker();
    assert.equal(h.panel.style.right, '275px');
    h.context.window.innerHeight = 600; h.context.positionPicker();
    assert.equal(h.panel.style.top, '');
    assert.equal(h.panel.style.bottom, '318px');
    assert.ok(parseFloat(h.panel.style.maxHeight) <= 250);
    h.key(10009);
    assert.equal(h.panel.style.bottom, '', 'anchored styles do not leak to a later modal picker');
});

test('a playback failure dismisses picker/menu owners before focusing its recovery action', function () {
    var h = harness(false, true), context = h.context, doc = h.document, closed = [];
    var error = h.view.appendChild(doc.createElement('div')); error.id = 'error-overlay'; error.classList.add('hidden');
    ['error-title', 'error-hint'].forEach(function (id) { var el = error.appendChild(doc.createElement('div')); el.id = id; });
    var back = error.appendChild(doc.createElement('button')); back.classList.add('btn');
    context.state.playingUri = 'file:///example.mp4';
    context.openWatchdog = 1; context.clearInterval = function () {};
    context.osdHideTimer = 2; context.clearTimeout = function () {};
    context.closeMore = function (restore) { closed.push(['more', restore]); };
    context.closeTrackMenu = function (restore) { closed.push(['tracks', restore]); };
    context.showOSD = function (visible) { closed.push(['osd', visible]); };
    context.hideSpinner = function () {};
    h.open();
    var app = read('js/app.js'), chrome = app.indexOf('    function clearPlaybackChrome()');
    vm.runInContext(app.slice(chrome, app.indexOf('    /* Stop for good:', chrome)), context);
    var start = app.indexOf('    function showError('), end = app.indexOf('    function hideError(', start);
    vm.runInContext(app.slice(start, end) + '\nshowError("Simulated failure");', context);
    assert.ok(h.panel.classList.contains('hidden'));
    assert.equal(h.listeners.length, 0, 'no stale picker key layer can steal Back or arrows');
    assert.deepEqual(closed, [['more', false], ['tracks', false], ['osd', false]]);
    assert.equal(doc.activeElement, back);
    assert.equal(context.playerPopupReturn, null);
});

test('read-only dialogs scroll with the remote and restore their origin without resetting the view', function () {
    var h = harness(false), distance = null;
    h.context.I18n = { t: function (key) { return key; } };
    vm.runInContext(read('js/dialog.js'), h.context);
    var revision = h.context.UI.viewRevision;
    var d = h.context.Dialog.open('Receipt', { returnTo: h.origin });
    d.body.scrollBy = function (value) { distance = value; };
    d.focus(); h.key(40);
    assert.equal(distance.top, 200);
    assert.equal(distance.behavior, 'auto', 'shared scrolling honours reduced motion');
    h.key(10009);
    assert.equal(h.document.activeElement, h.origin);
    assert.equal(h.context.UI.viewRevision, revision, 'restoration must not redraw/reset the underlying page');
});

test('File info arrows scroll its read-only body instead of navigating away from Close', function () {
    var app = read('js/app.js');
    ['UP', 'DOWN'].forEach(function (direction) {
        var start = app.indexOf('            case K.' + direction + ':', app.indexOf('var errorUp ='));
        var end = app.indexOf("                if (state.view === 'player' && !errorUp && !trackMenuOpen)", start);
        assert.ok(start >= 0 && end > start);
        var body = {}, distance;
        vm.runInNewContext('(function () { switch (code) {' + app.slice(start, end) + '} })();', {
            code: 1, K: { UP: 1, DOWN: 1 }, state: { view: 'player' }, errorUp: false,
            document: { getElementById: function () { return { classList: { contains: function () { return false; } } }; }, querySelector: function () { return body; } },
            UI: { scrollBy: function (target, amount) { assert.equal(target, body); distance = amount; } }
        });
        assert.equal(distance, direction === 'UP' ? -200 : 200);
    });
});

test('in-card playback choices expose their selected state and restore their parent row', function () {
    var h = harness(false, true), context = h.context, doc = h.document;
    var owner = h.view.appendChild(doc.createElement('div')); owner.id = 'player-more';
    var row = owner.appendChild(doc.createElement('button'));
    var level = owner.appendChild(doc.createElement('div')); level.id = 'more-level'; level.classList.add('hidden');
    var title = level.appendChild(doc.createElement('h2')); title.id = 'more-level-title';
    var options = level.appendChild(doc.createElement('ul')); options.id = 'more-level-options';
    var sync = h.view.appendChild(doc.createElement('div')); sync.id = 'track-level-sync';
    context.osdHideTimer = 1; context.clearTimeout = function () {}; context.scheduleOSDHide = function () {};
    var app = read('js/app.js'), start = app.indexOf('    var LEVEL_IDS ='), end = app.indexOf('    /* The synchronization control', start);
    vm.runInContext(app.slice(start, end), context);
    context.openCardLevel('player-more', 'Speed', [{ code: '1', name: 'Normal' }, { code: '2', name: 'Double' }], '1', function () { return true; }, row);
    assert.equal(options.children[0].getAttribute('role'), 'menuitemradio');
    assert.equal(options.children[0].getAttribute('aria-checked'), 'true');
    options.children[1].click();
    assert.equal(options.children[0].getAttribute('aria-checked'), 'false');
    assert.equal(options.children[1].getAttribute('aria-checked'), 'true');
    assert.equal(doc.activeElement, options.children[1]);
    context.closeCardLevel(true);
    assert.equal(doc.activeElement, row);
    assert.ok(level.classList.contains('hidden'));
});

test('DLNA discovery keeps focus while pending and ignores replies after cancellation', function () {
    var h = harness(false), context = h.context, pending;
    context.I18n = { t: function (key) { return key; } };
    context.t = context.I18n.t;
    context.el = function (tag, cls, text) {
        var n = h.document.createElement(tag); n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    context.addSource = function () {}; context.sourceSaved = function () {};
    context.DLNA = { discover: function (cb) { pending = cb; }, servers: function () { return []; } };
    vm.runInContext(read('js/dialog.js'), context);
    var source = read('js/library-ui.js'), start = source.indexOf('    function addDlna()'), end = source.indexOf('    function sourceSaved(', start);
    vm.runInContext(source.slice(start, end) + '\naddDlna();', context);
    assert.equal(h.document.activeElement.textContent, 'dlna.searchAgain', 'pending discovery must not leave native focus on the body');
    var root = h.document.getElementById('library-modal'), body = root.children[0].children[1];
    assert.equal(body.children[0].getAttribute('role'), 'status');
    pending(null, [{ id: 'one', name: 'A long source name' }]);
    assert.equal(h.document.activeElement.title, 'A long source name');
    assert.equal(h.document.activeElement.children[0].className, 'option-label');
    context.Dialog.close();
    pending(null, [{ id: 'late', name: 'Late server' }]);
    assert.equal(h.document.getElementById('library-modal'), null);
    assert.equal(h.document.activeElement, h.origin, 'late discovery cannot replace focus restored after cancellation');
});

test('closing an SMB source form invalidates share discovery before returning its reusable fields', function () {
    var h = harness(false), context = h.context, cancelled = 0;
    context.I18n = { t: function (key) { return key; } }; context.t = context.I18n.t;
    context.addSource = function () {};
    context.SMB = { editServer: function () {}, cancelShareSearch: function () { cancelled++; } };
    var home = h.view.appendChild(h.document.createElement('div'));
    var group = home.appendChild(h.document.createElement('div')); group.id = 'grp-smb';
    group.appendChild(h.document.createElement('input'));
    var save = group.appendChild(h.document.createElement('button')); save.id = 'smb-save';
    vm.runInContext(read('js/dialog.js'), context);
    var source = read('js/library-ui.js'), start = source.indexOf('    function editSource('), end = source.indexOf('    function addDlna()', start);
    vm.runInContext(source.slice(start, end) + '\neditSource("smb", "new");', context);
    assert.notEqual(group.parentNode, home);
    context.Dialog.close();
    assert.equal(cancelled, 1);
    assert.equal(group.parentNode, home);
    assert.equal(save.parentNode, group);
    assert.equal(h.document.activeElement, h.origin);
});

test('translated toasts have bounded reading time and replace the prior dismissal timer', function () {
    var h = harness(false), context = h.context, timers = [], cleared = [];
    var toast = h.view.appendChild(h.document.createElement('div')); toast.id = 'toast'; toast.classList.add('hidden');
    context.setTimeout = function (fn, delay) { timers.push({ fn: fn, delay: delay }); return timers.length; };
    context.clearTimeout = function (id) { cleared.push(id); };
    context.UI.toast('Saved');
    assert.equal(timers[0].delay, 2000);
    context.UI.toast('A'.repeat(80));
    assert.equal(timers[1].delay, 3600);
    context.UI.toast('A'.repeat(1000));
    assert.equal(timers[2].delay, 6000);
    assert.equal(cleared[2], 2, 'new feedback replaces rather than stacking an old timer');
    assert.ok(!toast.classList.contains('hidden'));
    timers[2].fn(); assert.ok(toast.classList.contains('hidden'));
});

test('adjacent plain-list focus avoids geometry reads but hidden rows and grids retain geometric search', function () {
    var h = harness(false), list = h.view.appendChild(h.document.createElement('ul')), reads = 0;
    list.classList.add('browse-list');
    for (var i = 0; i < 300; i++) {
        var row = list.appendChild(h.document.createElement('li')); row.tabIndex = 0;
        var original = row.getBoundingClientRect;
        row.getBoundingClientRect = (function (get) { return function () { reads++; return get(); }; })(original);
    }
    h.context.UI.focusOn(list.children[5]); reads = 0;
    assert.equal(h.context.UI.moveFocus('down', true), true);
    assert.equal(h.document.activeElement, list.children[6]);
    assert.equal(reads, 0, 'an interior list step must not scan every row rectangle');
    h.context.UI.moveFocus('up', true);
    assert.equal(h.document.activeElement, list.children[5]); assert.equal(reads, 0);
    list.children[6].classList.add('hidden'); reads = 0;
    h.context.UI.moveFocus('down', true);
    assert.equal(h.document.activeElement, list.children[7]); assert.ok(reads > 0);
    list.children[8].disabled = true; reads = 0;
    h.context.UI.moveFocus('down', true);
    assert.equal(h.document.activeElement, list.children[9]); assert.ok(reads > 0);
    list.classList.add('grid'); reads = 0;
    h.context.UI.moveFocus('down', true);
    assert.equal(h.document.activeElement, list.children[10]); assert.ok(reads > 0, 'grids must not use DOM adjacency');
});

test('plain-list boundaries still reach the filter and honour no-wrap', function () {
    var h = harness(false), filter = h.view.appendChild(h.document.createElement('input'));
    filter.rect = { top: -100, bottom: -22, left: 0, right: 460 };
    var list = h.view.appendChild(h.document.createElement('ul')); list.classList.add('browse-list');
    for (var i = 0; i < 3; i++) { var row = list.appendChild(h.document.createElement('li')); row.tabIndex = 0; }
    h.context.UI.focusOn(list.children[0]); h.context.UI.moveFocus('up', true);
    assert.equal(h.document.activeElement, filter);
    h.context.UI.focusOn(list.children[2]);
    assert.equal(h.context.UI.moveFocus('down', true), false);
    assert.equal(h.document.activeElement, list.children[2]);
    h.context.UI.moveFocus('down');
    assert.equal(h.document.activeElement, filter, 'plain-list wrapping retains the existing filter destination');
});

test('playback action names and stored shuffle state use translated values before interaction', function () {
    var h = harness(false), context = h.context, shuffle = true;
    var play = h.view.appendChild(h.document.createElement('button')); play.id = 'btn-playpause';
    var image = {}; play.querySelector = function () { return image; };
    var button = h.view.appendChild(h.document.createElement('button')); button.id = 'btn-shuffle';
    var value = h.view.appendChild(h.document.createElement('span')); value.id = 'subtitle-sync-value';
    var sync = h.view.appendChild(h.document.createElement('button')); sync.id = 'subtitle-sync-control';
    var strings = { 'common.play': 'Lire', 'common.pause': 'Pause', 'common.on': 'Activé', 'common.off': 'Désactivé', 'toast.shuffle': 'Aléatoire : {0}', 'sync.title': 'Synchronisation' };
    context.I18n = { t: function (key, value) { return strings[key].replace('{0}', value); } };
    context.Settings = { get: function () { return shuffle; } };
    context.Player = { getSubtitleDelay: function () { return 1500; } };
    var source = read('js/app.js');
    [['    function updatePlayPauseButton(', '    function updateProgress('], ['    function updateShuffleButton()', '    /* ── More value rows:'], ['    function fmtSyncDelay(', '    function adjustSubtitleSync(']].forEach(function (boundary) {
        var start = source.indexOf(boundary[0]), end = source.indexOf(boundary[1], start);
        assert.ok(start >= 0 && end > start); vm.runInContext(source.slice(start, end), context);
    });
    context.updatePlayPauseButton('paused'); assert.equal(play.getAttribute('aria-label'), 'Lire'); assert.equal(play.title, 'Lire');
    context.updatePlayPauseButton('playing'); assert.equal(play.getAttribute('aria-label'), 'Pause');
    context.updateShuffleButton(); assert.equal(button.getAttribute('aria-label'), 'Aléatoire : Activé');
    shuffle = false; context.updateShuffleButton(); assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(button.getAttribute('aria-label'), 'Aléatoire : Désactivé');
    context.updateSubtitleSync(); assert.equal(sync.getAttribute('aria-label'), 'Synchronisation: +1.5 s');
});
