const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, Buffer, TextEncoder, URL, Date, console, process,
    require: name => name in mocks ? mocks[name] : name === "@/lib/activity-model" ? load("lib/activity-model.ts") : require(name), ...globals };
  // Use this realm so the Firestore SDK recognizes plain objects constructed by the source.
  const evaluate = vm.runInThisContext(`(function(${Object.keys(context).join(',')}) {\n${code}\n})`, { filename: file });
  evaluate(...Object.values(context));
  return context.exports;
}
function memoryDb(initial) {
  const records = new Map(Object.entries(initial));
  let sequence = 0, queue = Promise.resolve();
  const snapshot = ref => ({ id: ref.id, ref, exists: records.has(ref.path), data: () => records.get(ref.path) });
  const read = ref => ref.path ? snapshot(ref) : (() => { const docs = [...records].filter(([key, data]) =>
    key.startsWith(ref.collection + '/') && (!ref.field || (Array.isArray(ref.value) ? ref.value.includes(data[ref.field]) : data[ref.field] === ref.value)))
    .slice(0, ref.max || Infinity).map(([key]) => snapshot(document(key)));
    return { docs, empty: docs.length === 0 };
  })();
  const document = path => ({ path, id: path.split('/').pop(), get: async () => snapshot(document(path)) });
  const db = {
    collection: name => ({
      doc: id => document(`${name}/${id || `generated-${++sequence}`}`),
      where: (field, op, value) => ({ collection: name, field, value, get: async () => read({ collection: name, field, value }), limit: max => ({ collection: name, field, value, max, get: async () => read({ collection: name, field, value, max }) }) }),
      get: async () => read({ collection: name }),
    }),
    runTransaction: callback => {
      const result = queue.then(async () => {
        const writes = [];
        const apply = (ref, patch, create) => {
          if (create && records.has(ref.path)) throw new Error('already exists');
          const data = { ...(records.get(ref.path) || {}) };
          for (const [key, value] of Object.entries(patch)) {
            if (value?.operation === 'delete') delete data[key];
            else if (value?.operation === 'increment') data[key] = (data[key] || 0) + value.amount;
            else data[key] = value;
          }
          records.set(ref.path, data);
        };
        const result = await callback({ get: async ref => read(ref),
          create: (ref, data) => writes.push(() => apply(ref, data, true)),
          set: (ref, data) => writes.push(() => apply(ref, data, false)),
          update: (ref, data) => writes.push(() => apply(ref, data, false)),
          delete: ref => writes.push(() => records.delete(ref.path)),
        });
        writes.forEach(write => write());
        return result;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  return { db, records };
}
const FieldValue = { delete: () => ({ operation: 'delete' }), increment: amount => ({ operation: 'increment', amount }), serverTimestamp: () => 123 };
module.exports = { load, memoryDb, FieldValue };
