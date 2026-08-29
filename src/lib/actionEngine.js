import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';
import { listWeeksForClass } from './weeksApi';

// حالة "غير متقنة" تُفعّل إجراء علاجي، و"متقنة" تُفعّل إجراء إثرائي
const REMEDIAL_STATUSES = ['notMastered'];
const ENRICHMENT_STATUSES = ['mastered'];

// ---------------------------------------------------------------------------
// 1) إيجاد الأسبوع السابق مباشرة لنفس الفصل والمعلمة
// ---------------------------------------------------------------------------
export async function getPreviousWeek(schoolId, classId, teacherUid, currentWeekId) {
  const weeks = await listWeeksForClass(schoolId, classId, teacherUid);
  // listWeeksForClass يرجعها الأحدث أولاً؛ نرتبها تصاعدياً لنجد اللي قبل الحالي مباشرة
  const ascending = [...weeks].sort(
    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
  );
  const idx = ascending.findIndex((w) => w.id === currentWeekId);
  if (idx <= 0) return null;
  return ascending[idx - 1];
}

// ---------------------------------------------------------------------------
// 2) اكتشاف تكرار حالة نفس المهارة (بالاسم) بين أسبوعين، لطالبة واحدة
// ---------------------------------------------------------------------------
export function detectRepeatedSkillsForStudent({
  studentId,
  currentSkills,
  currentAssessmentsBySkill,
  previousSkills,
  previousAssessmentsBySkill,
}) {
  const previousByTitle = {};
  previousSkills.forEach((s) => {
    previousByTitle[s.title.trim()] = s;
  });

  const candidates = [];
  for (const skill of currentSkills) {
    const prevSkill = previousByTitle[skill.title.trim()];
    if (!prevSkill) continue;

    const currentStatus = currentAssessmentsBySkill[skill.id]?.[studentId]?.status;
    const previousStatus = previousAssessmentsBySkill[prevSkill.id]?.[studentId]?.status;
    if (!currentStatus || currentStatus !== previousStatus) continue;

    let type = null;
    if (REMEDIAL_STATUSES.includes(currentStatus)) type = 'remedial';
    else if (ENRICHMENT_STATUSES.includes(currentStatus)) type = 'enrichment';
    if (!type) continue;

    candidates.push({ skillTitle: skill.title, status: currentStatus, type });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// 3) اختيار نص القالب المقترح من مكتبة actionTemplates
// ---------------------------------------------------------------------------
export async function pickTemplateText(schoolId, { type, skillTitle, teacherUid }) {
  const snap = await getDocs(collection(db, 'schools', schoolId, 'actionTemplates'));
  const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const matches = (t, requireSkill, requireOwn) => {
    if (t.type !== type) return false;
    if (requireSkill && t.skillTitle !== skillTitle) return false;
    if (!requireSkill && t.skillTitle) return false;
    if (requireOwn && t.createdBy !== teacherUid) return false;
    if (!requireOwn && t.createdBy) return false;
    return true;
  };

  const priority = [
    { requireSkill: true, requireOwn: true },
    { requireSkill: false, requireOwn: true },
    { requireSkill: true, requireOwn: false },
    { requireSkill: false, requireOwn: false },
  ];

  for (const rule of priority) {
    const found = templates.find((t) => matches(t, rule.requireSkill, rule.requireOwn));
    if (found) return found.text;
  }

  return type === 'remedial' ? 'إحالة لجلسة معالجة فردية' : 'ترشيح لنشاط إثرائي إضافي';
}

// ---------------------------------------------------------------------------
// 4) الفحص الكامل لأسبوع: يقارن بالأسبوع السابق لكل الطالبات ويقترح إجراءات
// ---------------------------------------------------------------------------
export async function checkAndSuggestActionsForWeek(schoolId, { classId, teacherUid, week, students }) {
  const previousWeek = await getPreviousWeek(schoolId, classId, teacherUid, week.id);
  if (!previousWeek) return [];

  const [currentSkills, previousSkills] = await Promise.all([
    listSkillsForWeek(schoolId, week.id),
    listSkillsForWeek(schoolId, previousWeek.id),
  ]);

  const currentAssessmentsBySkill = {};
  await Promise.all(
    currentSkills.map(async (s) => {
      currentAssessmentsBySkill[s.id] = await listAssessmentsForSkill(schoolId, s.id);
    }),
  );
  const previousAssessmentsBySkill = {};
  await Promise.all(
    previousSkills.map(async (s) => {
      previousAssessmentsBySkill[s.id] = await listAssessmentsForSkill(schoolId, s.id);
    }),
  );

  const results = [];
  for (const student of students) {
    const candidates = detectRepeatedSkillsForStudent({
      studentId: student.id,
      currentSkills,
      currentAssessmentsBySkill,
      previousSkills,
      previousAssessmentsBySkill,
    });
    if (candidates.length === 0) continue;

    const byType = { remedial: [], enrichment: [] };
    candidates.forEach((c) => byType[c.type].push(c));

    for (const type of ['remedial', 'enrichment']) {
      const skillsOfType = byType[type];
      if (skillsOfType.length === 0) continue;

      const skillTitle = skillsOfType.length === 1 ? skillsOfType[0].skillTitle : null;
      const suggestedText = await pickTemplateText(schoolId, { type, skillTitle, teacherUid });

      const created = await upsertAction(schoolId, {
        classId,
        teacherUid,
        studentId: student.id,
        studentName: student.name,
        type,
        affectedSkillTitles: skillsOfType.map((s) => s.skillTitle),
        suggestedText,
        weekId: week.id,
      });
      results.push(created);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5) عمليات Firestore: إنشاء/تحديث/تفعيل/تأجيل
// ---------------------------------------------------------------------------
async function upsertAction(schoolId, { classId, teacherUid, studentId, studentName, type, affectedSkillTitles, suggestedText, weekId }) {
  const actionsRef = collection(db, 'schools', schoolId, 'actions');
  const existingQ = query(
    actionsRef,
    where('studentId', '==', studentId),
    where('type', '==', type),
    where('status', 'in', ['suggested', 'active']),
  );
  const existingSnap = await getDocs(existingQ);

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    await updateDoc(existingDoc.ref, {
      affectedSkillTitles,
      followUpLog: [
        ...(existingDoc.data().followUpLog || []),
        { weekId, note: 'استمرار التكرار', date: Timestamp.now() },
      ],
    });
    return { id: existingDoc.id, updated: true };
  }

  const docRef = await addDoc(actionsRef, {
    classId,
    teacherUid,
    studentId,
    studentName,
    type,
    affectedSkillTitles,
    suggestedText,
    finalText: suggestedText,
    status: 'suggested',
    deferCount: 0,
    triggerWeekIds: [weekId],
    activatedAt: null,
    activatedBy: null,
    reviewDate: null,
    followUpLog: [],
    parentAcknowledgment: { viewedAt: null, viewedByParentId: null },
    createdAt: serverTimestamp(),
  });
  return { id: docRef.id, updated: false };
}

export async function activateAction(schoolId, { actionId, teacherUid, finalText, reviewDate }) {
  const ref = doc(db, 'schools', schoolId, 'actions', actionId);
  await updateDoc(ref, {
    status: 'active',
    finalText,
    activatedAt: serverTimestamp(),
    activatedBy: teacherUid,
    reviewDate: reviewDate ? Timestamp.fromDate(new Date(reviewDate)) : null,
  });
}

export async function deferAction(schoolId, { actionId }) {
  const ref = doc(db, 'schools', schoolId, 'actions', actionId);
  const snap = await getDoc(ref);
  const currentDeferCount = snap.data()?.deferCount || 0;
  await updateDoc(ref, { deferCount: currentDeferCount + 1 });
}

export async function listActionsForClass(schoolId, classId) {
  const q = query(collection(db, 'schools', schoolId, 'actions'), where('classId', '==', classId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listActionsForStudent(schoolId, studentId) {
  const q = query(collection(db, 'schools', schoolId, 'actions'), where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPendingActions(schoolId, classId) {
  const q = query(
    collection(db, 'schools', schoolId, 'actions'),
    where('classId', '==', classId),
    where('status', '==', 'suggested'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function logParentAcknowledgment(schoolId, { actionId, parentUid }) {
  const ref = doc(db, 'schools', schoolId, 'actions', actionId);
  const snap = await getDoc(ref);
  if (snap.data()?.parentAcknowledgment?.viewedAt) return;
  await updateDoc(ref, {
    parentAcknowledgment: { viewedAt: serverTimestamp(), viewedByParentId: parentUid },
  });
}
