import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

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

// قراءة آمنة لتقييم طالبة واحدة بمهارة واحدة — تُستخدم لولي الأمر عشان ما يحتاج
// صلاحية على تقييمات كل طالبات الفصل (تجيب الوثيقة مباشرة بمعرّفها الثابت)
export async function getStudentAssessment(schoolId, skillId, studentId) {
  const id = assessmentDocId(skillId, studentId);
  const snap = await getDoc(doc(db, 'schools', schoolId, 'assessments', id));
  return snap.exists() ? snap.data() : null;
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
}

export async function setAllMasteredForSkill(schoolId, { skillId, weekId, classId, teacherUid, studentIds }) {
  await Promise.all(
    studentIds.map((studentId) =>
      setAssessment(schoolId, {
        skillId,
        weekId,
        classId,
        teacherUid,
        studentId,
        status: 'mastered',
        recommendationText: '',
      }),
    ),
  );
}
