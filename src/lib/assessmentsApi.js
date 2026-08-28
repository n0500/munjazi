import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// معرّف المستند = skillId_studentId عشان يكون فريد وسهل التحديث المباشر
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
