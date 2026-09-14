import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listSkillsForWeek } from './skillsApi';

function assessmentDocId(skillId, studentId) {
  return `${skillId}_${studentId}`;
}

export async function listAssessmentsForSkill(schoolId, skillId) {
  const q = query(
    collection(db, 'schools', schoolId, 'assessments'),
    where('skillId', '==', skillId),
  );
  const snap = await getDocs(q);
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    map[data.studentId] = data;
  });
  return map;
}

// Filter by the student and skill so a missing assessment is an empty result.
// Direct reads (including documentId equality queries) can still evaluate a
// missing resource.data in field-based parent rules. Keep the canonical ID
// check after the authorized query to preserve the existing record identity.
export async function getStudentAssessment(schoolId, skillId, studentId) {
  const id = assessmentDocId(skillId, studentId);
  const q = query(
    collection(db, 'schools', schoolId, 'assessments'),
    where('skillId', '==', skillId),
    where('studentId', '==', studentId),
  );
  const snap = await getDocs(q);
  const assessment = snap.docs.find((d) => d.id === id);
  return assessment ? assessment.data() : null;
}

// يعيد حساب ملخّص أسبوع كامل (عدد كل حالة) ويخزّنه جاهزًا على وثيقة الأسبوع نفسها،
// عشان صفحات المتابعة (زي متابعة الرصد بلوحة الإدارة) تقرأ رقمًا جاهزًا بدل ما تحسبه من جديد كل مرة.
// مصدَّرة عشان تُستدعى أيضًا من عمليات أخرى تغيّر التقييمات (زي حذف مهارة كاملة).
export async function recomputeWeekSummary(schoolId, weekId) {
  try {
    const skills = await listSkillsForWeek(schoolId, weekId);
    const counts = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
    await Promise.all(
      skills.map(async (skill) => {
        const assessments = await listAssessmentsForSkill(schoolId, skill.id);
        Object.values(assessments).forEach((a) => {
          if (a.status && counts[a.status] !== undefined) counts[a.status] += 1;
        });
      }),
    );
    await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
      summaryCounts: counts,
      summaryUpdatedAt: serverTimestamp(),
    });
  } catch (err) {
    // فشل حساب الملخّص المخزَّن لا يجب أن يوقف العملية الأساسية (حفظ تقييم أو حذف مهارة)
    console.error('تعذّر تحديث ملخّص الأسبوع:', err);
  }
}

export async function setAssessment(schoolId, { skillId, weekId, classId, teacherUid, studentId, status, recommendationText }) {
  const id = assessmentDocId(skillId, studentId);
  await setDoc(doc(db, 'schools', schoolId, 'assessments', id), {
    skillId,
    weekId,
    classId,
    teacherUid,
    studentId,
    status: status || null,
    recommendationText: recommendationText || '',
    updatedAt: serverTimestamp(),
  });
  await recomputeWeekSummary(schoolId, weekId);
}

export async function setAllMasteredForSkill(schoolId, { skillId, weekId, classId, teacherUid, studentIds }) {
  await Promise.all(
    studentIds.map((studentId) =>
      setDoc(doc(db, 'schools', schoolId, 'assessments', assessmentDocId(skillId, studentId)), {
        skillId,
        weekId,
        classId,
        teacherUid,
        studentId,
        status: 'mastered',
        recommendationText: '',
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  // إعادة حساب واحدة بس لكل الأسبوع بعد التعيين الجماعي، بدل تكرارها لكل طالبة
  await recomputeWeekSummary(schoolId, weekId);
}
