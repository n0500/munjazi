import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp, writeBatch, } from 'firebase/firestore';
import { db } from './firebase.js';
import { listClassStudents } from './studentsApi.js';
import { listClassAssignments, getAssignment } from './classesApi.js';
import { listSkillsForWeek, ensureSkill, createSkill } from './skillsApi.js';
import { listAssessmentsForSkill, listAssessmentsForWeek, setAssessment, setAssessmentsBulk, clearAssessmentsForSkills, recomputeWeekSummary, } from './assessmentsApi.js';
import { compareWeeksAsc, compareWeeksDesc, normalizeSubject, normalizeWeekName, selectWeeksForAssignment } from './dataLogic.js';
function cleanType(type) {
    return type === 'remediation' ? 'remediation' : 'measurement';
}
function normalizeName(value) {
    return normalizeWeekName(value);
}
async function rawWeeksForClassTeacher(schoolId, classId, teacherUid) {
    const q = query(collection(db, 'schools', schoolId, 'weeks'), where('classId', '==', classId), where('teacherUid', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function listWeeksForClass(schoolId, classId, teacherUid, assignmentId = null, { includeArchived = false } = {}) {
    const rows = await rawWeeksForClassTeacher(schoolId, classId, teacherUid);
    let filtered = includeArchived ? rows.filter((w) => w.deleted !== true) : rows.filter((w) => w.archived !== true && w.deleted !== true);
    if (assignmentId) {
        const allAssignments = await listClassAssignments(schoolId, classId, { includeInactive: true });
        const assignment = allAssignments.find((a) => a.id === assignmentId);
        if (!assignment)
            return [];
        const normalizedSubject = normalizeSubject(assignment.subject);
        const assignmentGroup = {
            ...assignment,
            assignmentIds: allAssignments
                .filter((a) => a.teacherUid === assignment.teacherUid && normalizeSubject(a.subject) === normalizedSubject)
                .map((a) => a.id),
        };
        filtered = selectWeeksForAssignment(filtered, assignmentGroup, allAssignments);
    }
    return filtered.sort(compareWeeksDesc);
}
export async function listWeeksForAssignment(schoolId, assignment, options = {}) {
    return listWeeksForClass(schoolId, assignment.classId, assignment.teacherUid, assignment.id, options);
}
export async function listWeeksForAssignmentGroup(schoolId, assignment, { includeArchived = false, allAssignments = null } = {}) {
    const rawRows = await rawWeeksForClassTeacher(schoolId, assignment.classId, assignment.teacherUid);
    const rows = includeArchived ? rawRows.filter((w) => w.deleted !== true) : rawRows.filter((w) => w.archived !== true && w.deleted !== true);
    const relatedAssignments = allAssignments || await listClassAssignments(schoolId, assignment.classId, { includeInactive: true });
    return selectWeeksForAssignment(rows, assignment, relatedAssignments).sort(compareWeeksDesc);
}
export async function findWeekForAssignment(schoolId, assignment, name, type) {
    const weeks = await listWeeksForAssignment(schoolId, assignment);
    return weeks.find((w) => normalizeName(w.name) === normalizeName(name) && w.type === cleanType(type)) || null;
}
export async function createWeek(schoolId, { classId, teacherUid, assignmentId, subject, name, type, enrichmentLink, copySourceWeekId = null, copyOperationKey = null, sourceMeasurementWeekId = null, previousRemediationWeekId = null, remediationStage = null, }) {
    const trimmedName = normalizeName(name);
    if (!trimmedName)
        throw new Error('اسم الأسبوع الدراسي مطلوب.');
    const cleanedType = cleanType(type);
    let assignment = null;
    if (assignmentId)
        assignment = await getAssignment(schoolId, assignmentId);
    if (assignment) {
        const existing = await findWeekForAssignment(schoolId, assignment, trimmedName, cleanedType);
        if (existing) {
            throw new Error(`يوجد ${trimmedName} (${cleanedType === 'remediation' ? 'معالجة' : 'قياس'}) مسبقًا لهذا الفصل والمادة.`);
        }
        // إذا كان هناك أسبوع قديم بنفس الاسم والنوع ولم يكن محدد المادة، لا ننشئ أسبوعًا موازيًا
        // عندما تكون للمعلمة أكثر من مادة في الفصل نفسه؛ يجب مراجعة السجل القديم وربطه صراحة أولًا.
        const [rawWeeks, relatedAssignments] = await Promise.all([
            rawWeeksForClassTeacher(schoolId, classId, teacherUid),
            listClassAssignments(schoolId, classId, { includeInactive: true }),
        ]);
        const subjectCount = new Set(relatedAssignments
            .filter((a) => a.teacherUid === teacherUid)
            .map((a) => normalizeSubject(a.subject))).size;
        const ambiguousLegacyMatch = subjectCount > 1 && rawWeeks.some((w) => !w.assignmentId && normalizeName(w.name) === trimmedName && cleanType(w.type) === cleanedType);
        if (ambiguousLegacyMatch) {
            throw new Error(`يوجد ${trimmedName} (${cleanedType === 'remediation' ? 'معالجة' : 'قياس'}) كسجل قديم غير محدد المادة. اربطيه بالمادة الصحيحة من «مراجعة الأسابيع القديمة» أولًا.`);
        }
    }
    let validatedMeasurementSourceId = null;
    let validatedPreviousRemediationId = null;
    let resolvedRemediationStage = cleanedType === 'remediation' ? Math.max(1, Number(remediationStage) || 1) : null;
    if (cleanedType === 'remediation' && previousRemediationWeekId) {
        const previousRemediation = await getWeek(schoolId, previousRemediationWeekId);
        const previousSubject = normalizeSubject(previousRemediation.subject || '');
        const targetSubject = normalizeSubject(subject || assignment?.subject || '');
        if (previousRemediation.type !== 'remediation' || previousRemediation.classId !== classId || previousRemediation.teacherUid !== teacherUid || (previousSubject && targetSubject && previousSubject !== targetSubject)) {
            throw new Error('أسبوع المعالجة السابق لا يطابق الفصل والمادة.');
        }
        validatedPreviousRemediationId = previousRemediation.id;
        resolvedRemediationStage = Math.max(2, (Number(previousRemediation.remediationStage) || 1) + 1);
        if (!sourceMeasurementWeekId && previousRemediation.sourceMeasurementWeekId)
            sourceMeasurementWeekId = previousRemediation.sourceMeasurementWeekId;
    }
    if (cleanedType === 'remediation' && sourceMeasurementWeekId) {
        const sourceMeasurement = await getWeek(schoolId, sourceMeasurementWeekId);
        const sourceSubject = normalizeSubject(sourceMeasurement.subject || '');
        const targetSubject = normalizeSubject(subject || assignment?.subject || '');
        if (sourceMeasurement.type !== 'measurement' || sourceMeasurement.classId !== classId || sourceMeasurement.teacherUid !== teacherUid || (sourceSubject && targetSubject && sourceSubject !== targetSubject)) {
            throw new Error('أسبوع القياس المحدد لا يطابق الفصل والمادة.');
        }
        validatedMeasurementSourceId = sourceMeasurement.id;
    }
    const students = await listClassStudents(schoolId, classId);
    const studentSnapshot = students.map((s) => ({ id: s.id, name: s.name }));
    const ref = await addDoc(collection(db, 'schools', schoolId, 'weeks'), {
        classId,
        teacherUid,
        assignmentId: assignmentId || null,
        subject: (subject || assignment?.subject || '').trim(),
        name: trimmedName,
        type: cleanedType,
        enrichmentLink: (enrichmentLink || '').trim(),
        studentSnapshot,
        copySourceWeekId: copySourceWeekId || null,
        copyOperationKey: copyOperationKey || null,
        sourceMeasurementWeekId: validatedMeasurementSourceId,
        previousRemediationWeekId: validatedPreviousRemediationId,
        remediationStage: resolvedRemediationStage,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return { id: ref.id };
}
export async function updateWeek(schoolId, weekId, { name, type, enrichmentLink }) {
    await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
        name: normalizeName(name),
        type: cleanType(type),
        enrichmentLink: (enrichmentLink || '').trim(),
        updatedAt: serverTimestamp(),
    });
}
export async function setRemediationMeasurementSource(schoolId, weekId, sourceMeasurementWeekId = null) {
    const targetWeek = await getWeek(schoolId, weekId);
    if (targetWeek.type !== 'remediation')
        throw new Error('الربط بأسبوع قياس متاح لأسابيع المعالجة فقط.');
    let validatedId = null;
    if (sourceMeasurementWeekId) {
        const sourceWeek = await getWeek(schoolId, sourceMeasurementWeekId);
        const sameSubject = !normalizeSubject(targetWeek.subject || '') || !normalizeSubject(sourceWeek.subject || '') || normalizeSubject(targetWeek.subject || '') === normalizeSubject(sourceWeek.subject || '');
        if (sourceWeek.type !== 'measurement' || sourceWeek.classId !== targetWeek.classId || sourceWeek.teacherUid !== targetWeek.teacherUid || !sameSubject)
            throw new Error('أسبوع القياس المحدد لا يطابق الفصل والمادة.');
        validatedId = sourceWeek.id;
    }
    await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
        sourceMeasurementWeekId: validatedId,
        updatedAt: serverTimestamp(),
    });
    return { sourceMeasurementWeekId: validatedId };
}
export async function setWeekArchived(schoolId, weekId, archived) {
    await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
        archived: !!archived,
        updatedAt: serverTimestamp(),
    });
}
export async function deleteWeek(schoolId, weekId) {
    await deleteDoc(doc(db, 'schools', schoolId, 'weeks', weekId));
}
export async function countActiveActionsForWeek(schoolId, weekId) {
    const q = query(collection(db, 'schools', schoolId, 'actions'), where('triggerWeekIds', 'array-contains', weekId));
    const snap = await getDocs(q);
    return snap.docs.filter((d) => {
        const data = d.data();
        return data.status === 'active' && data.creationMode === 'manual' && !!data.planId;
    }).length;
}
export async function deleteWeekWithData(schoolId, weekId) {
    // حذف الأسبوع من حساب المعلمة: نحاول حذف البيانات التابعة، لكن لا نسمح
    // لصلاحية ثانوية أن تمنع إزالة الأسبوع من الواجهة.
    const root = (...parts) => collection(db, 'schools', schoolId, ...parts);
    const permissionDenied = (err) => err?.code === 'permission-denied' || /insufficient permissions/i.test(err?.message || '');

    async function safeQueryDocs(promise) {
        try {
            const snap = await promise;
            return snap.docs;
        }
        catch (err) {
            if (permissionDenied(err)) return [];
            throw err;
        }
    }

    async function tryDeleteRefs(refs) {
        // دفعات صغيرة لتفادي حد access-calls في قواعد Firestore.
        const chunkSize = 10;
        for (let i = 0; i < refs.length; i += chunkSize) {
            const chunk = refs.slice(i, i + chunkSize);
            try {
                const batch = writeBatch(db);
                chunk.forEach((ref) => batch.delete(ref));
                // eslint-disable-next-line no-await-in-loop
                await batch.commit();
            }
            catch (err) {
                if (!permissionDenied(err)) throw err;
                // إذا فشلت الدفعة بسبب صلاحيات/حدود القواعد، نجرب كل سجل بمفرده.
                // eslint-disable-next-line no-await-in-loop
                await Promise.allSettled(chunk.map((ref) => deleteDoc(ref)));
            }
        }
    }

    const [skillsDocs, assessmentsDocs, recommendationDocs, parentAckDocs, planDocs] = await Promise.all([
        safeQueryDocs(getDocs(query(root('skills'), where('weekId', '==', weekId)))),
        safeQueryDocs(getDocs(query(root('assessments'), where('weekId', '==', weekId)))),
        safeQueryDocs(getDocs(query(root('weekRecommendations'), where('weekId', '==', weekId)))),
        safeQueryDocs(getDocs(query(root('parentReviewAcknowledgments'), where('weekId', '==', weekId)))),
        safeQueryDocs(getDocs(query(root('remediationPlans'), where('weekId', '==', weekId)))),
    ]);

    // المتابعات يجب حذفها قبل الخطة نفسها لأن القواعد تتحقق من ملكية الخطة.
    const followUpDocs = [];
    for (const planDoc of planDocs) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await safeQueryDocs(getDocs(query(root('remediationFollowUps'), where('planId', '==', planDoc.id))));
        followUpDocs.push(...rows);
    }

    // لا نحذف إجراء مشتركا مع خطة أخرى لم تُحذف.
    const planIdsBeingDeleted = new Set(planDocs.map((d) => d.id));
    const actionIds = [...new Set(planDocs.map((d) => d.data().actionId).filter(Boolean))];
    const actionsToDelete = [];
    const actionUpdates = [];
    for (const actionId of actionIds) {
        // eslint-disable-next-line no-await-in-loop
        const actionSnap = await getDoc(doc(db, 'schools', schoolId, 'actions', actionId));
        if (!actionSnap.exists())
            continue;
        // eslint-disable-next-line no-await-in-loop
        const linkedPlanDocs = await safeQueryDocs(getDocs(query(root('remediationPlans'), where('actionId', '==', actionId))));
        const survivors = linkedPlanDocs.filter((d) => !planIdsBeingDeleted.has(d.id) && d.data().status !== 'deleted');
        if (survivors.length === 0) {
            actionsToDelete.push(actionSnap.ref);
        }
        else if (planIdsBeingDeleted.has(actionSnap.data().planId)) {
            actionUpdates.push({
                ref: actionSnap.ref,
                data: {
                    planId: survivors[0].id,
                    triggerWeekIds: (actionSnap.data().triggerWeekIds || []).filter((id) => id !== weekId),
                    updatedAt: serverTimestamp(),
                },
            });
        }
    }

    await tryDeleteRefs(followUpDocs.map((d) => d.ref));
    await tryDeleteRefs(skillsDocs.map((d) => d.ref));
    await tryDeleteRefs(assessmentsDocs.map((d) => d.ref));
    await tryDeleteRefs(recommendationDocs.map((d) => d.ref));
    await tryDeleteRefs(parentAckDocs.map((d) => d.ref));
    for (const update of actionUpdates) {
        // eslint-disable-next-line no-await-in-loop
        await updateDoc(update.ref, update.data);
    }
    await tryDeleteRefs(planDocs.map((d) => d.ref));
    await tryDeleteRefs(actionsToDelete);

    // تنظيف علاقة النسخ فقط إذا كانت الصلاحيات تسمح.
    try {
        const copiedWeekDocs = await safeQueryDocs(getDocs(query(root('weeks'), where('copySourceWeekId', '==', weekId))));
        await Promise.allSettled(copiedWeekDocs.map((d) => updateDoc(d.ref, { copySourceWeekId: null, updatedAt: serverTimestamp() })));
    } catch {}
    try {
        const linkedRemediationDocs = await safeQueryDocs(getDocs(query(root('weeks'), where('sourceMeasurementWeekId', '==', weekId))));
        await Promise.allSettled(linkedRemediationDocs.map((d) => updateDoc(d.ref, { sourceMeasurementWeekId: null, updatedAt: serverTimestamp() })));
    } catch {}
    try {
        const chainedRemediationDocs = await safeQueryDocs(getDocs(query(root('weeks'), where('previousRemediationWeekId', '==', weekId))));
        await Promise.allSettled(chainedRemediationDocs.map((d) => updateDoc(d.ref, { previousRemediationWeekId: null, updatedAt: serverTimestamp() })));
    } catch {}

    // بعد حذف جميع البيانات التابعة، نحذف الأسبوع نفسه.
    try {
        await deleteDoc(doc(db, 'schools', schoolId, 'weeks', weekId));
        return { deleted: true, mode: 'hard' };
    }
    catch (err) {
        if (!permissionDenied(err)) throw err;
        // بعض قواعد الإنتاج القديمة تسمح للمعلمة بالتعديل ولا تسمح delete.
        // في هذه الحالة نضع علامة حذف، ويختفي الأسبوع فورًا من جميع قوائم الرصد.
        await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
            deleted: true,
            archived: false,
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { deleted: true, mode: 'tombstone' };
    }
}

export async function getWeek(schoolId, weekId) {
    const snap = await getDoc(doc(db, 'schools', schoolId, 'weeks', weekId));
    if (!snap.exists())
        throw new Error('لم يتم العثور على الأسبوع الدراسي.');
    return { id: snap.id, ...snap.data() };
}
async function ensureTargetWeekForCopy(schoolId, sourceWeek, targetAssignment, { name, type }) {
    const cleanedType = cleanType(type);
    const weeks = await listWeeksForAssignment(schoolId, targetAssignment);
    const sameNameType = weeks.filter((w) => normalizeName(w.name) === normalizeName(name) && w.type === cleanedType);
    const resumable = sameNameType.find((w) => w.copySourceWeekId === sourceWeek.id);
    if (resumable) {
        const patch = {};
        if (cleanedType === 'remediation' && sourceWeek.type === 'measurement' && !resumable.sourceMeasurementWeekId) {
            patch.sourceMeasurementWeekId = sourceWeek.id;
            patch.remediationStage = 1;
        }
        if (cleanedType === 'remediation' && sourceWeek.type === 'remediation') {
            if (!resumable.previousRemediationWeekId) patch.previousRemediationWeekId = sourceWeek.id;
            if (!resumable.remediationStage) patch.remediationStage = (Number(sourceWeek.remediationStage) || 1) + 1;
            if (!resumable.sourceMeasurementWeekId && sourceWeek.sourceMeasurementWeekId) patch.sourceMeasurementWeekId = sourceWeek.sourceMeasurementWeekId;
        }
        if (Object.keys(patch).length) {
            patch.updatedAt = serverTimestamp();
            await updateDoc(doc(db, 'schools', schoolId, 'weeks', resumable.id), patch);
            Object.assign(resumable, patch);
        }
        return { week: resumable, resumed: true };
    }
    if (sameNameType.length > 0) {
        throw new Error(`يوجد ${name} (${cleanedType === 'remediation' ? 'معالجة' : 'قياس'}) في هذا الفصل، لكنه ليس نسخة من الأسبوع المحدد. لم يتم الدمج حفاظًا على الرصد الموجود.`);
    }
    const operationKey = `${targetAssignment.id}__${sourceWeek.id}__${normalizeName(name)}__${cleanedType}`;
    const sourceMeasurementWeekId = cleanedType === 'remediation'
        ? (sourceWeek.type === 'measurement' ? sourceWeek.id : (sourceWeek.sourceMeasurementWeekId || null))
        : null;
    const previousRemediationWeekId = cleanedType === 'remediation' && sourceWeek.type === 'remediation' ? sourceWeek.id : null;
    const remediationStage = cleanedType === 'remediation'
        ? (sourceWeek.type === 'remediation' ? (Number(sourceWeek.remediationStage) || 1) + 1 : 1)
        : null;
    const { id } = await createWeek(schoolId, {
        classId: targetAssignment.classId,
        teacherUid: targetAssignment.teacherUid,
        assignmentId: targetAssignment.id,
        subject: targetAssignment.subject,
        name,
        type: cleanedType,
        enrichmentLink: sourceWeek.enrichmentLink || '',
        copySourceWeekId: sourceWeek.id,
        copyOperationKey: operationKey,
        sourceMeasurementWeekId,
        previousRemediationWeekId,
        remediationStage,
    });
    return { week: await getWeek(schoolId, id), resumed: false };
}
export async function copyWeekToAssignment(schoolId, sourceWeekId, targetAssignment, { name, type, copyAssessments = true, copyComments = true, selectedSkillTitles = null, onProgress = null }) {
    onProgress?.({ phase: 'preparing' });
    const sourceWeek = await getWeek(schoolId, sourceWeekId);
    if (sourceWeek.classId !== targetAssignment.classId || sourceWeek.teacherUid !== targetAssignment.teacherUid ||
        (sourceWeek.subject && normalizeSubject(sourceWeek.subject) !== normalizeSubject(targetAssignment.subject))) {
        throw new Error('أسبوع النسخ المصدر لا يطابق الفصل والمادة.');
    }
    const { week: targetWeek, resumed } = await ensureTargetWeekForCopy(schoolId, sourceWeek, targetAssignment, { name, type });
    // قراءة الرصد المصدر والموجود مرة واحدة؛ لا طلب تحقق منفصل لكل طالبة.
    const copyingRows = copyAssessments || copyComments;
    let [sourceSkills, targetStudents, sourceBySkill, targetBySkill] = await Promise.all([
        listSkillsForWeek(schoolId, sourceWeek.id),
        listClassStudents(schoolId, targetAssignment.classId),
        copyingRows ? listAssessmentsForWeek(schoolId, sourceWeek.id) : Promise.resolve({}),
        copyingRows ? listAssessmentsForWeek(schoolId, targetWeek.id) : Promise.resolve({}),
    ]);
    if (Array.isArray(selectedSkillTitles)) {
        const wanted = new Set(selectedSkillTitles.map((title) => (title || '').trim().toLowerCase()));
        sourceSkills = sourceSkills.filter((skill) => wanted.has((skill.title || '').trim().toLowerCase()));
    }
    // النسخة الجديدة تخص طالبات الفصل الحالي فقط. إذا انتقلت طالبة بعد الرصد القديم
    // يبقى رصدها محفوظًا في الأسبوع القديم، ولا ينتقل معها أو يعود للنسخة الجديدة.
    const targetStudentIds = new Set(targetStudents.map((student) => student.id));
    let copiedSkills = 0;
    let copiedAssessments = 0;
    let completedSkills = 0;
    const rows = [];
    onProgress?.({ phase: 'skills', completedSkills, totalSkills: sourceSkills.length });
    for (const sourceSkill of sourceSkills) {
        // eslint-disable-next-line no-await-in-loop
        const ensured = await ensureSkill(schoolId, {
            weekId: targetWeek.id,
            classId: targetAssignment.classId,
            teacherUid: targetAssignment.teacherUid,
            assignmentId: targetAssignment.id,
            title: sourceSkill.title,
            sourceWeekName: sourceWeek.name || sourceSkill.sourceWeekName || null,
            sourceWeekType: sourceWeek.type || sourceSkill.sourceWeekType || null,
            sourceWeekId: sourceWeek.id,
            sourceRemediationStage: sourceWeek.type === 'remediation' ? (Number(sourceWeek.remediationStage) || 1) : null,
            originMeasurementWeekId: sourceSkill.originMeasurementWeekId || (sourceWeek.type === 'measurement' ? sourceWeek.id : (sourceWeek.sourceMeasurementWeekId || null)),
            originMeasurementWeekName: sourceSkill.originMeasurementWeekName || (sourceWeek.type === 'measurement' ? sourceWeek.name : null),
            copySourceSkillId: sourceSkill.id,
        });
        if (ensured.created)
            copiedSkills += 1;
        if (copyingRows) {
            const sourceAssessments = sourceBySkill[sourceSkill.id] || {};
            const existingAssessments = targetBySkill[ensured.id] || {};
            for (const [studentId, data] of Object.entries(sourceAssessments)) {
                if (!targetStudentIds.has(studentId))
                    continue;
                // الاستكمال يملأ الرصد الناقص فقط ويحفظ التعديلات الموجودة.
                if (Object.prototype.hasOwnProperty.call(existingAssessments, studentId))
                    continue;
                rows.push({
                    skillId: ensured.id,
                    weekId: targetWeek.id,
                    classId: targetAssignment.classId,
                    teacherUid: targetAssignment.teacherUid,
                    assignmentId: targetAssignment.id,
                    studentId,
                    status: copyAssessments ? data.status : null,
                    recommendationText: copyComments ? (data.recommendationText || '') : undefined,
                });
                existingAssessments[studentId] = data;
                if (copyAssessments && data.status)
                    copiedAssessments += 1;
            }
            targetBySkill[ensured.id] = existingAssessments;
        }
        completedSkills += 1;
        onProgress?.({ phase: 'skills', completedSkills, totalSkills: sourceSkills.length });
    }
    // التوصيات والإجراءات لا تُنسخ كبيانات ثابتة؛ التوصية تُولّد من رصد الأسبوع الجديد،
    // والإجراء يُنشأ يدويًا فقط بعد انتهاء الرصد.
    if (rows.length) {
        await setAssessmentsBulk(schoolId, {
            weekId: targetWeek.id,
            classId: targetAssignment.classId,
            teacherUid: targetAssignment.teacherUid,
            assignmentId: targetAssignment.id,
            rows,
            onProgress: ({ written, total }) => onProgress?.({
                phase: written === total ? 'summary' : 'assessments',
                completedAssessments: written,
                totalAssessments: total,
            }),
        });
    } else {
        onProgress?.({ phase: 'summary', completedAssessments: 0, totalAssessments: 0 });
        await recomputeWeekSummary(schoolId, targetWeek.id);
    }
    onProgress?.({ phase: 'complete', completedAssessments: rows.length, totalAssessments: rows.length });
    return {
        id: targetWeek.id,
        resumed,
        copiedSkills,
        copiedAssessments,
    };
}
// توافق مع الاستدعاء القديم لفصل واحد.
export async function copyWeek(schoolId, sourceWeekId, { classId, teacherUid, assignmentId, name, type, }) {
    let assignment;
    if (assignmentId)
        assignment = await getAssignment(schoolId, assignmentId);
    else {
        const rows = await listClassAssignments(schoolId, classId, { includeInactive: true });
        assignment = rows.find((a) => a.teacherUid === teacherUid && a.active !== false);
    }
    if (!assignment)
        throw new Error('تعذّر تحديد إسناد المادة للنسخ.');
    return copyWeekToAssignment(schoolId, sourceWeekId, assignment, { name, type });
}
export async function copyWeekToMultipleAssignments(schoolId, { sourceAssignmentId, sourceWeekId, targetAssignmentIds, targetName, targetType, copyAssessments = true, copyComments = true, selectedSkillTitles = null, onProgress = null, onResult = null, }) {
    const [sourceWeek, sourceAssignment] = await Promise.all([
        getWeek(schoolId, sourceWeekId),
        getAssignment(schoolId, sourceAssignmentId),
    ]);
    if (sourceWeek.classId !== sourceAssignment.classId || sourceWeek.teacherUid !== sourceAssignment.teacherUid ||
        (sourceWeek.subject && normalizeSubject(sourceWeek.subject) !== normalizeSubject(sourceAssignment.subject))) {
        throw new Error('الأسبوع المصدر لا يطابق إسناد المادة.');
    }
    const results = [];
    const targets = [...new Set(targetAssignmentIds)];
    for (const [index, assignmentId] of targets.entries()) {
        const reportProgress = (progress) => onProgress?.({
            assignmentId,
            assignmentIndex: index + 1,
            totalAssignments: targets.length,
            completedAssignments: results.length,
            ...progress,
        });
        reportProgress({ phase: 'preparing' });
        try {
            // eslint-disable-next-line no-await-in-loop
            const targetAssignment = assignmentId === sourceAssignment.id ? sourceAssignment : await getAssignment(schoolId, assignmentId);
            if (targetAssignment.teacherUid !== sourceAssignment.teacherUid) {
                throw new Error('الإسناد المستهدف لا يخص المعلّمة نفسها.');
            }
            if (normalizeSubject(targetAssignment.subject) !== normalizeSubject(sourceAssignment.subject)) {
                throw new Error('نسخ الأسبوع متاح للفصول المسندة للمادة نفسها فقط.');
            }
            // كل فصل ينسخ من أسبوعه الخاص المطابق لاسم/نوع الأسبوع المصدر.
            let ownSource = sourceWeek;
            if (targetAssignment.id !== sourceAssignment.id) {
                // eslint-disable-next-line no-await-in-loop
                ownSource = await findWeekForAssignment(schoolId, targetAssignment, sourceWeek.name, sourceWeek.type);
                if (!ownSource) {
                    throw new Error(`لا يوجد ${sourceWeek.name} (${sourceWeek.type === 'remediation' ? 'معالجة' : 'قياس'}) في هذا الفصل لنسخه.`);
                }
            }
            // eslint-disable-next-line no-await-in-loop
            const copied = await copyWeekToAssignment(schoolId, ownSource.id, targetAssignment, {
                name: targetName,
                type: targetType,
                copyAssessments,
                copyComments,
                selectedSkillTitles,
                onProgress: reportProgress,
            });
            results.push({ assignmentId, ok: true, ...copied });
        }
        catch (err) {
            results.push({ assignmentId, ok: false, error: err.message || String(err) });
        }
        onResult?.(results[results.length - 1]);
    }
    return results;
}
export async function addSkillsToAssignments(schoolId, { sourceAssignmentId, sourceWeekId, targetAssignmentIds, skillTitles, }) {
    const sourceWeek = await getWeek(schoolId, sourceWeekId);
    const sourceAssignment = await getAssignment(schoolId, sourceAssignmentId);
    const cleanedTitles = [...new Set((skillTitles || []).map((x) => (x || '').trim()).filter(Boolean))];
    const results = [];
    for (const assignmentId of targetAssignmentIds) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const assignment = await getAssignment(schoolId, assignmentId);
            if (assignment.teacherUid !== sourceAssignment.teacherUid)
                throw new Error('الإسناد لا يخص المعلّمة نفسها.');
            if (normalizeSubject(assignment.subject) !== normalizeSubject(sourceAssignment.subject)) {
                throw new Error('إضافة المهارات المتعددة متاحة للفصول المسندة للمادة نفسها فقط.');
            }
            // نفس الأسبوع والنوع في كل فصل؛ الفصل الحالي يستخدم الأسبوع المفتوح نفسه حتى لو كان من إسناد قديم مكرر.
            // eslint-disable-next-line no-await-in-loop
            let targetWeek = assignment.id === sourceAssignmentId && assignment.classId === sourceWeek.classId
                ? sourceWeek
                : await findWeekForAssignment(schoolId, assignment, sourceWeek.name, sourceWeek.type);
            if (!targetWeek) {
                // eslint-disable-next-line no-await-in-loop
                const created = await createWeek(schoolId, {
                    classId: assignment.classId,
                    teacherUid: assignment.teacherUid,
                    assignmentId: assignment.id,
                    subject: assignment.subject,
                    name: sourceWeek.name,
                    type: sourceWeek.type,
                    enrichmentLink: sourceWeek.enrichmentLink || '',
                });
                // eslint-disable-next-line no-await-in-loop
                targetWeek = await getWeek(schoolId, created.id);
            }
            let added = 0;
            let skipped = 0;
            const createdSkillIds = [];
            for (const title of cleanedTitles) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const createdSkill = await createSkill(schoolId, {
                        weekId: targetWeek.id,
                        classId: assignment.classId,
                        teacherUid: assignment.teacherUid,
                        assignmentId: assignment.id,
                        title,
                    });
                    createdSkillIds.push(createdSkill.id);
                    added += 1;
                }
                catch (err) {
                    if (err.code === 'duplicate-skill')
                        skipped += 1;
                    else
                        throw err;
                }
            }
            // المهارات التي تُضاف الآن تبدأ دائمًا «غير مرصودة»، ولا تتحول
            // إلى متقنة إلا عند ضغط المعلمة زر «متقن للجميع» أو تغيير الحالة يدويًا.
            if (createdSkillIds.length) {
                // eslint-disable-next-line no-await-in-loop
                await clearAssessmentsForSkills(schoolId, createdSkillIds);
                // eslint-disable-next-line no-await-in-loop
                await recomputeWeekSummary(schoolId, targetWeek.id);
            }
            results.push({ assignmentId, ok: true, weekId: targetWeek.id, added, skipped, createdSkillIds });
        }
        catch (err) {
            results.push({ assignmentId, ok: false, error: err.message || String(err) });
        }
    }
    return results;
}
export async function copySelectedSkillsToNewWeek(schoolId, { classId, teacherUid, assignmentId, name, type, selectedSkillIds, }) {
    const assignment = assignmentId ? await getAssignment(schoolId, assignmentId) : null;
    const { id: newWeekId } = await createWeek(schoolId, {
        classId,
        teacherUid,
        assignmentId,
        subject: assignment?.subject || '',
        name,
        type,
        enrichmentLink: '',
    });
    const currentStudents = await listClassStudents(schoolId, classId);
    const currentStudentIds = new Set(currentStudents.map((student) => student.id));
    const skillSnaps = await Promise.all(selectedSkillIds.map((skillId) => getDoc(doc(db, 'schools', schoolId, 'skills', skillId))));
    const validSkills = skillSnaps.filter((snap) => snap.exists()).map((snap) => ({ id: snap.id, ...snap.data() }));
    const uniqueWeekIds = [...new Set(validSkills.map((s) => s.weekId))];
    const weekSnaps = await Promise.all(uniqueWeekIds.map((weekId) => getDoc(doc(db, 'schools', schoolId, 'weeks', weekId))));
    const weekById = {};
    weekSnaps.forEach((snap) => { if (snap.exists())
        weekById[snap.id] = snap.data(); });
    for (const sourceSkill of validSkills) {
        const sourceWeek = weekById[sourceSkill.weekId] || null;
        // eslint-disable-next-line no-await-in-loop
        const { id: newSkillId } = await createSkill(schoolId, {
            weekId: newWeekId,
            classId,
            teacherUid,
            assignmentId,
            title: sourceSkill.title,
            sourceWeekName: sourceWeek ? sourceWeek.name : '',
            sourceWeekType: sourceWeek ? sourceWeek.type : '',
            copySourceSkillId: sourceSkill.id,
        });
        // eslint-disable-next-line no-await-in-loop
        const sourceAssessments = await listAssessmentsForSkill(schoolId, sourceSkill.id);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(Object.entries(sourceAssessments)
            .filter(([studentId]) => currentStudentIds.has(studentId))
            .map(([studentId, data]) => setAssessment(schoolId, {
            skillId: newSkillId,
            weekId: newWeekId,
            classId,
            teacherUid,
            assignmentId,
            studentId,
            status: data.status,
            recommendationText: data.recommendationText || '',
            skipSummary: true,
        })));
    }
    await recomputeWeekSummary(schoolId, newWeekId);
    return { id: newWeekId };
}
export async function listAmbiguousLegacyWeeks(schoolId, teacherUid) {
    const assignments = await listClassAssignmentsForTeacherAcrossSchool(schoolId, teacherUid);
    const byClass = new Map();
    assignments.forEach((a) => {
        if (!byClass.has(a.classId))
            byClass.set(a.classId, []);
        byClass.get(a.classId).push(a);
    });
    const result = [];
    for (const [classId, classAssignments] of byClass.entries()) {
        const bySubject = new Map();
        classAssignments.forEach((a) => {
            const key = normalizeSubject(a.subject);
            const current = bySubject.get(key);
            // نعرض خيارًا واحدًا لكل مادة؛ نفضّل الإسناد النشط إذا كان هناك تكرار قديم لنفس المادة.
            if (!current || (current.active === false && a.active !== false))
                bySubject.set(key, a);
        });
        const possibleAssignments = [...bySubject.values()];
        if (possibleAssignments.length <= 1)
            continue;
        // eslint-disable-next-line no-await-in-loop
        const raw = await rawWeeksForClassTeacher(schoolId, classId, teacherUid);
        raw.filter((w) => !w.assignmentId).forEach((w) => result.push({ ...w, possibleAssignments }));
    }
    return result.sort(compareWeeksAsc);
}
async function listClassAssignmentsForTeacherAcrossSchool(schoolId, teacherUid) {
    const q = query(collection(db, 'schools', schoolId, 'classTeacherAssignments'), where('teacherUid', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function commitUpdateRefsInChunks(refs, data, chunkSize = 10) {
    for (let i = 0; i < refs.length; i += chunkSize) {
        const batch = writeBatch(db);
        refs.slice(i, i + chunkSize).forEach((ref) => batch.update(ref, data));
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
    }
}
export async function linkLegacyWeekToAssignment(schoolId, weekId, assignmentId) {
    const [week, assignment] = await Promise.all([
        getWeek(schoolId, weekId),
        getAssignment(schoolId, assignmentId),
    ]);
    if (week.teacherUid !== assignment.teacherUid || week.classId !== assignment.classId) {
        throw new Error('الإسناد المحدد لا يطابق معلمة وفصل الأسبوع القديم.');
    }
    if (week.assignmentId && week.assignmentId !== assignmentId) {
        throw new Error('هذا الأسبوع مرتبط مسبقًا بإسناد آخر.');
    }
    const [skills, assessments, recs, actions, plans] = await Promise.all([
        getDocs(query(collection(db, 'schools', schoolId, 'skills'), where('weekId', '==', weekId))),
        getDocs(query(collection(db, 'schools', schoolId, 'assessments'), where('weekId', '==', weekId))),
        getDocs(query(collection(db, 'schools', schoolId, 'weekRecommendations'), where('weekId', '==', weekId))),
        getDocs(query(collection(db, 'schools', schoolId, 'actions'), where('triggerWeekIds', 'array-contains', weekId))),
        getDocs(query(collection(db, 'schools', schoolId, 'remediationPlans'), where('weekId', '==', weekId))),
    ]);
    const updateData = {
        assignmentId,
        subject: assignment.subject || '',
        updatedAt: serverTimestamp(),
    };
    const childRefs = [
        ...skills.docs.map((d) => d.ref),
        ...assessments.docs.map((d) => d.ref),
        ...recs.docs.map((d) => d.ref),
        ...actions.docs.filter((d) => !d.data().assignmentId || d.data().assignmentId === assignmentId).map((d) => d.ref),
        ...plans.docs.filter((d) => !d.data().assignmentId || d.data().assignmentId === assignmentId).map((d) => d.ref),
    ];
    // نحدّث السجلات التابعة أولًا، ثم الأسبوع نفسه أخيرًا كعلامة اكتمال.
    // إذا انقطعت العملية بين الدفعات يبقى الأسبوع ضمن «مراجعة الأسابيع القديمة»،
    // ويمكن إعادة المحاولة بأمان لإكمال ما تبقى بدل اختفاء الأسبوع بعد ترحيل جزئي.
    await commitUpdateRefsInChunks(childRefs, updateData);
    await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), updateData);
}
