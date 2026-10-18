var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
function fixture() {
    var mounted = [{ fullPath: '/removable1' }], smb = [{ id: '', host: 'nas', share: 'Media' }];
    var scope = { Browser: { listRoots: function (cb) { cb(null, mounted); } },
        SMB: { servers: function () { return smb; }, serverLabel: function () { return 'NAS'; }, ensureConnected: function (id, cb) { cb(null); } },
        WebDAV: { servers: function () { return []; } }, DLNA: { servers: function () { return [{ id: 'missing' }]; }, prepare: function (cb) { cb(null, [{ id: 'other' }]); }, choice: function (list, id) { return list.filter(function (s) { return s.id === id; })[0]; } },
        document: { querySelectorAll: function () { return []; } } };
    vm.runInNewContext(fs.readFileSync('tizen-app/js/library-ui.js', 'utf8'), scope);
    return { ui: scope.LibraryUI, unplug: function () { mounted = []; }, remove: function () { smb = []; } };
}
test('disconnected USB recommendations remain identified as unavailable, not deleted', function () {
    var f = fixture(); f.ui.refreshConnections();
    assert.equal(f.ui.offline({ kind: 'usb', path: '/removable1/Series' }), false);
    assert.equal(f.ui.offline({ kind: 'usb', path: '/removable10/Series' }), true);
    f.unplug(); f.ui.refreshConnections(); assert.equal(f.ui.offline({ kind: 'usb', path: '/removable1/Series' }), true);
});
test('removed sources and missing DLNA identity are unavailable even with another device present', function () {
    var f = fixture(); f.ui.refreshConnections();
    assert.equal(f.ui.offline({ kind: 'smb', srv: '' }), false);
    assert.equal(f.ui.offline({ kind: 'smb', srv: '', id: 'pin-id' }), false);
    assert.equal(f.ui.offline({ kind: 'dlna', srv: 'missing' }), true);
    f.remove(); assert.equal(f.ui.offline({ kind: 'smb', srv: '' }), true);
    assert.equal(f.ui.offline({ kind: 'url', path: 'https://example.com/a.mp4' }), false);
});
test('USB paths resolve through the virtual root on firmware that exposes physical full paths', function () {
    var f = fixture();
    assert.equal(f.ui.usbPath({ root: 'removable1', rootPath: '/opt/media/USB A' }, '/opt/media/USB A/Series'), 'removable1/Series');
});
test('startup connections are background work bounded to two SMB/WebDAV sources', function () {
    var waiting = [], started = 0;
    var scope = { Browser: { listRoots: function (cb) { cb(null, []); } },
        SMB: { servers: function () { return [1, 2, 3, 4, 5].map(function (n) { return { id: String(n) }; }); }, serverLabel: function () { return 'NAS'; },
            ensureConnected: function (id, cb) { started++; waiting.push(cb); } },
        WebDAV: { servers: function () { return []; } }, DLNA: { servers: function () { return []; } },
        document: { querySelectorAll: function () { return []; } } };
    vm.runInNewContext(fs.readFileSync('tizen-app/js/library-ui.js', 'utf8'), scope);
    scope.LibraryUI.refreshConnections();
    assert.equal(started, 2); assert.equal(waiting.length, 2);
    while (waiting.length) { assert.ok(waiting.length <= 2); waiting.shift()(null); }
    assert.equal(started, 5);
});
