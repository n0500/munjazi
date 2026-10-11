import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(process.env.MUNJAZI_TEST_APP || join(repo, '.deploy-app'));
const requireFromApp = createRequire(join(app, 'package.json'));
const { build } = await import(pathToFileURL(requireFromApp.resolve('esbuild')));
const React = requireFromApp('react');
const { Font, renderToBuffer } = await import(pathToFileURL(requireFromApp.resolve('@react-pdf/renderer')));
const temp = await mkdtemp(join(app, '.pdf-regression-'));
after(() => rm(temp, { recursive: true, force: true }));

// Exercise the same document that the deployment overlays on the ZIP source.
const output = join(temp, 'document.mjs');
await build({
  entryPoints: [join(app, 'app/pages/TeacherAllClassesReportDocument.jsx')],
  outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external',
});
const { default: Report } = await import(pathToFileURL(output));

// Standard fonts keep CI independent of the external font CDN. Local visual QA
// can supply the report's actual Arabic fonts without changing its source.
const fontDir = process.env.MUNJAZI_TEST_FONT_DIR;
Font.getFont({ fontFamily: 'Plex' }).src = fontDir ? join(fontDir, 'Plex-Regular.ttf') : 'Helvetica';
Font.getFont({ fontFamily: 'Plex-Bold' }).src = fontDir ? join(fontDir, 'Plex-Bold.ttf') : 'Helvetica-Bold';

function reportData(counts) {
  return {
    schoolName: 'مدرسة اختبار', teacherName: 'معلمة الاختبار', principalName: 'مديرة المدرسة',
    fromWeekName: 'الأسبوع الرابع', toWeekName: 'الأسبوع السابع', generatedDate: '2026-10-11',
    classesWithData: 3, overallMasteryPercent: 100, overallCompletenessPercent: 100,
    overallStatusCounts: counts,
    executiveSummary: ['بيانات تجريبية للتحقق من تصدير تحليل الفصول.'],
    classes: [{
      assignmentId: 'class-1', className: 'أول ثانوي 1', subject: 'لغة إنجليزية',
      latest: { masteryPercent: 100, attentionPercent: 0, weekName: 'الأسبوع السابع', weekTypeLabel: 'قياس' },
      completenessPercent: 100, masteryChange: 10, analysis: 'تحسن مستوى الإتقان خلال الفترة.',
    }],
    overallTrend: [{ weekName: 'الأسبوع السابع', counts, masteryPercent: 100 }],
    problemSkills: [{ key: 'skill-1', title: 'Grammar', masteryPercent: 70, classesCount: 1 }],
    strongestSkills: [{ key: 'skill-2', title: 'Reading', masteryPercent: 100 }],
    heatmap: [{ className: 'أول ثانوي 1', cells: [{ key: 'skill-1', masteryPercent: 70 }] }],
    remediation: { averageImpact: 10, movement: { improved: 2, toMastered: 2 }, rows: [{
      className: 'أول ثانوي 1', beforePercent: 90, afterPercent: 100, impact: 10, matchedSkills: 1,
    }] },
    priorities: ['الاستمرار في متابعة المهارات.'], alerts: [],
  };
}

function contentStreams(buffer) {
  const text = buffer.toString('latin1');
  return [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap((match) => {
    try { return [inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')]; }
    catch { return []; }
  }).join('\n');
}

const cases = [
  ['mastered', { mastered: 120 }],
  ['needs-support', { needsSupport: 120 }],
  ['not-mastered', { notMastered: 120 }],
  ['absent', { absent: 120 }],
  ['mixed', { mastered: 80, needsSupport: 20, notMastered: 15, absent: 5 }],
  ['mostly-mastered', { mastered: 119, needsSupport: 1 }],
  ['empty', { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 }],
  ['missing-counts', undefined],
];

for (const [name, counts] of cases) {
  test(`exports a complete all-classes PDF: ${name}`, async () => {
    const buffer = await renderToBuffer(React.createElement(Report, { data: reportData(counts) }));
    const text = buffer.toString('latin1');
    assert.ok(text.startsWith('%PDF-'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.equal((text.match(/\/Type \/Page\b/g) || []).length, 4);
    const streams = contentStreams(buffer);
    const dashPatterns = [...streams.matchAll(/\[([^\]]+)\]\s+[-\d.]+\s+d\b/g)];
    for (const [, values] of dashPatterns) {
      assert.ok(values.trim().split(/\s+/).every((value) => Number(value) > 0), 'PDF dash lengths must be positive');
    }
    const active = Object.values(counts || {}).filter((value) => value > 0).length;
    assert.equal(dashPatterns.length, active > 1 ? active : 0);
    if (process.env.MUNJAZI_TEST_OUTPUT_DIR && ['mastered', 'mixed'].includes(name)) {
      await writeFile(join(process.env.MUNJAZI_TEST_OUTPUT_DIR, `${name}.pdf`), buffer);
    }
  });
}
