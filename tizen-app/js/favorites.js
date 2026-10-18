/* favorites.js — Home pins for sources, device roots, folders and URLs.
 *
 * The next episode of a show sits in a folder several levels down a share;
 * pinning that folder (► on its row) floats it to the top of the listing it
 * lives in, so it is one step away next time. Each entry is
 *   { id, kind: 'smb', name, srv, path }          a folder on a share
 *   { id, kind: 'webdav', name, srv, path }       a folder on a WebDAV server (#145)
 *   { id, kind: 'usb', name, path, root, rootPath } a folder on local storage
 * DLNA uses the device identity and object ID. URL pins use the complete URL
 * as their path. Existing folder pins retain their identity during migration.
 *
 * `srv` is the saved SMB server's id ('' for the first one) or the WebDAV
 * server's, `path` the folder below the root ('/Shows/Foo').  On USB `path`
 * is the folder's full path, `root` the Tizen virtual root it is on
 * (removable_…) and `rootPath` that root's full path, so the folder can be
 * opened again through the virtual-root form that every firmware resolves.
 *
 * ES5 on purpose, like the rest of the app. */

var Favorites = (function () {
    'use strict';

    var KEY = 'vlctv_favorites_v1';

    /* The same folder: on a server, the same server and path; on USB, the
     * same full path. */
    function onServer(kind) { return kind === 'smb' || kind === 'webdav' || kind === 'dlna'; }
    function isKind(kind) { return onServer(kind) || kind === 'usb' || kind === 'url'; }
    function same(a, b) {
        if (!a || !b || a.kind !== b.kind) return false;
        if (onServer(a.kind)) return String(a.srv || '') === String(b.srv || '') && a.path === b.path;
        return a.path === b.path;
    }

    function create(storage) {
        function list() {
            var raw = null;
            try { raw = storage && storage.getItem(KEY); } catch (e) {}
            var v = null;
            try { v = raw ? JSON.parse(raw) : []; } catch (e) {}
            if (!Array.isArray(v)) return [];
            return v.filter(function (f) {
                return f && isKind(f.kind) && typeof f.path === 'string';
            });
        }
        function write(items) {
            try { storage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
        }
        function indexOf(items, id) {
            for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
            return -1;
        }
        function newId(items) {
            var id;
            do { id = Math.random().toString(36).slice(2, 10); } while (indexOf(items, id) >= 0);
            return id;
        }

        function get(id) {
            var items = list();
            var i = indexOf(items, id);
            return i >= 0 ? items[i] : null;
        }
        /* The pinned entry for this folder, or null. */
        function find(folder) {
            var items = list();
            for (var i = 0; i < items.length; i++) if (same(items[i], folder)) return items[i];
            return null;
        }
        /* Pinning a folder that is already pinned doesn't add it twice: the
         * entry it already has is returned untouched. */
        function add(folder) {
            if (!folder || !isKind(folder.kind)) return null;
            if (typeof folder.path !== 'string' || !folder.path) return null;
            var items = list();
            var dup = find(folder);
            if (dup) return dup;
            var item = { id: newId(items), kind: folder.kind, path: folder.path,
                         name: String(folder.name || '').trim() || folder.path.split('/').pop() || folder.path };
            if (onServer(folder.kind)) item.srv = String(folder.srv || '');
            else {
                if (folder.root)     item.root     = String(folder.root);
                if (folder.rootPath) item.rootPath = String(folder.rootPath);
            }
            items.push(item);
            write(items);
            return item;
        }
        function remove(id) {
            write(list().filter(function (f) { return f.id !== id; }));
        }

        function rename(id, name) {
            var items = list();
            items.forEach(function (f) { if (f.id === id) f.name = String(name).trim() || f.name; });
            write(items);
        }

        return { KEY: KEY, list: list, get: get, find: find, add: add, remove: remove, rename: rename, same: same };
    }

    var api = create(typeof localStorage !== 'undefined' ? localStorage : null);
    api.create = create;
    return api;
})();

// Ignored by the Tizen/browser build; lets Node tests require these helpers.
if (typeof module !== 'undefined' && module.exports) module.exports = Favorites;
