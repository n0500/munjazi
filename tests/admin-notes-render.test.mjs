import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const app = resolve('.deploy-app');
const require = createRequire(join(app, 'package.json'));
const { build } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const temp = await mkdtemp(join(app, '.notes-test-'));
after(() => rm(temp, { recursive: true, force: true }));
const outfile = join(temp, 'notes.mjs');
await build({
  entryPoints: [resolve('.patches/app/components/AdminNotes.jsx')],
  outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'test-auth', setup(build) {
    build.onResolve({ filter: /AuthContext\.js$/ }, () => ({ path: 'auth', namespace: 'mock' }));
    build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const useAuth = () => ({profile: {uid: "test-teacher"}});' }));
    build.onResolve({ filter: /^\.\.\/lib\// }, args => ({ path: resolve(app, 'app/lib', args.path.split('/').pop()) }));
  } }],
});
const { default: AdminNotes } = await import(pathToFileURL(outfile));
for (const [label, isAdmin, search] of [['admin', true, ''], ['teacher', false, ''], ['teacher direct link', false, '?notes=1']]) {
  test(`notes renders for ${label}`, () => {
    globalThis.window = { location: { search } };
    const html = renderToStaticMarkup(React.createElement(AdminNotes, { schoolId: 'test-school', isAdmin }));
    if (isAdmin) {
      // Single list: summary, filters and footer actions; no general note form.
      assert.match(html, /بانتظار المتابعة/);
      assert.match(html, /أرقام المعلمات/);
      assert.doesNotMatch(html, /حفظ وإشعار المعلمة/);
      assert.doesNotMatch(html, /تقرير متابعة الملاحظات الإدارية<\/h3>/);
    } else {
      assert.match(html, /ملاحظات الإدارة/);
    }
    if (search) assert.match(html, /جميع الملاحظات/);
  });
}
