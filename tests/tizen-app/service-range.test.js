'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var http = require('node:http'), fs = require('node:fs'), vm = require('node:vm');
var source = fs.readFileSync('tizen-app/service/service.js', 'utf8');

async function harness(t, handler, pressure) {
    var origin = http.createServer(handler), proxyHandler, observations = { pauses: 0, resumes: 0, writes: 0 };
    var context = { Buffer: Buffer, console: { log: function () {} }, setTimeout: setTimeout, clearTimeout: clearTimeout,
        process: { on: function () {} }, module: { exports: {} }, require: function (name) {
            if (name !== 'http') return require(name);
            return { createServer: function (fn) { return { on: function () {}, listen: function (port) { if (port === 8127) proxyHandler = fn; } }; },
                get: function (opts, cb) { return http.get(opts, function (up) {
                    var pause = up.pause, resume = up.resume;
                    up.pause = function () { observations.pauses++; return pause.call(up); };
                    up.resume = function () { observations.resumes++; return resume.call(up); };
                    cb(up);
                }); } };
        } };
    vm.runInNewContext(source, context);
    var proxy = http.createServer(function (req, res) {
        if (pressure) {
            var write = res.write;
            res.write = function (chunk) {
                observations.writes++;
                var result = write.call(res, chunk);
                if (observations.writes === 1) {
                    setImmediate(function () { res.emit('drain'); });
                    return false;
                }
                return result;
            };
        }
        proxyHandler(req, res);
    });
    t.after(function () { origin.closeAllConnections(); proxy.closeAllConnections(); origin.close(); proxy.close(); });
    await Promise.all([origin, proxy].map(function (server) { return new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); }); }));
    return { observations: observations, request: function (range, method, onData) {
        return new Promise(function (resolve, reject) {
            var target = 'http://127.0.0.1:' + origin.address().port + '/media';
            var req = http.request({ hostname: '127.0.0.1', port: proxy.address().port,
                path: '/dlna/range?url=' + encodeURIComponent(target), method: method || 'GET', headers: { Range: range } });
            var timer = setTimeout(function () { req.destroy(); reject(new Error('proxy response hung')); }, 1500);
            req.on('error', function (err) { clearTimeout(timer); reject(err); });
            req.on('response', function (res) {
                var chunks = [];
                res.on('data', function (b) { chunks.push(b); if (onData) onData(res); });
                res.on('error', function () {});
                res.on('close', function () { clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, complete: res.complete, body: Buffer.concat(chunks).toString() }); });
            });
            req.end();
        });
    } };
}

test('range proxy clamps ignored ends and supports suffix, EOF and HEAD bounds', { timeout: 5000 }, async function (t) {
    var h = await harness(t, function (req, res) {
        var start = req.headers.range === 'bytes=-2' ? 8 : 0;
        res.writeHead(206, { 'Content-Range': 'bytes ' + start + '-9/10', 'Content-Length': 10 - start });
        res.end('0123456789'.slice(start));
    });
    var one = await h.request('bytes=0-0');
    assert.equal(one.body, '0'); assert.equal(one.headers['content-range'], 'bytes 0-0/10');
    var eof = await h.request('bytes=0-99');
    assert.equal(eof.body, '0123456789'); assert.equal(eof.headers['content-range'], 'bytes 0-9/10');
    assert.equal((await h.request('bytes=-2')).body, '89');
    var head = await h.request('bytes=0-0', 'HEAD');
    assert.equal(head.body, ''); assert.equal(head.headers['content-length'], '1');
    var outside = await h.request('bytes=20-30');
    assert.equal(outside.status, 416); assert.equal(outside.headers['content-range'], 'bytes */10');
});

test('range proxy rejects shifted starts in either direction and invalid upstream bounds', { timeout: 5000 }, async function (t) {
    for (var bounds of ['0-9/10', '3-9/10', '2-1/10', '2-10/10']) {
        var h = await harness(t, function (req, res) { res.writeHead(206, { 'Content-Range': 'bytes ' + bounds }); res.end('shifted'); });
        assert.equal((await h.request('bytes=2-5')).status, 502, bounds);
    }
});

test('range proxy preserves upstream 416 instead of rewriting it as 502', { timeout: 5000 }, async function (t) {
    var h = await harness(t, function (req, res) { res.writeHead(416, { 'Content-Range': 'bytes */10' }); res.end(); });
    var result = await h.request('bytes=20-30');
    assert.equal(result.status, 416); assert.equal(result.headers['content-range'], 'bytes */10');
});

test('range proxy clamps valid shorter upstream bounds', { timeout: 5000 }, async function (t) {
    var h = await harness(t, function (req, res) { res.writeHead(206, { 'Content-Range': 'bytes 2-4/10' }); res.end('234'); });
    var result = await h.request('bytes=2-8');
    assert.equal(result.body, '234'); assert.equal(result.headers['content-range'], 'bytes 2-4/10');
});

test('range proxy terminates truncated and clean short upstream responses without hanging', { timeout: 5000 }, async function (t) {
    for (var abrupt of [false, true]) {
        var h = await harness(t, function (req, res) {
            res.writeHead(206, { 'Content-Range': 'bytes 0-9/10' }); res.write('012');
            if (abrupt) setImmediate(function () { res.destroy(); }); else res.end();
        });
        var result = await h.request('bytes=0-9').catch(function (err) { return { hung: /hung/.test(err.message), reset: /hang up|aborted|ECONNRESET/.test(err.message) }; });
        if (result && result.hung !== undefined) assert.equal(result.hung, false, 'truncated response must terminate, not hang');
        else assert.equal(result.complete, false);
    }
});

test('range proxy pauses on downstream backpressure and resumes on drain', { timeout: 5000 }, async function (t) {
    var h = await harness(t, function (req, res) {
        res.writeHead(206, { 'Content-Range': 'bytes 0-9/10' }); res.write('012');
        setImmediate(function () { res.end('3456789'); });
    }, true);
    var result = await h.request('bytes=0-9');
    assert.equal(result.body, '0123456789'); assert.equal(result.complete, true);
    assert.ok(h.observations.pauses > 0); assert.ok(h.observations.resumes > 1);
});

test('downstream cancellation closes upstream even while its response is pending', { timeout: 5000 }, async function (t) {
    var closed;
    var closure = new Promise(function (resolve) { closed = resolve; });
    var h = await harness(t, function (req, res) {
        res.on('close', closed);
        res.writeHead(206, { 'Content-Range': 'bytes 0-999999/1000000' }); res.write('012');
    });
    await h.request('bytes=0-999999', 'GET', function (res) { res.destroy(); });
    await Promise.race([closure, new Promise(function (_, reject) { var timer = setTimeout(function () { reject(new Error('upstream not cancelled')); }, 1000); timer.unref(); })]);
});
