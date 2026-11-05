/* Adapted from upstream 4f895604d586/b7e975da0ee3. The service is already
 * one source file. Wrap its scope for modern shared runtimes while keeping
 * Node built-ins external and copying lifecycle exports to the host. */
'use strict';
var fs = require('fs'), path = require('path');
var target = process.argv[2];
if (!target) throw new Error('usage: node scripts/bundle-service.js <out.js>');
var source = fs.readFileSync(path.join(__dirname, '../tizen-app/service/service.js'), 'utf8');
if (/require\(['"]\./.test(source)) throw new Error('service must remain self-contained');
var output = '/* Generated from service/service.js. Do not edit. */\n' +
    '(function (hostModule, nodeRequire) {\n' +
    'var local = { exports: {} };\n' +
    '(function (module, exports, require) {\n' + source + '\n})(local, local.exports, nodeRequire);\n' +
    'if (hostModule && hostModule.exports) for (var k in local.exports) hostModule.exports[k] = local.exports[k];\n' +
    '})(typeof module === "object" ? module : null, typeof require === "function" ? require : null);\n';
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, output);
