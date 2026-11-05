'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), os = require('node:os');
var child = require('node:child_process');
var source = fs.readFileSync('tizen-app/service/service.js', 'utf8');
function service(src) {
    var servers = [];
    var http = { createServer: function (handler) {
        var s = { handler: handler, calls: [], listen: function (port, host) { s.calls.push({ port: port, host: host }); }, on: function () {} };
        servers.push(s); return s;
    } };
    var ctx = { module: { exports: {} }, Buffer: Buffer, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
        process: { on: function () {} }, require: function (name) { return name === 'http' ? http : require(name); } };
    vm.createContext(ctx); vm.runInContext(src, ctx);
    return { ctx: ctx, servers: servers, proxy: servers.filter(function (s) { return s.calls.some(function (c) { return c.port === 8127; }); })[0] };
}
test('wrapped service keeps lifecycle exports, isolates globals and starts each listener once', function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessel-bundle-'));
    try {
        var out = path.join(dir, 'service.js');
        child.execFileSync(process.execPath, ['scripts/bundle-service.js', out]);
        var bundle = fs.readFileSync(out, 'utf8'), h = service(bundle);
        h.ctx.module.exports.onStart(); h.ctx.module.exports.onRequest();
        assert.equal(h.ctx.LISTEN_HOST, undefined); assert.equal(h.ctx.server, undefined);
        h.servers.forEach(function (s) { assert.equal(s.calls.length, 1); });
        assert.equal(h.proxy.calls[0].host, '127.0.0.1');
        assert.ok(bundle.indexOf(source) >= 0, 'retain the complete source, including its notices');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('credential proxy denies foreign or missing peers before every route, including preflight', function () {
    var h = service(source);
    ['/smb/ping', '/smb/connect', '/smb/stream', '/smb/debug/logs', '/dav/connect', '/dav/stream', '/discover', '/local/enable', '/cast/status', '/unknown'].forEach(function (url) {
        ['192.0.2.10', '::ffff:192.0.2.10', '2001:db8::1', ''].forEach(function (peer) {
            ['GET', 'POST', 'OPTIONS'].forEach(function (method) {
                var code, text;
                h.proxy.handler({ url: url, method: method, socket: { remoteAddress: peer } }, {
                    writeHead: function (c) { code = c; }, end: function (s) { text = s; }
                });
                assert.equal(code, 403); assert.equal(text, 'Forbidden');
            });
        });
    });
    ['127.0.0.1', '::ffff:127.0.0.1', '::1'].forEach(function (peer) {
        var code, text;
        h.proxy.handler({ url: '/smb/ping', method: 'GET', socket: { remoteAddress: peer } }, { writeHead: function (c) { code = c; }, end: function (s) { text = s; } });
        assert.equal(code, 200); assert.equal(JSON.parse(text).ok, true);
    });
});

function launchHarness(options) {
    options = options || {};
    var scripts = [], events = {}, timers = [], legacy = [], modern = [], pings = [], done = [];
    var context = {
        BASE: 'http://127.0.0.1:8127', dbg: function () {},
        tizen: { systeminfo: { getCapability: function () { return options.version || '5.0'; } },
            application: { getCurrentApplication: function () { return { appInfo: { id: 'tesselfork.player' } }; }, launch: function (id, ok) { legacy.push(id); ok(); } } },
        document: { createElement: function () { return {}; }, body: { appendChild: function (s) { scripts.push(s); } } },
        window: { addEventListener: function (name, cb) { events[name] = cb; }, removeEventListener: function (name) { delete events[name]; } },
        setTimeout: function (fn) { timers.push(fn); return timers.length; }, clearTimeout: function () {},
        getJson: function (url, cb, timeout) { pings.push({ url: url, timeout: timeout }); if (options.wait) done.push(cb); else cb(null, { ok: true }); }
    };
    vm.createContext(context);
    var src = fs.readFileSync('tizen-app/js/smb.js', 'utf8');
    vm.runInContext(src.slice(src.indexOf('    var serviceWaiters ='), src.indexOf('    function connect(')), context);
    return { c: context, scripts: scripts, legacy: legacy, modern: modern, pings: pings, timers: timers, done: done,
        ready: function (fail) {
            context.window.tesselService = function (id) { modern.push(id); this.start = function () { if (fail) throw new Error('start failed'); }; };
            events['tessel-service-ready']();
        } };
}
test('modern startup loads one module and coalesces callers, preserving the local service identity', function () {
    var h = launchHarness({ version: '10.0', wait: true }), count = 0;
    h.c.ensureService(function (err) { assert.ifError(err); count++; });
    h.c.ensureService(function (err) { assert.ifError(err); count++; });
    assert.equal(h.scripts.length, 1); assert.equal(h.scripts[0].type, 'module'); h.ready();
    assert.deepEqual(h.modern, ['tesselfork.smbproxy']); assert.equal(h.legacy.length, 0);
    assert.equal(h.pings[0].url, 'http://127.0.0.1:8127/smb/ping'); assert.equal(h.pings[0].timeout, 1000);
    h.done[0](null, { ok: true }); assert.equal(count, 2);
});
test('old runtime and failed modern imports use legacy startup without extra module injection', function () {
    var old = launchHarness(), count = 0;
    old.c.ensureService(function () { count++; }); assert.equal(count, 1); assert.equal(old.scripts.length, 0);
    assert.deepEqual(old.legacy, ['tesselfork.smbproxy']);
    var modern = launchHarness({ version: '10.0' });
    modern.c.ensureService(function () {}); modern.scripts[0].onerror();
    modern.c.ensureService(function () {}); assert.equal(modern.scripts.length, 1); assert.equal(modern.legacy.length, 2);
    var failed = launchHarness({ version: '10.0' }); failed.c.ensureService(function () {}); failed.ready(true);
    assert.deepEqual(failed.legacy, ['tesselfork.smbproxy']);
});

test('startup rejects non-ping JSON, bounds retries and delivers failure once', function () {
    var h = launchHarness({ wait: true }), calls = 0, error;
    h.c.ensureService(function (err) { calls++; error = err; });
    for (var i = 0; i < 19; i++) {
        h.done[i](null, { unrelated: true });
        if (i < 18) h.timers[i]();
    }
    assert.equal(h.pings.length, 19); assert.equal(calls, 1); assert.match(error.message, /did not start/);
    h.done[18](null, { ok: true }); assert.equal(calls, 1);
});
