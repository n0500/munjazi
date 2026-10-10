import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schoolId = 'test-school';
const base = `schools/${schoolId}`;
const copyName = 'الأسبوع السابع';
const clone = value => structuredClone(value);

function fixture({ classes = 1, students = 40, skills = 3, sourceType = 'measurement' } = {}) {
    const records = new Map();
    const assignments = [];
    const statuses = ['mastered', 'needsSupport', 'notMastered', 'absent', null];
    for (let c = 1; c <= classes; c++) {
        const classId = `class-${c}`;
        const assignment = { id: `assignment-${c}`, classId, teacherUid: 'teacher', subject: 'English', active: true };
        assignments.push(assignment);
        records.set(`${base}/classTeacherAssignments/${assignment.id}`, assignment);
        const sourceId = `source-${c}`;
        const measurementId = sourceType === 'measurement' ? sourceId : `measurement-${c}`;
        records.set(`${base}/weeks/${sourceId}`, {
            classId, teacherUid: 'teacher', assignmentId: assignment.id, subject: 'English',
            name: 'الأسبوع السادس', type: sourceType, createdAt: { seconds: 1 },
            remediationStage: sourceType === 'remediation' ? 1 : null,
            sourceMeasurementWeekId: sourceType === 'remediation' ? measurementId : null,
        });
        if (sourceType === 'remediation') records.set(`${base}/weeks/${measurementId}`, {
            classId, teacherUid: 'teacher', assignmentId: assignment.id, subject: 'English',
            name: 'الأسبوع الرابع', type: 'measurement', createdAt: { seconds: 0 },
        });
        for (let s = 0; s < students; s++) records.set(`${base}/students/${classId}-student-${s}`, {
            currentClassId: classId, name: `Student ${String(s).padStart(2, '0')}`, archived: false,
        });
        records.set(`${base}/students/${classId}-archived`, { currentClassId: classId, name: 'Archived', archived: true });
        records.set(`${base}/students/${classId}-moved`, { currentClassId: 'other-class', name: 'Moved', archived: false });
        for (let k = 0; k < skills; k++) {
            const skillId = `${classId}-skill-${k}`;
            records.set(`${base}/skills/${skillId}`, {
                weekId: sourceId, classId, teacherUid: 'teacher', assignmentId: assignment.id,
                title: `Skill ${k}`, createdAt: { seconds: k + 1 }, archived: false,
            });
            for (const studentId of [...Array.from({ length: students }, (_, s) => `${classId}-student-${s}`), `${classId}-archived`, `${classId}-moved`]) {
                const s = Number(studentId.split('-').at(-1)) || 0;
                records.set(`${base}/assessments/${skillId}_${studentId}`, {
                    skillId, studentId, weekId: sourceId, classId, teacherUid: 'teacher',
                    assignmentId: assignment.id, status: statuses[s % statuses.length],
                    recommendationText: `Comment for ${studentId} / ${skillId}`,
                });
            }
        }
    }
    return { records, assignments };
}

async function harness(seed, { baseline = false, rejectBatches = false, failStudent = null } = {}) {
    const records = new Map([...seed.records].map(([key, value]) => [key, clone(value)]));
    const options = { rejectBatches, failStudent };
    const stats = { calls: 0, missingAssessmentReads: 0, assessmentReads: 0, batchCommits: 0, individualAssessmentWrites: 0, weekUpdates: 0, studentQueries: [] };
    let id = 0;
    let clock = 100;
    const ref = (...parts) => ({ path: parts.join('/') });
    const snapshot = target => ({ id: target.path.split('/').at(-1), ref: target, exists: () => records.has(target.path), data: () => clone(records.get(target.path)) });
    const permissionError = () => Object.assign(new Error('permission denied'), { code: 'permission-denied' });
    const fails = payload => options.failStudent && payload.studentId === options.failStudent;
    const applySet = (target, payload, merge) => {
        records.set(target.path, clone(merge ? { ...(records.get(target.path) || {}), ...payload } : payload));
    };
    const firestore = {
        collection: (_db, ...parts) => ref(...parts),
        doc: (_db, ...parts) => ref(...parts),
        query: (collection, ...constraints) => ({ ...collection, constraints }),
        where: (field, op, value) => ({ field, op, value }),
        orderBy: (field, direction = 'asc') => ({ order: field, direction }),
        serverTimestamp: () => ({ seconds: clock++ }),
        getDoc: async target => {
            stats.calls++;
            if (target.path.includes('/assessments/')) {
                stats.assessmentReads++;
                if (!records.has(target.path)) stats.missingAssessmentReads++;
            }
            return snapshot(target);
        },
        getDocs: async q => {
            stats.calls++;
            if (q.path.endsWith('/students')) stats.studentQueries.push(q.constraints || []);
            const prefix = `${q.path}/`;
            let rows = [...records].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'));
            for (const c of q.constraints || []) {
                if (c.order) rows.sort((a, b) => String(a[1][c.order]).localeCompare(String(b[1][c.order])) * (c.direction === 'desc' ? -1 : 1));
                else if (c.op === '==') rows = rows.filter(([, data]) => data[c.field] === c.value);
                else if (c.op === 'array-contains') rows = rows.filter(([, data]) => data[c.field]?.includes(c.value));
                else throw new Error(`Unsupported constraint: ${c.op}`);
            }
            const docs = rows.map(([key]) => snapshot({ path: key }));
            return { docs, empty: !docs.length };
        },
        addDoc: async (collection, payload) => {
            stats.calls++;
            const target = ref(collection.path, `generated-${++id}`);
            applySet(target, payload, false);
            return { ...target, id: target.path.split('/').at(-1) };
        },
        updateDoc: async (target, payload) => {
            stats.calls++;
            if (!records.has(target.path)) throw new Error('Document not found');
            if (target.path.includes('/weeks/')) stats.weekUpdates++;
            applySet(target, payload, true);
        },
        setDoc: async (target, payload, opts) => {
            stats.calls++;
            if (fails(payload)) throw permissionError();
            if (target.path.includes('/assessments/')) stats.individualAssessmentWrites++;
            applySet(target, payload, opts?.merge);
        },
        deleteDoc: async target => { stats.calls++; records.delete(target.path); },
        writeBatch: () => {
            const writes = [];
            return {
                set: (target, payload, opts) => writes.push({ target, payload, opts }),
                delete: target => writes.push({ target, deleted: true }),
                commit: async () => {
                    stats.calls++; stats.batchCommits++;
                    assert.ok(writes.length <= 10, 'Keep Firestore rules access-call limit protection');
                    if (options.rejectBatches || writes.some(w => fails(w.payload || {}))) throw permissionError();
                    for (const w of writes) {
                        if (w.deleted) records.delete(w.target.path);
                        else applySet(w.target, w.payload, w.opts?.merge);
                    }
                },
            };
        },
    };
    const context = vm.createContext({ console, TextEncoder, Set, Map });
    const firestoreModule = new vm.SyntheticModule(Object.keys(firestore), function () {
        for (const [key, value] of Object.entries(firestore)) this.setExport(key, value);
    }, { context });
    const firebaseModule = new vm.SyntheticModule(['db'], function () { this.setExport('db', {}); }, { context });
    const modules = new Map();
    function load(file) {
        file = path.posix.normalize(file);
        if (file === 'app/lib/firebase.js') return firebaseModule;
        if (modules.has(file)) return modules.get(file);
        const override = path.join(repo, '.patches', file);
        const source = !baseline && fs.existsSync(override)
            ? fs.readFileSync(override, 'utf8')
            : execFileSync('unzip', ['-p', path.join(repo, 'munjazi-update.zip'), file], { encoding: 'utf8' });
        const mod = new vm.SourceTextModule(source, { context, identifier: file });
        modules.set(file, mod);
        return mod;
    }
    const entry = load('app/lib/weeksApi.js');
    await entry.link((specifier, referencing) => specifier === 'firebase/firestore'
        ? firestoreModule
        : load(path.posix.join(path.posix.dirname(referencing.identifier), specifier)));
    await entry.evaluate();
    return { api: entry.namespace, records, stats, options, modules };
}

const params = assignments => ({ sourceAssignmentId: assignments[0].id, sourceWeekId: 'source-1', targetAssignmentIds: assignments.map(a => a.id), targetName: copyName, targetType: 'remediation' });
const weeksNamed = (records, name) => [...records].filter(([key, data]) => key.includes('/weeks/') && data.name === name);
const assessmentsFor = (records, weekId) => [...records].filter(([key, data]) => key.includes('/assessments/') && data.weekId === weekId);

test('three classes keep their own skills, students, comments and accurate summaries, with fewer requests', async () => {
    const seed = fixture({ classes: 3 });
    const h = await harness(seed);
    const progress = [];
    const delivered = [];
    const results = await h.api.copyWeekToMultipleAssignments(schoolId, { ...params(seed.assignments), onProgress: p => progress.push(p), onResult: r => delivered.push(r) });
    assert.equal(results.length, 3);
    assert.ok(results.every(r => r.ok));
    assert.deepEqual(delivered.map(r => r.assignmentId), seed.assignments.map(a => a.id));
    for (let c = 1; c <= 3; c++) {
        const result = results[c - 1];
        const target = h.records.get(`${base}/weeks/${result.id}`);
        assert.equal(target.classId, `class-${c}`);
        assert.equal(target.sourceMeasurementWeekId, `source-${c}`);
        assert.equal(target.remediationStage, 1);
        assert.equal(target.studentSnapshot.length, 40);
        const copied = assessmentsFor(h.records, result.id);
        assert.equal(copied.length, 120);
        for (const [, data] of copied) {
            assert.ok(data.studentId.startsWith(`class-${c}-student-`));
            const skill = h.records.get(`${base}/skills/${data.skillId}`);
            const source = seed.records.get(`${base}/assessments/${skill.copySourceSkillId}_${data.studentId}`);
            assert.equal(data.status, source.status);
            assert.equal(data.recommendationText, source.recommendationText);
        }
        assert.deepEqual(target.summaryCounts, { mastered: 24, needsSupport: 24, notMastered: 24, absent: 24 });
        const writes = progress.filter(p => p.assignmentId === seed.assignments[c - 1].id && ['assessments', 'summary'].includes(p.phase));
        assert.equal(writes.at(-1).completedAssessments, 120);
        assert.ok(writes.every((p, i) => i === 0 || p.completedAssessments >= writes[i - 1].completedAssessments));
    }
    assert.equal(h.stats.missingAssessmentReads, 0);
    assert.equal(h.stats.individualAssessmentWrites, 0);
    assert.equal(h.stats.batchCommits, 36);
    assert.ok(h.stats.studentQueries.every(q => q.some(c => c.field === 'currentClassId' && c.op === '==')));
    const legacy = await harness(seed, { baseline: true });
    const legacyResults = await legacy.api.copyWeekToMultipleAssignments(schoolId, params(seed.assignments));
    assert.ok(legacyResults.every(r => r.ok));
    assert.equal(legacy.stats.missingAssessmentReads, 360);
    assert.ok(h.stats.calls < legacy.stats.calls / 5);
    console.log(`Three classes, 40 students, 3 skills: ${legacy.stats.calls} -> ${h.stats.calls} mocked network requests.`);
});

test('retry fills only missing assessments and preserves manual edits and null status', async () => {
    const seed = fixture({ skills: 1 });
    const h = await harness(seed, { failStudent: 'class-1-student-3' });
    const failed = await h.api.copyWeekToMultipleAssignments(schoolId, params(seed.assignments));
    assert.equal(failed[0].ok, false);
    assert.match(failed[0].error, /تعذّر حفظ/);
    const [[weekPath]] = weeksNamed(h.records, copyName);
    const weekId = weekPath.split('/').at(-1);
    const written = assessmentsFor(h.records, weekId);
    assert.equal(written.length, 39);
    const [editedPath, edited] = written.find(([, a]) => a.studentId === 'class-1-student-0');
    h.records.set(editedPath, { ...edited, status: 'notMastered', recommendationText: 'Manual edit retained' });
    const [nullPath, nullRow] = written.find(([, a]) => a.studentId === 'class-1-student-4');
    h.records.set(nullPath, { ...nullRow, status: null });
    h.options.failStudent = null;
    const retried = await h.api.copyWeekToMultipleAssignments(schoolId, params(seed.assignments));
    assert.equal(retried[0].ok, true);
    assert.equal(retried[0].resumed, true);
    assert.equal(retried[0].copiedSkills, 0);
    assert.equal(retried[0].copiedAssessments, 1);
    assert.equal(weeksNamed(h.records, copyName).length, 1);
    assert.equal(assessmentsFor(h.records, weekId).length, 40);
    assert.equal(h.records.get(editedPath).status, 'notMastered');
    assert.equal(h.records.get(editedPath).recommendationText, 'Manual edit retained');
    assert.equal(h.records.get(nullPath).status, null);
});

test('batch rejection falls back to individual writes and retains comments', async () => {
    const seed = fixture({ students: 13, skills: 1 });
    const h = await harness(seed, { rejectBatches: true });
    const results = await h.api.copyWeekToMultipleAssignments(schoolId, params(seed.assignments));
    assert.equal(results[0].ok, true);
    const rows = assessmentsFor(h.records, results[0].id);
    assert.equal(rows.length, 13);
    assert.ok(rows.every(([, row]) => row.recommendationText.startsWith('Comment for')));
    assert.equal(h.stats.batchCommits, 2);
    assert.equal(h.stats.individualAssessmentWrites, 13);
});

test('selected remediation skills keep their source measurement and stage', async () => {
    const seed = fixture({ sourceType: 'remediation' });
    const h = await harness(seed);
    const results = await h.api.copyWeekToMultipleAssignments(schoolId, { ...params(seed.assignments), selectedSkillTitles: ['Skill 1'] });
    assert.equal(results[0].ok, true);
    const target = h.records.get(`${base}/weeks/${results[0].id}`);
    assert.equal(target.remediationStage, 2);
    assert.equal(target.previousRemediationWeekId, 'source-1');
    assert.equal(target.sourceMeasurementWeekId, 'measurement-1');
    assert.equal(results[0].copiedSkills, 1);
    assert.equal(assessmentsFor(h.records, results[0].id).length, 40);
});

test('different subjects and teachers are rejected without creating their target weeks', async () => {
    const seed = fixture({ classes: 3 });
    seed.records.get(`${base}/classTeacherAssignments/assignment-2`).subject = 'Math';
    seed.records.get(`${base}/classTeacherAssignments/assignment-3`).teacherUid = 'other-teacher';
    const h = await harness(seed);
    const results = await h.api.copyWeekToMultipleAssignments(schoolId, params(seed.assignments));
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, false);
    assert.equal(results[2].ok, false);
    assert.equal(weeksNamed(h.records, copyName).length, 1);
});

test('an unrelated existing target week is not merged or overwritten', async () => {
    const seed = fixture({ skills: 1 });
    seed.records.set(`${base}/weeks/manual-week`, {
        classId: 'class-1', teacherUid: 'teacher', assignmentId: 'assignment-1', subject: 'English',
        name: copyName, type: 'remediation', createdAt: { seconds: 2 },
    });
    const h = await harness(seed);
    const results = await h.api.copyWeekToMultipleAssignments(schoolId, params(seed.assignments));
    assert.equal(results[0].ok, false);
    assert.match(results[0].error, /ليس نسخة/);
    assert.equal(weeksNamed(h.records, copyName).length, 1);
    assert.equal(assessmentsFor(h.records, 'manual-week').length, 0);
});

test('copy flags support skills only and comments without statuses', async () => {
    for (const copyComments of [false, true]) {
        const seed = fixture({ students: 7, skills: 1 });
        const h = await harness(seed);
        const results = await h.api.copyWeekToMultipleAssignments(schoolId, { ...params(seed.assignments), copyAssessments: false, copyComments });
        assert.equal(results[0].ok, true);
        const rows = assessmentsFor(h.records, results[0].id);
        assert.equal(rows.length, copyComments ? 7 : 0);
        assert.ok(rows.every(([, a]) => a.status === null && a.recommendationText));
    }
});
