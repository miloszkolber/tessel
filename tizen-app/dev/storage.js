/* Keep simulated data separate from real app storage. */
(function () {
    var native = window.localStorage;
    var prefix = 'tessel.demo.';
    var store = {
        getItem: function (key) { return native.getItem(prefix + key); },
        setItem: function (key, value) { native.setItem(prefix + key, value); },
        removeItem: function (key) { native.removeItem(prefix + key); },
        clear: function () {
            var keys = [];
            for (var i = 0; i < native.length; i++) if (native.key(i).indexOf(prefix) === 0) keys.push(native.key(i));
            keys.forEach(function (key) { native.removeItem(key); });
        }
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: store });
})();
