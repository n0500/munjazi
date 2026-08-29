import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';
import { listClassStudents } from './studentsApi';
import { listRecommendationsForWeek } from './weekRecommendationsApi';
import { STATUS_LABELS } from './recommendationsApi';

const CONCERNING_STATUSES = ['needsSupport', 'notMastered'];

// يكتشف الطالبات اللي تكرّرت عندهن حالة "تحتاج دعم" أو "غير متقنة" بنفس المهارة، أسبوعين متتاليين على الأقل
export async function suggestCandidates(schoolId, classId, teacherUid) {
  const weeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse(); // الأقدم أولًا
  if (weeks.length < 2) return [];

  const students = await listClassStudents(schoolId, classId);
  const studentNameById = {};
  students.forEach((s) => { studentNameById[s.id] = s.name; });

  // خريطة: عنوان المهارة → مصفوفة { weekId, weekEnrichmentLink, statuses: {studentId: status} }
  const skillHistoryByTitle = {};
  for (const week of weeks) {
    // eslint-disable-next-line no-await-in-loop
    const skills = await listSkillsForWeek(schoolId, week.id);
    // eslint-disable-next-line no-await-in-loop
    for (const skill of skills) {
      // eslint-disable-next-line no-await-in-loop
      const assessments = await listAssessmentsForSkill(schoolId, skill.id);
      const statuses = {};
      Object.entries(assessments).forEach(([studentId, data]) => { statuses[studentId] = data.status; });
      if (!skillHistoryByTitle[skill.title]) skillHistoryByTitle[skill.title] = [];
      skillHistoryByTitle[skill.title].push({ weekId: week.id, weekName: week.name, enrichmentLink: week.enrichmentLink || '', statuses });
    }
  }

  const existingPlanKeys = new Set(
    (await listPlansForClass(schoolId, classId)).map((p) => `${p.studentId}__${p.skillTitle}`),
  );

  const candidates = [];
  Object.entries(skillHistoryByTitle).forEach(([skillTitle, history]) => {
    if (history.length < 2) return;
    const lastTwo = history.slice(-2);
    students.forEach((student) => {
      const key = `${student.id}__${skillTitle}`;
      if (existingPlanKeys.has(key)) return;
      const statusA = lastTwo[0].statuses[student.id];
      const statusB = lastTwo[1].statuses[student.id];
      if (CONCERNING_STATUSES.includes(statusA) && CONCERNING_STATUSES.includes(statusB)) {
        const latestWeek = lastTwo[1];
        candidates.push({
          studentId: student.id,
          studentName: studentNameById[student.id] || '؟',
          skillTitle,
          lastStatus: statusB,
          lastStatusLabel: STATUS_LABELS[statusB],
          weekId: latestWeek.weekId,
          weekName: latestWeek.weekName,
          enrichmentLink: latestWeek.enrichmentLink,
        });
      }
    });
  });

  return candidates;
}

export async function createPlan(schoolId, { studentId, studentName, classId, teacherUid, skillTitle, weekId, action, enrichmentLink, initialStatus }) {
  const reviewDate = new Date();
  reviewDate.setDate(reviewDate.getDate() + 14);

  const weekRecs = await listRecommendationsForWeek(schoolId, weekId);
  const defaultAction = action || weekRecs[studentId] || '';

  const ref = await addDoc(collection(db, 'schools', schoolId, 'remediationPlans'), {
    studentId,
    studentName,
    classId,
    teacherUid,
    skillTitle,
    action: defaultAction,
    enrichmentLink: enrichmentLink || '',
    initialStatus: initialStatus || null,
    startDate: serverTimestamp(),
    reviewDate: reviewDate.toISOString(),
    status: 'active',
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
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

export async function closePlan(schoolId, planId, outcome) {
  await updateDoc(doc(db, 'schools', schoolId, 'remediationPlans', planId), {
    status: outcome === 'success' ? 'closedSuccess' : 'closedFailure',
    closedAt: serverTimestamp(),
  });
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

// يقارن حالة المهارة الحالية بحالتها عند بداية الخطة، ويولّد جملة متابعة مقترحة جاهزة
export async function suggestFollowUpText(schoolId, plan, classId, teacherUid) {
  const weeks = (await listWeeksForClass(schoolId, classId, teacherUid));
  for (const week of weeks) {
    // eslint-disable-next-line no-await-in-loop
    const skills = await listSkillsForWeek(schoolId, week.id);
    const matchingSkill = skills.find((s) => s.title === plan.skillTitle);
    if (!matchingSkill) continue;
    // eslint-disable-next-line no-await-in-loop
    const assessments = await listAssessmentsForSkill(schoolId, matchingSkill.id);
    const currentStatus = assessments[plan.studentId]?.status;
    if (!currentStatus) continue;

    const rank = { notMastered: 0, needsSupport: 1, mastered: 2, absent: -1 };
    const before = rank[plan.initialStatus] ?? 0;
    const now = rank[currentStatus] ?? 0;

    if (now > before) {
      return `تحسّن ملحوظ: من ${STATUS_LABELS[plan.initialStatus] || '—'} إلى ${STATUS_LABELS[currentStatus]}.`;
    }
    if (now < before) {
      return `تراجع: من ${STATUS_LABELS[plan.initialStatus] || '—'} إلى ${STATUS_LABELS[currentStatus]}.`;
    }
    return `لا تغيير منذ آخر متابعة (الحالة الحالية: ${STATUS_LABELS[currentStatus]}).`;
  }
  return '';
}

export const FOLLOW_UP_PRESETS = [
  'تحسّن كبير في الأداء.',
  'تحسّن طفيف، بحاجة إلى مزيد من الوقت.',
  'لا تغيير يُذكر منذ آخر متابعة.',
  'تراجع طفيف، يُنصح بمراجعة الإجراء المتّبع.',
];
