import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp, writeBatch, Timestamp, } from 'firebase/firestore';
import { db } from './firebase.js';
import { listWeeksForClass } from './weeksApi.js';
import { listSkillsForWeek } from './skillsApi.js';
import { listAssessmentsForSkill } from './assessmentsApi.js';
import { listClassStudents } from './studentsApi.js';
import { listRecommendationsForWeek } from './weekRecommendationsApi.js';
import { STATUS_LABELS } from './recommendationsApi.js';
import { assignmentGroupIds, interpretFollowUp, normalizeSubject, normalizeWeekName } from './dataLogic.js';
const CONCERNING_STATUSES = ['needsSupport', 'notMastered'];
async function legacyScopeIsUnambiguous(schoolId, classId, teacherUid) {
    const q = query(collection(db, 'schools', schoolId, 'classTeacherAssignments'), where('classId', '==', classId));
    const snap = await getDocs(q);
    const subjects = new Set(snap.docs
        .map((d) => d.data())
        .filter((a) => a.teacherUid === teacherUid)
        .map((a) => normalizeSubject(a.subject)));
    return subjects.size <= 1;
}
async function assignmentScopeIds(schoolId, classId, teacherUid, assignmentId) {
    if (!assignmentId)
        return [];
    const q = query(collection(db, 'schools', schoolId, 'classTeacherAssignments'), where('classId', '==', classId));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const target = rows.find((a) => a.id === assignmentId);
    if (!target)
        return [assignmentId];
    const ids = assignmentGroupIds(rows, teacherUid, target.subject);
    return ids.length ? ids : [assignmentId];
}
export async function suggestCandidates(schoolId, classId, teacherUid, assignmentId = null) {
    const weeks = (await listWeeksForClass(schoolId, classId, teacherUid, assignmentId)).slice().reverse();
    if (weeks.length === 0)
        return [];
    const students = await listClassStudents(schoolId, classId);
    const studentNameById = {};
    students.forEach((student) => { studentNameById[student.id] = student.name; });
    const skillHistoryByTitle = {};
    for (const week of weeks) {
        // eslint-disable-next-line no-await-in-loop
        const skills = await listSkillsForWeek(schoolId, week.id);
        for (const skill of skills) {
            // eslint-disable-next-line no-await-in-loop
            const assessments = await listAssessmentsForSkill(schoolId, skill.id);
            const statuses = {};
            Object.entries(assessments).forEach(([studentId, data]) => { statuses[studentId] = data.status; });
            if (!skillHistoryByTitle[skill.title])
                skillHistoryByTitle[skill.title] = [];
            skillHistoryByTitle[skill.title].push({
                weekId: week.id,
                weekName: week.name,
                enrichmentLink: week.enrichmentLink || '',
                statuses,
            });
        }
    }
    const existingPlans = await listPlansForClass(schoolId, classId);
    const legacySafe = assignmentId ? await legacyScopeIsUnambiguous(schoolId, classId, teacherUid) : true;
    const scopeIds = assignmentId ? new Set(await assignmentScopeIds(schoolId, classId, teacherUid, assignmentId)) : null;
    const existingPlanKeys = new Set(existingPlans
        .filter((p) => p.status === 'active')
        .filter((p) => !assignmentId || (p.assignmentId && scopeIds.has(p.assignmentId)) || (!p.assignmentId && p.teacherUid === teacherUid && legacySafe))
        .map((p) => `${p.studentId}__${p.skillTitle}`));
    const candidates = [];
    Object.entries(skillHistoryByTitle).forEach(([skillTitle, history]) => {
        // القياس والمعالجة بالاسم الأسبوعي نفسه يمثلان أسبوعًا منطقيًا واحدًا؛ نأخذ آخر رصد منه.
        const logicalHistory = [];
        history.forEach((item) => {
            const last = logicalHistory[logicalHistory.length - 1];
            if (last && normalizeWeekName(last.weekName) === normalizeWeekName(item.weekName))
                logicalHistory[logicalHistory.length - 1] = item;
            else
                logicalHistory.push(item);
        });
        const latest = logicalHistory[logicalHistory.length - 1];
        const previous = logicalHistory.length > 1 ? logicalHistory[logicalHistory.length - 2] : null;
        if (!latest)
            return;
        students.forEach((student) => {
            const key = `${student.id}__${skillTitle}`;
            if (existingPlanKeys.has(key))
                return;
            const currentStatus = latest.statuses[student.id];
            if (!CONCERNING_STATUSES.includes(currentStatus))
                return;
            const previousStatus = previous?.statuses?.[student.id] || null;
            candidates.push({
                studentId: student.id,
                studentName: studentNameById[student.id] || '؟',
                skillTitle,
                lastStatus: currentStatus,
                lastStatusLabel: STATUS_LABELS[currentStatus],
                repeated: CONCERNING_STATUSES.includes(previousStatus),
                weekId: latest.weekId,
                weekName: latest.weekName,
                enrichmentLink: latest.enrichmentLink,
                assignmentId,
            });
        });
    });
    return candidates;
}
export async function createPlan(schoolId, { studentId, studentName, classId, teacherUid, assignmentId, subject, skillTitle, weekId, action = '', enrichmentLink = '', initialStatus = null, actionId = null, }) {
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() + 14);
    const weekRecs = weekId ? await listRecommendationsForWeek(schoolId, weekId) : {};
    const defaultAction = action || weekRecs[studentId] || 'متابعة علاجية وفق المهارة المرصودة.';

    // لا ينشأ أي إجراء أثناء الرصد. الإجراء ينشأ هنا فقط بعد اختيار المعلمة
    // «إنشاء خطة علاجية» من تبويب الخطط العلاجية.
    if (!actionId) {
        // إنشاء الخطة والإجراء المرتبط بها بشكل ذري يمنع بقاء إجراء يتيم إذا
        // انقطع الاتصال بين إنشاء الإجراء وإنشاء الخطة.
        const actionRef = doc(collection(db, 'schools', schoolId, 'actions'));
        const planRef = doc(collection(db, 'schools', schoolId, 'remediationPlans'));
        const batch = writeBatch(db);
        batch.set(actionRef, {
            classId,
            teacherUid,
            assignmentId: assignmentId || null,
            subject: subject || '',
            studentId,
            studentName,
            type: 'remedial',
            creationMode: 'manual',
            creationSource: 'remediationPlans',
            planId: planRef.id,
            affectedSkillTitles: skillTitle ? [skillTitle] : [],
            suggestedText: defaultAction,
            finalText: defaultAction,
            status: 'active',
            triggerWeekIds: weekId ? [weekId] : [],
            lastConfirmedWeekId: weekId || null,
            activatedAt: serverTimestamp(),
            activatedBy: teacherUid,
            reviewDate: Timestamp.fromDate(reviewDate),
            followUpLog: [],
            parentAcknowledgment: { viewedAt: null, viewedByParentId: null },
            enrichmentLink: enrichmentLink || '',
            initialStatus: initialStatus || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        batch.set(planRef, {
            studentId,
            studentName,
            classId,
            teacherUid,
            assignmentId: assignmentId || null,
            subject: subject || '',
            skillTitle,
            weekId: weekId || null,
            actionId: actionRef.id,
            action: defaultAction,
            enrichmentLink: enrichmentLink || '',
            initialStatus: initialStatus || null,
            startDate: serverTimestamp(),
            reviewDate: reviewDate.toISOString(),
            status: 'active',
            createdAt: serverTimestamp(),
        });
        await batch.commit();
        return { id: planRef.id, actionId: actionRef.id };
    }

    // مسار التوافق مع خطة تربط بإجراء موجود صراحةً.
    const ref = await addDoc(collection(db, 'schools', schoolId, 'remediationPlans'), {
        studentId,
        studentName,
        classId,
        teacherUid,
        assignmentId: assignmentId || null,
        subject: subject || '',
        skillTitle,
        weekId: weekId || null,
        actionId,
        action: defaultAction,
        enrichmentLink: enrichmentLink || '',
        initialStatus: initialStatus || null,
        startDate: serverTimestamp(),
        reviewDate: reviewDate.toISOString(),
        status: 'active',
        createdAt: serverTimestamp(),
    });
    return { id: ref.id, actionId };
}

export async function listPlansForClass(schoolId, classId) {
    const q = query(collection(db, 'schools', schoolId, 'remediationPlans'), where('classId', '==', classId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function listPlansForTeacher(schoolId, teacherUid) {
    const q = query(collection(db, 'schools', schoolId, 'remediationPlans'), where('teacherUid', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function listPlansForStudent(schoolId, studentId) {
    const q = query(collection(db, 'schools', schoolId, 'remediationPlans'), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}


async function deleteRefsInChunks(refs, chunkSize = 10) {
    for (let i = 0; i < refs.length; i += chunkSize) {
        const batch = writeBatch(db);
        refs.slice(i, i + chunkSize).forEach((ref) => batch.delete(ref));
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
    }
}

/**
 * تنظف أي خطة علاجية لا يرتبط weekId الخاص بها بأسبوع موجود فعليا.
 * وتشمل الخطط القديمة التي لا تحمل weekId أصلا؛ فغياب weekId يعني أن
 * مصدر الخطة (الأسبوع) لم يعد قابلا للتحقق منه، ولذلك تعتبر يتيمة.
 */
export async function cleanupOrphanPlansForTeacher(schoolId, teacherUid) {
    const [planSnap, weekSnap] = await Promise.all([
        getDocs(query(collection(db, 'schools', schoolId, 'remediationPlans'), where('teacherUid', '==', teacherUid))),
        getDocs(query(collection(db, 'schools', schoolId, 'weeks'), where('teacherUid', '==', teacherUid))),
    ]);

    const liveWeekIds = new Set(weekSnap.docs.filter((d) => d.data().deleted !== true).map((d) => d.id));
    const orphanPlans = planSnap.docs
        .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
        .filter((plan) => plan.status !== 'deleted' && (!plan.weekId || !liveWeekIds.has(plan.weekId)));

    if (orphanPlans.length === 0)
        return { cleanedCount: 0 };

    // نحذف المتابعات أولا لأن قواعد Firestore تتحقق من وجود الخطة عند حذف المتابعة.
    for (const plan of orphanPlans) {
        // eslint-disable-next-line no-await-in-loop
        const followSnap = await getDocs(query(collection(db, 'schools', schoolId, 'remediationFollowUps'), where('planId', '==', plan.id)));
        // eslint-disable-next-line no-await-in-loop
        await deleteRefsInChunks(followSnap.docs.map((d) => d.ref));
    }

    // نعالج الإجراءات المرتبطة دون حذف إجراء ما زال مشتركا مع خطة أخرى.
    const actionIds = [...new Set(orphanPlans.map((p) => p.actionId).filter(Boolean))];
    const orphanIds = new Set(orphanPlans.map((p) => p.id));
    for (const actionId of actionIds) {
        // eslint-disable-next-line no-await-in-loop
        const [actionSnap, linkedPlansSnap] = await Promise.all([
            getDoc(doc(db, 'schools', schoolId, 'actions', actionId)),
            getDocs(query(collection(db, 'schools', schoolId, 'remediationPlans'), where('actionId', '==', actionId))),
        ]);
        if (!actionSnap.exists())
            continue;
        const action = actionSnap.data();
        if (action.teacherUid !== teacherUid)
            continue;
        const survivors = linkedPlansSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => !orphanIds.has(p.id) && p.status !== 'deleted');
        if (survivors.length === 0) {
            // eslint-disable-next-line no-await-in-loop
            await deleteDoc(actionSnap.ref);
        }
        else if (orphanIds.has(action.planId)) {
            const deletedWeekIds = new Set(orphanPlans.filter((p) => p.actionId === actionId).map((p) => p.weekId).filter(Boolean));
            const nextTriggerWeekIds = (action.triggerWeekIds || []).filter((id) => !deletedWeekIds.has(id));
            // eslint-disable-next-line no-await-in-loop
            await updateDoc(actionSnap.ref, {
                planId: survivors[0].id,
                triggerWeekIds: nextTriggerWeekIds,
                updatedAt: serverTimestamp(),
            });
        }
    }

    await deleteRefsInChunks(orphanPlans.map((p) => p.ref));
    return { cleanedCount: orphanPlans.length };
}
async function findLinkedLegacyAction(schoolId, plan) {
    if (!plan.assignmentId) {
        const safe = await legacyScopeIsUnambiguous(schoolId, plan.classId, plan.teacherUid);
        if (!safe)
            return null;
    }
    const q = query(collection(db, 'schools', schoolId, 'actions'), where('studentId', '==', plan.studentId), where('teacherUid', '==', plan.teacherUid));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    const scopeIds = plan.assignmentId
        ? new Set(await assignmentScopeIds(schoolId, plan.classId, plan.teacherUid, plan.assignmentId))
        : null;
    const candidates = rows
        .filter((a) => a.type === 'remedial' && a.status === 'active')
        .filter((a) => scopeIds ? (a.assignmentId && scopeIds.has(a.assignmentId)) : a.classId === plan.classId)
        .filter((a) => {
        const titles = a.affectedSkillTitles || [];
        if (!plan.skillTitle)
            return true;
        return titles.includes(plan.skillTitle) || titles.join('، ') === plan.skillTitle;
    });
    return candidates.length === 1 ? candidates[0] : null;
}
async function listOtherActivePlansForAction(schoolId, action, closingPlanId) {
    const q = query(collection(db, 'schools', schoolId, 'remediationPlans'), where('studentId', '==', action.studentId), where('teacherUid', '==', action.teacherUid));
    const snap = await getDocs(q);
    const scopeIds = action.assignmentId
        ? new Set(await assignmentScopeIds(schoolId, action.classId, action.teacherUid, action.assignmentId))
        : null;
    const actionTitles = new Set((action.affectedSkillTitles || []).map((x) => (x || '').trim()).filter(Boolean));
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.id !== closingPlanId && p.status === 'active')
        .filter((p) => scopeIds ? (p.assignmentId && scopeIds.has(p.assignmentId)) : p.classId === action.classId)
        .filter((p) => {
        if (p.actionId)
            return p.actionId === action.id;
        const planTitles = (p.skillTitle || '').split('،').map((x) => x.trim()).filter(Boolean);
        return planTitles.some((title) => actionTitles.has(title));
    });
}
export async function closePlan(schoolId, planId, outcome, impactEvidence = null) {
    const planRef = doc(db, 'schools', schoolId, 'remediationPlans', planId);
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists())
        throw new Error('لم يتم العثور على الخطة العلاجية.');
    const plan = { id: planSnap.id, ...planSnap.data() };
    let action = null;
    if (plan.actionId) {
        const candidateRef = doc(db, 'schools', schoolId, 'actions', plan.actionId);
        const actionSnap = await getDoc(candidateRef);
        if (actionSnap.exists())
            action = { id: actionSnap.id, ref: candidateRef, ...actionSnap.data() };
    }
    else {
        action = await findLinkedLegacyAction(schoolId, plan);
    }
    const otherActivePlans = action ? await listOtherActivePlansForAction(schoolId, action, planId) : [];
    const batch = writeBatch(db);
    batch.update(planRef, {
        status: outcome === 'success' ? 'closedSuccess' : outcome === 'partial' ? 'closedPartial' : 'closedFailure',
        ...(impactEvidence ? { impactEvidence } : {}),
        closedAt: serverTimestamp(),
    });
    if (action && otherActivePlans.length === 0) {
        batch.update(action.ref, {
            status: outcome === 'success' ? 'closedSuccess' : outcome === 'partial' ? 'closedPartial' : 'closedFailure',
            closedAt: serverTimestamp(),
            closureSource: 'remediationPlan',
        });
    }
    else if (action && action.planId === planId && otherActivePlans.length > 0) {
        // الإجراء متعدد المهارات يبقى نشطًا ما دامت هناك خطة مرتبطة به لم تُغلق بعد.
        batch.update(action.ref, { planId: otherActivePlans[0].id, updatedAt: serverTimestamp() });
    }
    await batch.commit();
}
// Evidence-based remediation: only NEW assessments in a later measurement week
// for the same student, teacher/subject and skill count. No copied weeks or absences.
export async function getPlanImpact(schoolId, plan, teacherUid) {
    const ranks = { notMastered: 0, needsSupport: 1, mastered: 2 };
    const started = plan.startDate?.seconds || plan.createdAt?.seconds || 0;
    const baseline = plan.initialStatus;
    if (!started || !(baseline in ranks)) return null;
    const titles = (plan.skillTitle || '').split('،').map(x => x.trim()).filter(Boolean);
    if (!titles.length) return null;
    const weeks = await listWeeksForClass(schoolId, plan.classId, teacherUid, plan.assignmentId || null);
    const measurements = [];
    for (const title of titles) {
        let found = null;
        for (const week of weeks) {
            if (week.type !== 'measurement' || (week.createdAt?.seconds || 0) <= started) continue;
            // eslint-disable-next-line no-await-in-loop
            const skills = await listSkillsForWeek(schoolId, week.id);
            const skill = skills.find(s => !(s.sourceWeekName || s.sourceWeekType) && (s.title || '').trim() === title);
            if (!skill) continue;
            // eslint-disable-next-line no-await-in-loop
            const assessments = await listAssessmentsForSkill(schoolId, skill.id);
            const record = assessments[plan.studentId];
            if (!(record?.status in ranks) || (record.updatedAt?.seconds || 0) <= started) continue;
            found = { title, after: record.status, weekId: week.id, weekName: week.name, at: record.updatedAt.seconds };
            break;
        }
        if (!found) return null;
        measurements.push(found);
    }
    const worst = measurements.reduce((a,b) => ranks[a.after] < ranks[b.after] ? a : b);
    const diff = ranks[worst.after] - ranks[baseline];
    return {
        baseline, after: worst.after,
        change: diff > 0 ? 'improved' : diff < 0 ? 'declined' : 'unchanged',
        measurements,
        measuredAt: new Date(Math.max(...measurements.map(x => x.at)) * 1000).toISOString(),
    };
}

export async function addFollowUp(schoolId, { planId, studentId, text }) {
    const ref = await addDoc(collection(db, 'schools', schoolId, 'remediationFollowUps'), {
        planId,
        studentId,
        text: (text || '').trim(),
        createdAt: serverTimestamp(),
    });
    return { id: ref.id };
}
export async function listFollowUps(schoolId, planId) {
    const q = query(collection(db, 'schools', schoolId, 'remediationFollowUps'), where('planId', '==', planId));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return rows;
}
export async function suggestFollowUpText(schoolId, plan, classId, teacherUid) {
    const weeks = await listWeeksForClass(schoolId, classId, teacherUid, plan.assignmentId || null);
    const wantedTitles = (plan.skillTitle || '').split('،').map((x) => x.trim()).filter(Boolean);
    for (const week of weeks) {
        // eslint-disable-next-line no-await-in-loop
        const skills = await listSkillsForWeek(schoolId, week.id);
        const matchingSkill = skills.find((s) => wantedTitles.includes((s.title || '').trim()));
        if (!matchingSkill)
            continue;
        // eslint-disable-next-line no-await-in-loop
        const assessments = await listAssessmentsForSkill(schoolId, matchingSkill.id);
        const currentStatus = assessments[plan.studentId]?.status;
        if (!currentStatus)
            continue;
        return interpretFollowUp(plan.initialStatus, currentStatus, STATUS_LABELS);
    }
    return '';
}
export const FOLLOW_UP_PRESETS = [
    'تحسن كبير في الأداء.',
    'تحسن طفيف، بحاجة إلى مزيد من الوقت.',
    'لا تغيير يذكر منذ آخر متابعة.',
    'تعذر تقييم التقدم بسبب الغياب، ويعاد القياس لاحقًا.',
];
