/* One modal owner for context menus, forms and URL receipt. */
var Dialog = (function () {
    'use strict';
    var active = null;
    function close(restore) {
        if (!active) return;
        var old = active; active = null;
        Remote.pop(old.keys);
        old.root.parentNode.removeChild(old.root);
        if (old.dispose) old.dispose();
        if (restore !== false) UI.restoreFocus(old.returnTo);
        else UI.refreshFocusables();
    }
    function open(title, options) {
        options = options || {};
        close(false);
        var root = document.createElement('div'); root.id = 'library-modal'; root.className = 'dialog-scrim';
        var card = document.createElement('div'); card.className = 'dialog-card';
        card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
        var heading = document.createElement('h2'); heading.id = 'dialog-title'; heading.textContent = title; heading.title = title;
        card.setAttribute('aria-labelledby', heading.id);
        var body = document.createElement('div'); body.className = 'dialog-body';
        var footer = document.createElement('div'); footer.className = 'dialog-footer';
        card.appendChild(heading); card.appendChild(body); card.appendChild(footer); root.appendChild(card); document.body.appendChild(root);
        var item = { root: root, body: body, footer: footer, returnTo: options.returnTo || document.activeElement, dispose: options.dispose };
        item.keys = Remote.push(function (code, ev) {
            var K = Remote.KEY;
            if (code === K.BACK) { if (options.back) options.back(); else close(); return true; }
            if (code === K.TAB) { UI.moveFocusCyclic(ev && ev.shiftKey ? -1 : 1); return true; }
            if (code === K.ENTER) { if (document.activeElement.tagName !== 'INPUT') UI.activateFocused(); return document.activeElement.tagName !== 'INPUT'; }
            if (code === K.UP || code === K.DOWN) {
                var rows = Array.prototype.slice.call(card.querySelectorAll('button,input,[tabindex]')).filter(function (el) { return !el.disabled && !el.closest('.hidden') && el.offsetParent !== null; });
                if (!rows.length) { UI.scrollBy(body, code === K.UP ? -200 : 200); return true; }
                var at = rows.indexOf(document.activeElement);
                UI.focusOn(rows[Math.max(0, Math.min(rows.length - 1, at + (code === K.DOWN ? 1 : -1)))]);
                return true;
            }
            if (code === K.LEFT || code === K.RIGHT) return document.activeElement.tagName !== 'INPUT';
            return false;
        });
        active = item;
        item.focus = function () { UI.refreshFocusables(); UI.focusOn(body.querySelector('[data-focus],button,input,[tabindex]') || footer.querySelector('button') || card); };
        card.tabIndex = -1;
        return item;
    }
    function menu(title, items, returnTo) {
        var d = open(title, { returnTo: returnTo });
        items.forEach(function (item) {
            var b = document.createElement('button'); b.className = 'dialog-option'; b.textContent = item.name;
            b.addEventListener('click', function () { close(false); item.run(); });
            d.body.appendChild(b);
        });
        d.focus();
    }
    function rename(title, value, save, returnTo) {
        var d = open(title, { returnTo: returnTo });
        var input = document.createElement('input'); input.value = value; input.setAttribute('aria-label', title);
        var b = document.createElement('button'); b.className = 'btn primary'; b.textContent = I18n.t('saved.done');
        function commit() { var name = input.value.trim(); if (!name) { input.focus(); return; } close(false); save(name); }
        b.addEventListener('click', commit);
        input.addEventListener('keydown', function (ev) { if (ev.keyCode === 13) { ev.preventDefault(); ev.stopPropagation(); commit(); } });
        d.body.appendChild(input); d.footer.appendChild(b); d.focus();
    }
    return { open: open, close: close, menu: menu, rename: rename, isOpen: function () { return !!active; } };
})();
