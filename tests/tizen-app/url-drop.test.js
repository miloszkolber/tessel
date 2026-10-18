'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var vm = require('node:vm');

function harness(reply, status) {
    var sent = [], pending;
    function XHR() { pending = this; }
    XHR.prototype.open = function (method, url) { sent.push([method, url]); };
    XHR.prototype.setRequestHeader = function () {};
    XHR.prototype.send = function (body) { sent.push(JSON.parse(body)); };
    var c = { XMLHttpRequest: XHR };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(require.resolve('../../tizen-app/js/url-drop.js'), 'utf8'), c);
    return { api: c.UrlDrop, sent: sent, respond: function () {
        pending.status = status === undefined ? 200 : status;
        pending.responseText = JSON.stringify(reply);
        pending.onload();
    }, timeout: function () { pending.ontimeout(); } };
}

test('casting changes are acknowledged by the actual service endpoint', function () {
    var h = harness({ ok: true, on: false }), calls = 0;
    h.api.setEnabled(false, function (err) { assert.equal(err, null); calls++; });
    assert.equal(calls, 0);
    assert.deepEqual(h.sent[0], ['POST', 'http://127.0.0.1:8127/cast/set']);
    assert.equal(h.sent[1].on, false);
    h.respond();
    h.timeout();
    assert.equal(calls, 1, 'late timeout must not settle the change twice');
});

test('a rejected or mismatched listener state is not reported as applied', function () {
    [{ ok: false }, { ok: true, on: true }].forEach(function (reply) {
        var h = harness(reply), error;
        h.api.setEnabled(false, function (err) { error = err; });
        h.respond();
        assert.ok(error);
    });
});

test('a listener timeout returns an error rather than confirming the switch', function () {
    var h = harness(), error;
    h.api.setEnabled(true, function (err) { error = err; });
    h.timeout();
    assert.match(error.message, /timeout/);
});
