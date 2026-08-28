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
import { pickRandomEncouragement } from './recommendationsApi';

function recDocId(weekId, studentId) {
  return `${weekId}_${studentId}`;
}

export async function listRecommendationsForWeek(schoolId, weekId) {
  const q = query(
    collection(db, 'schools', schoolId, 'weekRecommendations'),
    where('weekId', '==', weekId),
  );
  const snap = await getDocs(q);
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    map[data.studentId] = data.text;
  });
  return map;
}

export async function setWeekRecommendation(schoolId, { weekId, classId, teacherUid, studentId, text }) {
  const id = recDocId(weekId, studentId);
  await setDoc(doc(db, 'schools', schoolId, 'weekRecommendations', id), {
    weekId,
    classId,
    teacherUid,
    studentId,
    text: text || '',
    updatedAt: serverTimestamp(),
  });
}

// يعبّي رسالة تشجيع عشوائية بس للطالبات اللي حالتهن "متقنة" بكل مهارات الأسبوع
export async function autoFillEncouragementForMastered(schoolId, { weekId, classId, teacherUid, fullyMasteredStudentIds }) {
  await Promise.all(
    fullyMasteredStudentIds.map((studentId) =>
      setWeekRecommendation(schoolId, {
        weekId,
        classId,
        teacherUid,
        studentId,
        text: pickRandomEncouragement(),
      }),
    ),
  );
}

// يحدد أسوأ حالة بين مهارات الطالبة (لاختيار مكتبة التوصيات المناسبة)
export function worstStatus(statuses) {
  const priority = ['absent', 'notMastered', 'needsSupport', 'mastered'];
  for (const p of priority) {
    if (statuses.includes(p)) return p;
  }
  return null;
}
