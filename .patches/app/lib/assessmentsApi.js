import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, serverTimestamp, writeBatch, } from 'firebase/firestore';
import { db } from './firebase.js';

async function touchWeekAssessment(schoolId, weekId) {
    try {
        await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
            lastAssessmentAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('تعذّر تحديث وقت الرصد:', err);
    }
}

export function assessmentDocId(skillId, studentId) {
    return `${skillId}_${studentId}`;
}

function assessmentPayload({ skillId, weekId, classId, teacherUid, assignmentId, studentId, status, recommendationText }) {
    const payload = {
        skillId,
        weekId,
        classId,
        teacherUid,
        assignmentId: assignmentId || null,
        studentId,
        status: status || null,
        updatedAt: serverTimestamp(),
    };
    if (recommendationText !== undefined) payload.recommendationText = recommendationText || '';
    return payload;
}

/**
 * حفظ جماعي متين للرصد.
 * نستخدم دفعات صغيرة جدًا (10) لأن قواعد Firestore قد تحتوي get()/exists()
 * لكل كتابة، وللدفعات حد إجمالي لقراءات قواعد الأمان. الدفعات الكبيرة قد تفشل
 * بصلاحيات رغم أن الكتابة الفردية نفسها مسموحة. إذا فشلت دفعة، نعيد عناصرها
 * ككتابات فردية على مجموعات صغيرة بدل إسقاط العملية كاملة.
 */
async function writeAssessmentRowsResilient(schoolId, common, rows = [], onProgress = null) {
    const cleanRows = (rows || []).filter((r) => r?.skillId && r?.studentId);
    onProgress?.({ written: 0, total: cleanRows.length });
    if (!cleanRows.length) return { written: 0 };

    const batchSize = 10;
    let written = 0;
    const failed = [];

    for (let i = 0; i < cleanRows.length; i += batchSize) {
        const chunk = cleanRows.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach((row) => {
            const payload = assessmentPayload({ ...common, ...row });
            batch.set(
                doc(db, 'schools', schoolId, 'assessments', assessmentDocId(row.skillId, row.studentId)),
                payload,
                { merge: true },
            );
        });

        try {
            // eslint-disable-next-line no-await-in-loop
            await batch.commit();
            written += chunk.length;
            onProgress?.({ written, total: cleanRows.length });
            continue;
        } catch (batchErr) {
            // بعض قواعد Firestore ترفض batch كبير بسبب access-call limits.
            // نجرب نفس العناصر ككتابات فردية؛ هذا يطابق مسار الرصد اليدوي.
            for (let j = 0; j < chunk.length; j += 5) {
                const group = chunk.slice(j, j + 5);
                // eslint-disable-next-line no-await-in-loop
                const results = await Promise.allSettled(group.map((row) => setDoc(
                    doc(db, 'schools', schoolId, 'assessments', assessmentDocId(row.skillId, row.studentId)),
                    assessmentPayload({ ...common, ...row }),
                    { merge: true },
                )));
                results.forEach((result, idx) => {
                    if (result.status === 'fulfilled') written += 1;
                    else failed.push({ row: group[idx], error: result.reason || batchErr });
                });
                onProgress?.({ written, total: cleanRows.length });
            }
        }
    }

    if (failed.length) {
        const err = new Error(`تم حفظ ${written} رصدًا، وتعذّر حفظ ${failed.length} رصدًا. أعيدي المحاولة.`);
        err.code = 'partial-assessment-write';
        err.failedRows = failed.map((x) => x.row);
        err.writtenCount = written;
        throw err;
    }
    return { written };
}

export async function listAssessmentsForSkill(schoolId, skillId) {
    const q = query(collection(db, 'schools', schoolId, 'assessments'), where('skillId', '==', skillId));
    const snap = await getDocs(q);
    const map = {};
    snap.docs.forEach((d) => { const data = d.data(); map[data.studentId] = data; });
    return map;
}
export async function listAssessmentsForWeek(schoolId, weekId) {
    const q = query(collection(db, 'schools', schoolId, 'assessments'), where('weekId', '==', weekId));
    const snap = await getDocs(q);
    const bySkill = {};
    snap.docs.forEach((d) => {
        const data = d.data();
        if (!bySkill[data.skillId]) bySkill[data.skillId] = {};
        bySkill[data.skillId][data.studentId] = data;
    });
    return bySkill;
}
export async function listAssessmentsForStudent(schoolId, studentId) {
    const q = query(
        collection(db, 'schools', schoolId, 'assessments'),
        where('studentId', '==', studentId),
    );
    const snap = await getDocs(q);
    const bySkill = {};
    snap.docs.forEach((d) => {
        const data = d.data();
        if (data.skillId)
            bySkill[data.skillId] = data;
    });
    return bySkill;
}
export async function getStudentAssessment(schoolId, skillId, studentId) {
    const id = assessmentDocId(skillId, studentId);
    const q = query(collection(db, 'schools', schoolId, 'assessments'), where('skillId', '==', skillId), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    const assessment = snap.docs.find((d) => d.id === id);
    return assessment ? assessment.data() : null;
}
export async function assessmentExists(schoolId, skillId, studentId) {
    const snap = await getDoc(doc(db, 'schools', schoolId, 'assessments', assessmentDocId(skillId, studentId)));
    return snap.exists();
}
export async function clearAssessmentsForSkills(schoolId, skillIds = []) {
    const ids = [...new Set((skillIds || []).filter(Boolean))];
    for (const skillId of ids) {
        // كل مهارة جديدة يجب أن تبدأ «غير مرصودة».
        // eslint-disable-next-line no-await-in-loop
        const snap = await getDocs(query(collection(db, 'schools', schoolId, 'assessments'), where('skillId', '==', skillId)));
        if (snap.empty) continue;
        // الحذف على دفعات صغيرة أيضًا لتجنب حدود استدعاءات قواعد الأمان.
        const chunkSize = 10;
        for (let i = 0; i < snap.docs.length; i += chunkSize) {
            const batch = writeBatch(db);
            snap.docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
            // eslint-disable-next-line no-await-in-loop
            await batch.commit();
        }
    }
}
export async function recomputeWeekSummary(schoolId, weekId) {
    try {
        const assessmentsBySkill = await listAssessmentsForWeek(schoolId, weekId);
        const counts = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
        Object.values(assessmentsBySkill).forEach((assessments) => {
            Object.values(assessments || {}).forEach((a) => {
                if (a.status && counts[a.status] !== undefined) counts[a.status] += 1;
            });
        });
        await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
            summaryCounts: counts,
            summaryUpdatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('تعذّر تحديث ملخّص الأسبوع:', err);
    }
}
export async function setAssessment(schoolId, { skillId, weekId, classId, teacherUid, assignmentId, studentId, status, recommendationText = undefined, skipSummary = false, }) {
    const id = assessmentDocId(skillId, studentId);
    const payload = assessmentPayload({ skillId, weekId, classId, teacherUid, assignmentId, studentId, status });
    if (recommendationText !== undefined) payload.recommendationText = recommendationText || '';
    await setDoc(doc(db, 'schools', schoolId, 'assessments', id), payload, { merge: true });
    await touchWeekAssessment(schoolId, weekId);
    if (!skipSummary) await recomputeWeekSummary(schoolId, weekId);
}

export async function setAssessmentsBulk(schoolId, { rows = [], weekId, classId, teacherUid, assignmentId, onProgress = null, }) {
    let written = 0;
    try {
        const result = await writeAssessmentRowsResilient(schoolId, { weekId, classId, teacherUid, assignmentId }, rows, onProgress);
        written = result.written;
        return result;
    } catch (err) {
        written = err.writtenCount || 0;
        throw err;
    } finally {
        // تحديث واحد للأسبوع بعد الدفعات، حتى عند الحاجة إلى استكمال حفظ جزئي.
        if (written > 0) await touchWeekAssessment(schoolId, weekId);
        await recomputeWeekSummary(schoolId, weekId);
    }
}

export async function setAllMasteredForSkill(schoolId, { skillId, weekId, classId, teacherUid, assignmentId, studentIds, }) {
    return setAssessmentsBulk(schoolId, {
        weekId,
        classId,
        teacherUid,
        assignmentId,
        rows: (studentIds || []).map((studentId) => ({ skillId, studentId, status: 'mastered' })),
    });
}
export async function setAllMasteredForWeek(schoolId, { skills, weekId, classId, teacherUid, assignmentId, studentIds, }) {
    const rows = [];
    for (const skill of skills || []) {
        for (const studentId of studentIds || []) rows.push({ skillId: skill.id, studentId, status: 'mastered' });
    }
    return setAssessmentsBulk(schoolId, { rows, weekId, classId, teacherUid, assignmentId });
}
