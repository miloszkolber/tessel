'use strict';

var assert = require('assert');
var test   = require('node:test');
var fs     = require('fs');
var vm     = require('vm');
var path   = require('path');
var I18n   = require('./helpers/i18n.js');

var JS = path.join(__dirname, '../../tizen-app/js/');
var SMB_SRC    = fs.readFileSync(JS + 'smb.js', 'utf8');

var STREAM = 'http://127.0.0.1:8127/smb/stream?path=';

var NAS   = { host: 'nas', port: 445, share: 'Media', user: 'tv', pass: 'pw', domain: '', anonymous: false };
var OTHER = { host: '192.168.1.5', port: 445, share: 'Films', user: 'tv', pass: 'pw2', domain: '', anonymous: false };

/* smb.js against a fake background service. */
function load(opts) {
    opts = opts || {};
    var store = {};
    if (opts.creds) store.vlctv_smb_v1 = JSON.stringify(opts.creds);
    if (opts.extra) store.vlctv_smb_extra_v1 = JSON.stringify(opts.extra);
    var connected = [];        // server ids the fake service holds
    var sent = [];             // every request, for the assertions
    var picker = null;
    var toasts = [], focused;
    var inputs = {};
    ['host', 'port', 'share', 'user', 'pass', 'domain'].forEach(function (k) { inputs['smb-' + k] = { value: '' }; });
    var handlers = {};
    var buttons = {
        'smb-save': { addEventListener: function (ev, fn) { handlers.save = fn; } },
        'smb-server': { addEventListener: function (ev, fn) { handlers.server = fn; } },
        'smb-remove': { addEventListener: function (ev, fn) { handlers.remove = fn; }, style: {} },
        'smb-server-val': { textContent: '' },
        'smb-anon-val': { textContent: '' }
    };

    function reply(x, status, body) {
        x.readyState = 4; x.status = status;
        x.responseText = typeof body === 'string' ? body : JSON.stringify(body);
        if (x.onreadystatechange) x.onreadystatechange();
        if (x.onload) x.onload();
    }
    function FakeXHR() {}
    FakeXHR.prototype.open = function (method, url) { this.url = url; };
    FakeXHR.prototype.setRequestHeader = function () {};
    FakeXHR.prototype.send = function (body) {
        var u = this.url;
        sent.push(u);
        if (/\/smb\/ping$/.test(u)) return reply(this, 200, { ok: true, servers: connected.slice() });
        if (/\/smb\/connect$/.test(u)) {
            var c = JSON.parse(body);
            connected.push(c.id);
            return reply(this, 200, { ok: true, dialect: 0x311, signing: false });
        }
        if (/\/api\/hello$/.test(u)) return reply(this, 200, { app: 'vlc-tv-transcode', api: opts.api || 2 });
        if (/\/api\/adopt/.test(u)) return reply(this, 200, opts.adopt);
        if (/\/api\/probe\?/.test(u)) return reply(this, 200, opts.probe ? opts.probe(u) : { direct: true, reason: 'remux only' });
        reply(this, 404, 'not found');
    };

    var sandbox = {
        module: { exports: {} },
        Debug: { send: function () {}, net: function () {} },
        I18n: I18n,
        FileTypes: require('../../tizen-app/js/filetypes.js'),
        UI: { toast: function (m) { toasts.push(m); }, focusOn: function (el) { focused = el; } },
        Settings: { get: function (k) { return k === 'smartRouting' ? opts.smart !== false : false; } },
        localStorage: {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
            setItem: function (k, v) { store[k] = String(v); },
            removeItem: function (k) { delete store[k]; }
        },
        document: {
            readyState: 'complete',
            addEventListener: function () {},
            getElementById: function (id) { return inputs[id] || buttons[id] || null; }
        },
        window: { VlcApp: { openPicker: function (title, items, cur, cb) { picker = { title: title, items: items, cb: cb }; } } },
        setTimeout: function (fn) { fn(); },
        XMLHttpRequest: FakeXHR
    };
    vm.createContext(sandbox);
    vm.runInContext(SMB_SRC + '\nvar SMB_ = SMB;', sandbox);
    var SMB = sandbox.SMB_;

    return {
        SMB: SMB, store: store, sent: sent, toasts: toasts, connected: connected,
        focused: function () { return Object.keys(inputs).filter(function (id) { return inputs[id] === focused; })[0]; },
        extra: function () { return JSON.parse(store.vlctv_smb_extra_v1 || '[]'); },
        first: function () { return JSON.parse(store.vlctv_smb_v1 || '{}'); },
        type: function (c) { for (var k in c) if (inputs['smb-' + k]) inputs['smb-' + k].value = String(c[k]); },
        save: function () { handlers.save(); },
        pick: function (code) { handlers.server(); var p = picker; picker = null; p.cb(code); return p; },
        remove: function (code) { handlers.remove(); var p = picker; picker = null; p.cb(code); },
    };
}

// Objects made inside the vm context don't deepEqual ones made out here.
function plain(x) { return JSON.parse(JSON.stringify(x)); }

test('missing SMB fields return focus to the correction without changing saved sources', function () {
    var t = load({ creds: NAS }); t.pick('new');
    t.type({ host: '', share: '' }); t.save();
    assert.strictEqual(t.focused(), 'smb-host');
    t.type({ host: 'another-nas' }); t.save();
    assert.strictEqual(t.focused(), 'smb-share');
    assert.deepStrictEqual(t.first(), NAS);
    assert.deepStrictEqual(t.extra(), []);
});

test('a single-server setup keeps the URLs it always had', function () {
    var t = load({ creds: NAS, paired: false });
    assert.deepStrictEqual(plain(t.SMB.servers().map(function (s) { return s.id; })), ['']);
    assert.strictEqual(t.SMB.streamUrl('Movies/a.mkv', ''), STREAM + 'Movies%2Fa.mkv');
    assert.strictEqual(t.SMB.streamServerOf(STREAM + 'Movies%2Fa.mkv'), '');
});

test('a server added next to the first one is stored apart, and its URLs name it', function () {
    var t = load({ creds: NAS, paired: false });
    var p = t.pick('new');
    assert.deepStrictEqual(plain(p.items.map(function (i) { return i.code; })), ['', 'new']);
    t.type({ host: '\\\\192.168.1.5\\Films', share: '', user: 'tv', pass: 'pw2' });
    t.save();
    assert.strictEqual(t.first().host, 'nas', 'the first server is left alone');
    var extra = t.extra();
    assert.strictEqual(extra.length, 1);
    assert.strictEqual(extra[0].share, 'Films');
    assert.ok(extra[0].id);
    assert.strictEqual(t.SMB.findServer('192.168.1.5', 'FILMS'), extra[0].id);
    var u = t.SMB.streamUrl('a.mkv', extra[0].id);
    assert.strictEqual(u, STREAM + 'a.mkv&srv=' + extra[0].id);
    assert.strictEqual(t.SMB.streamServerOf(u), extra[0].id);
});

test('the first server added to an empty TV goes where older builds look', function () {
    var t = load({ paired: false });
    t.type({ host: 'nas', share: 'Media' });
    t.save();
    assert.strictEqual(t.first().share, 'Media');
    assert.strictEqual(t.extra().length, 0);
});

test('saving a server that is already in the list is refused', function () {
    var t = load({ creds: NAS, paired: false });
    t.pick('new');
    t.type({ host: 'NAS', share: 'media' });
    t.save();
    assert.strictEqual(t.extra().length, 0);
    assert.ok(t.toasts.indexOf(I18n.t('smb.duplicate')) >= 0, t.toasts.join(' | '));
});

test('removing a server asks first, and keeps it on Cancel', function () {
    var t = load({ creds: NAS, extra: [Object.assign({ id: 'x1' }, OTHER)], paired: false });
    t.pick('x1');
    t.remove('keep');
    assert.strictEqual(t.extra().length, 1);
    t.remove('remove');
    assert.strictEqual(t.extra().length, 0);
    assert.strictEqual(t.first().host, 'nas');
});

test('a stream opened from Recents connects the service to its server first', function () {
    var t = load({ creds: NAS, extra: [Object.assign({ id: 'x1' }, OTHER)], paired: false });
    var u = STREAM + 'a.mkv&srv=x1';
    t.SMB.ensureConnected('x1', function () {});
    assert.deepStrictEqual(plain(t.connected), ['x1']);
    t.SMB.ensureConnected('x1', function () {});
    assert.deepStrictEqual(plain(t.connected), ['x1'], 'an existing connection is reused');
});

test('parentPaths: the way back up from a folder opened straight from Favorites (issue #140)', function () {
    var SMB = load({ creds: NAS, paired: false }).SMB;
    assert.deepStrictEqual(plain(SMB.parentPaths('')), []);
    assert.deepStrictEqual(plain(SMB.parentPaths('/Shows')), ['']);
    assert.deepStrictEqual(plain(SMB.parentPaths('/Shows/Foo/Season 1')), ['', '/Shows', '/Shows/Foo']);
});
