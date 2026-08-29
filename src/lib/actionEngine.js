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
import { createPlan } from './remediationApi';

const REMEDIAL_STATUSES = ['notMastered'];
const ENRICHMENT_STATUSES = ['mastered'];

export async function getPreviousWeek(schoolId, classId, teacherUid, currentWeekId) {
  const weeks = await listWeeksForClass(schoolId, classId, teacherUid);
  const ascending = [...weeks].sort(
    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
  );
  const idx = ascending.findIndex((w) => w.id === currentWeekId);
  if (idx <= 0) return null;
  return ascending[idx - 1];
}

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

    candidates.push({ skillId: skill.id, skillTitle: skill.title, status: currentStatus, type });
  }
  return candidates;
}

export async function pickTemplateText(schoolId, { type, teacherUid }) {
  const snap = await getDocs(collection(db, 'schools', schoolId, 'actionTemplates'));
  const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const personal = templates.find((t) => t.type === type && t.createdBy === teacherUid);
  if (personal) return personal.text;

  const schoolDefault = templates.find((t) => t.type === type && !t.createdBy);
  if (schoolDefault) return schoolDefault.text;

  return type === 'remedial' ? 'إحالة لجلسة معالجة فردية' : 'ترشيح لنشاط إثرائي إضافي';
}

export async function listActionTemplatesForType(schoolId, type) {
  const snap = await getDocs(collection(db, 'schools', schoolId, 'actionTemplates'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.type === type);
}

export async function addActionTemplate(schoolId, { type, text, teacherUid }) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('نص الإجراء مطلوب.');
  await addDoc(collection(db, 'schools', schoolId, 'actionTemplates'), {
    type,
    text: trimmed,
    createdBy: teacherUid,
    createdAt: serverTimestamp(),
  });
}

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

      const suggestedText = await pickTemplateText(schoolId, { type, teacherUid });

      const created = await upsertAction(schoolId, {
        classId,
        teacherUid,
        studentId: student.id,
        studentName: student.name,
        type,
        affectedSkillTitles: skillsOfType.map((s) => s.skillTitle),
        suggestedText,
        weekId: week.id,
        weekEnrichmentLink: week.enrichmentLink || '',
        firstSkillStatus: skillsOfType[0].status,
      });
      results.push(created);
    }
  }
  return results;
}

async function upsertAction(schoolId, { classId, teacherUid, studentId, studentName, type, affectedSkillTitles, suggestedText, weekId, weekEnrichmentLink, firstSkillStatus }) {
  const actionsRef = collection(db, 'schools', schoolId, 'actions');
  const existingQ = query(
    actionsRef,
    where('studentId', '==', studentId),
    where('type', '==', type),
    where('status', '==', 'active'),
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

  const reviewDate = new Date();
  reviewDate.setDate(reviewDate.getDate() + 14);

  const docRef = await addDoc(actionsRef, {
    classId,
    teacherUid,
    studentId,
    studentName,
    type,
    affectedSkillTitles,
    suggestedText,
    finalText: suggestedText,
    status: 'active',
    triggerWeekIds: [weekId],
    activatedAt: serverTimestamp(),
    activatedBy: teacherUid,
    reviewDate: Timestamp.fromDate(reviewDate),
    followUpLog: [],
    parentAcknowledgment: { viewedAt: null, viewedByParentId: null },
    createdAt: serverTimestamp(),
  });

  // كل إجراء علاجي جديد يُنشئ تلقائيًا خطة علاجية رسمية بنفس النظام القديم
  // (تظهر مباشرة بصفحة "الخطط العلاجية" ومستندها المطبوع الجاهز)
  if (type === 'remedial') {
    try {
      await createPlan(schoolId, {
        studentId,
        studentName,
        classId,
        teacherUid,
        skillTitle: affectedSkillTitles.join('، '),
        weekId,
        enrichmentLink: weekEnrichmentLink,
        initialStatus: firstSkillStatus,
      });
    } catch (err) {
      // لا نوقف تفعيل الإجراء لو فشل إنشاء الخطة الرسمية؛ الإجراء نفسه يبقى صالحًا
      console.error('تعذّر إنشاء الخطة العلاجية المرتبطة:', err);
    }
  }

  return { id: docRef.id, updated: false };
}

export async function updateActionText(schoolId, { actionId, finalText }) {
  const ref = doc(db, 'schools', schoolId, 'actions', actionId);
  await updateDoc(ref, { finalText });
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

export async function logParentAcknowledgment(schoolId, { actionId, parentUid }) {
  const ref = doc(db, 'schools', schoolId, 'actions', actionId);
  const snap = await getDoc(ref);
  if (snap.data()?.parentAcknowledgment?.viewedAt) return;
  await updateDoc(ref, {
    parentAcknowledgment: { viewedAt: serverTimestamp(), viewedByParentId: parentUid },
  });
}
