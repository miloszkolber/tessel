'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

/* Measured scroll-boundary fixture, not a renderer. Rects change with every
 * scroll write and model the negative scrollLeft used by RTL WebKit. */
function harness(rtl, stride, viewport) {
    var document = { dir: rtl ? 'rtl' : 'ltr' }, events = {};
    function Element(kind) {
        var node = this, classes = {};
        this.tagName = kind === 'card' ? 'BUTTON' : 'DIV';
        this.children = []; this.attrs = {}; this.handlers = {}; this.scrollTop = 0;
        this.classList = {
            contains: function (key) { return !!classes[key]; },
            add: function (key) { classes[key] = true; },
            remove: function (key) { delete classes[key]; },
            toggle: function (key, value) { classes[key] = value; }
        };
        this.appendChild = function (child) {
            if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
            node.children.push(child); child.parentNode = node; return child;
        };
        this.insertBefore = function (child, next) {
            node.children.splice(node.children.indexOf(next), 0, child); child.parentNode = node;
        };
        this.closest = function (selector) {
            for (var el = node; el; el = el.parentNode) {
                if (selector.split(', ').some(function (part) { return el.classList.contains(part.slice(1)); })) return el;
            }
            return null;
        };
        this.querySelectorAll = function (selector) {
            var all = [];
            node.children.forEach(function (child) { all.push(child); all = all.concat(child.querySelectorAll('*')); });
            if (selector === '*') return all;
            if (selector === '[data-focus]') return [];
            if (selector[0] === '.') return all.filter(function (el) {
                return selector.split(', ').some(function (part) { return el.classList.contains(part.slice(1)); });
            });
            return all.filter(function (el) { return el.tagName === 'BUTTON'; });
        };
        this.querySelector = function (selector) { return node.querySelectorAll(selector)[0] || null; };
        this.setAttribute = function (key, value) { node.attrs[key] = value; };
        this.addEventListener = function (type, fn) { node.handlers[type] = fn; };
        this.focus = function () { document.activeElement = node; };
        this.scrollIntoView = function () {};
        Object.defineProperty(this, 'offsetParent', { get: function () { return node.closest('.hidden') ? null : node.parentNode; } });
    }
    document.body = new Element('body'); document.activeElement = document.body;
    var view = document.body.appendChild(new Element('view')); view.classList.add('view'); view.classList.add('hidden');
    var row = view.appendChild(new Element('row')); row.classList.add('card-row');
    var width = viewport, count = 10, cardWidth = stride - 17, position = 0;
    Object.defineProperties(row, {
        clientWidth: { get: function () { return row.offsetParent ? width : 0; } },
        scrollWidth: { get: function () { return row.offsetParent ? count * stride - 17 + 24 : 0; } },
        scrollLeft: {
            get: function () { return rtl ? -position : position; },
            set: function (value) { position = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, rtl ? -value : value)); }
        }
    });
    row.getBoundingClientRect = function () { return { left: 0, right: width, width: width }; };
    var cards = [];
    for (var i = 0; i < count; i++) (function (index) {
        var card = row.appendChild(new Element('card')); cards.push(card);
        card.getBoundingClientRect = function () {
            var left = rtl ? width - 12 - index * stride - cardWidth + position : 12 + index * stride - position;
            return { left: left, right: left + cardWidth, width: cardWidth };
        };
    }(i));
    document.getElementById = function (id) { return id === 'stream' ? view : null; };
    document.querySelectorAll = function (selector) { return document.body.querySelectorAll(selector); };
    document.createElement = function () { return new Element('div'); };
    var context = { document: document, window: {
        addEventListener: function (type, fn) { events[type] = fn; },
        getComputedStyle: function () { return { paddingLeft: '12px', paddingRight: '12px' }; }
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../tizen-app/js/ui.js'), 'utf8'), context);
    return { UI: context.UI, row: row, view: view, cards: cards, document: document, resize: events.resize,
        setWidth: function (value) { width = value; } };
}

[false, true].forEach(function (rtl) {
    test('rows advance from the third item with measured strides and complete focus rings (' + (rtl ? 'RTL' : 'LTR') + ')', function () {
        var h = harness(rtl, 113, 610), sign = rtl ? -1 : 1;
        h.UI.showView('stream');
        h.UI.focusOn(h.cards[1]); assert.equal(Math.abs(h.row.scrollLeft), 0);
        h.UI.focusOn(h.cards[2]); assert.equal(h.row.scrollLeft, sign * 113);
        h.UI.focusOn(h.cards[3]); assert.equal(h.row.scrollLeft, sign * 226);
        h.UI.focusOn(h.cards[2]); assert.equal(h.row.scrollLeft, sign * 113, 'reverse movement retreats one stride');
        h.UI.focusOn(h.cards[9]);
        var box = h.cards[9].getBoundingClientRect();
        assert.ok(box.left >= 4 && box.right <= h.row.clientWidth - 4, 'last card and ring fit after clamping');
        assert.equal(h.row.attrs['data-overflow'], 'start');
        h.UI.focusOn(h.cards[0]);
        assert.equal(Math.abs(h.row.scrollLeft), 0, 'first item restores row start immediately');
        h.UI.focusOn(h.cards[2]); h.setWidth(420); h.resize();
        assert.equal(h.row.scrollLeft, sign * 113, 'resize uses current geometry, not an accumulated offset');
    });
});

test('hidden Stream rows refresh on show, resize and existing-shell reuse without refocusing', function () {
    var h = harness(false, 113, 610), shell = h.UI.overflowRow(h.row);
    assert.equal(shell.attrs['data-overflow'], 'none', 'hidden layout has no measurable overflow');
    h.UI.showView('stream');
    assert.equal(shell.attrs['data-overflow'], 'end', 'activation refreshes nonfocused rows too');
    h.document.activeElement = h.document.body;
    h.setWidth(1500); h.resize();
    assert.equal(shell.attrs['data-overflow'], 'none', 'resize refresh does not require focused card');
    h.setWidth(610);
    assert.equal(h.UI.overflowRow(h.row), shell, 'existing shell reused');
    assert.equal(shell.attrs['data-overflow'], 'end', 'existing shell refreshes after content/layout changes');
    assert.equal(h.view.children.length, 1, 'no nested shell');
});
