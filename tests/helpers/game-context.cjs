const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function gameContext() {
  const source = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
  // Load the complete production engine, excluding only browser/cloud boot.
  const boot = source.lastIndexOf('(async()=>');
  if (boot < 0) throw Error('Application boot boundary missing');
  const context = vm.createContext({
    console, performance, structuredClone, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, window: {},
    document: { querySelector: () => ({}), addEventListener: () => {} },
  });
  vm.runInContext(source.slice(0, boot).replace(/^import .*;\s*$/m, ''), context);
  return context;
};
