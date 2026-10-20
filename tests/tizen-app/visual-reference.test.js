'use strict';

/* The mockup reference (examples/*.svg) defines one visual contract:
 * a textured #0A0A0A page, 2px surface outlines, a hard 4px focus ring,
 * a 128px footer scrim with 28px key chips and a 678px modal.  These tests
 * hold that contract so a later tweak does not quietly drift from it. */

var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('node:fs');
var path = require('node:path');
var ROOT = path.join(__dirname, '../../tizen-app');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function css() { return read('css/style.css'); }
function rule(source, selector, length) {
    var at = source.indexOf(selector);
    assert.ok(at >= 0, 'missing rule ' + selector);
    return source.slice(at, at + (length || 400));
}

test('the page carries the reference halftone field as a baked image', function () {
    var texture = path.join(ROOT, 'assets/texture-halftone.png');
    assert.ok(fs.existsSync(texture), 'texture asset present');
    var view = rule(css(), '.view {', 800);
    assert.ok(view.indexOf('url("../assets/texture-halftone.png")') >= 0, 'view paints the texture');
    assert.ok(view.indexOf('/ 100% 100%') >= 0, 'texture fills the page');
    assert.ok(css().indexOf('mix-blend-mode') < 0, 'no live blend layer over the page');
});

test('every focusable surface shares one hard ring, not a soft halo', function () {
    var source = css();
    assert.ok(source.indexOf('--focus-halo') < 0, 'the soft halo token is gone');
    assert.ok(source.indexOf('--focus-ring:  #f4f4f4') >= 0, 'one focus colour');
    var card = rule(source, '.media-card.focused,');
    assert.ok(card.indexOf('border-color: var(--focus-ring)') >= 0, 'light border');
    assert.ok(card.indexOf('background: var(--bg-card-h)') >= 0, 'focused fill');
    assert.ok(card.indexOf('box-shadow: 0 0 0 2px var(--focus-ring)') >= 0, '2px ring outside the border');
});

test('surfaces carry the reference 2px outline', function () {
    var source = css();
    assert.ok(source.indexOf('--surface-border: #303030') >= 0, 'surface outline colour');
    assert.ok(source.indexOf('--input-border:   #464646') >= 0, 'input outline colour');
    assert.ok(rule(source, '.media-card {').indexOf('border: 2px solid var(--surface-border)') >= 0, 'card outline');
    assert.ok(rule(source, '.dialog-option {').indexOf('border: 2px solid var(--surface-border)') >= 0, 'option outline');
    assert.ok(rule(source, '.settings-row {').indexOf('border: 2px solid var(--surface-border)') >= 0, 'row outline');
});

test('the five-column card grid keeps the reference geometry', function () {
    var source = css();
    assert.ok(source.indexOf('--page-inset: 65px') >= 0, 'page inset');
    assert.ok(source.indexOf('--card-gap: 26px') >= 0, 'card gap');
    assert.ok(source.indexOf('--card-width: calc((100vw - 130px - 104px) / 5)') >= 0, 'five columns');
    assert.ok(source.indexOf('--card-height: calc((100vw - 130px - 104px) / 80 * 9)') >= 0, '16:9 card');
    assert.ok(Math.abs(337.2 - (1920 - 130 - 104) / 5) < 0.01, 'card width at 1920');
    assert.ok(Math.abs(1.7778 - 337.2 / ((1920 - 130 - 104) / 80 * 9)) < 0.001, 'card ratio');
});

test('the footer is a 128px scrim with 28px key chips', function () {
    var hint = rule(css(), '.hint {', 600);
    assert.ok(hint.indexOf('padding: 50px 64px 50px 0') >= 0, 'chips sit 50px above the bottom edge');
    assert.ok(hint.indexOf('linear-gradient(to bottom, rgba(10,10,10,0), rgba(10,10,10,1))') >= 0, 'scrim');
    var key = rule(css(), '.key {', 400);
    assert.ok(key.indexOf('height: 28px') >= 0, 'chip height');
    assert.ok(key.indexOf('border-radius: 4px') >= 0, 'chip radius');
    assert.ok(key.indexOf('background: rgba(255,255,255,.078)') >= 0, 'chip fill');
});

test('the page heading uses the reference type scale', function () {
    var source = css();
    assert.ok(rule(source, '.page-heading h1').indexOf('font-size: 52px') >= 0, 'title size');
    assert.ok(rule(source, '.page-heading h1').indexOf('font-weight: 700') >= 0, 'title weight');
    assert.ok(rule(source, '.page-heading p').indexOf('font-size: 28px') >= 0, 'description size');
    assert.ok(rule(source, '.page-heading p').indexOf('color: var(--fg-soft)') >= 0, 'description colour');
    assert.ok(source.indexOf('#view-home .page-heading {') < 0, 'one heading rhythm for every page');
});

test('dialogs use the reference 678px modal', function () {
    var dialog = rule(css(), '.dialog-card {', 400);
    assert.ok(dialog.indexOf('width: 678px') >= 0, 'modal width');
    assert.ok(dialog.indexOf('border-radius: 16px') >= 0, 'modal radius');
    assert.ok(rule(css(), '.dialog-scrim {').indexOf('rgba(0,0,0,.5)') >= 0, 'scrim opacity');
});

test('the receipt dialog waits with a ring, like the reference', function () {
    var source = read('js/library-ui.js');
    assert.ok(source.indexOf("el('span', 'spinner-ring')") >= 0, 'waiting ring');
    assert.ok(css().indexOf('.receive-state .spinner-ring') >= 0, 'ring styling');
});

test('the receipt dialog carries no simulator form', function () {
    var source = read('js/library-ui.js');
    assert.ok(source.indexOf('Simulator.castSend') < 0, 'the app does not build a send form');
    assert.ok(source.indexOf("'input'") < 0, 'the receipt dialog has no input');
    var demo = read('demo/boot.js');
    assert.ok(demo.indexOf('Simulator.castSend') >= 0, 'the simulator phone sends instead');
});

test('the music card sits still on the centre line', function () {
    var source = css();
    assert.ok(source.indexOf('audio-drift') < 0, 'the cover does not drift');
    var card = rule(source, '.audio-card {', 400);
    assert.ok(card.indexOf('left: 50%') >= 0, 'centred horizontally');
    assert.ok(card.indexOf('translate(-50%, -50%)') >= 0, 'centred vertically');
});

test('the queue is a peek until it holds focus', function () {
    var source = css();
    var up = rule(source, '.up-next {', 600);
    assert.ok(up.indexOf('position: absolute') >= 0, 'out of the transport flow');
    assert.ok(up.indexOf('max-height: var(--queue-peek)') >= 0, 'peek by default');
    assert.ok(source.indexOf('.up-next:focus-within { max-height: var(--queue-open); }') >= 0, 'opens on focus');
    assert.ok(source.indexOf('body.has-queue .osd-bottom') >= 0, 'the OSD reserves the strip height');
});

test('an empty section keeps its place on the page', function () {
    var source = css();
    assert.ok(source.indexOf('.card-row.empty') >= 0, 'empty row styling');
    assert.ok(source.indexOf('min-height: calc(var(--card-height) + 24px)') >= 0, 'same height as a filled row');
    var ui = read('js/library-ui.js');
    assert.ok(ui.indexOf("list.classList.add('empty')") >= 0, 'the row says it is empty');
    assert.ok(ui.indexOf('saved.noSaved') >= 0, 'the saved section names its empty state');
});
