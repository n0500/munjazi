import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export async function listSkillsForWeek(schoolId, weekId) {
  const q = query(
    collection(db, 'schools', schoolId, 'skills'),
    where('weekId', '==', weekId),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  return rows;
}

// نسخة آمنة لولي الأمر: تضيف شرط classId عشان Firestore يقدر يتحقق من صلاحية القراءة
// كاملة على مستوى الاستعلام نفسه (بدون هالشرط الإضافي يرفض الاستعلام بالكامل)
export async function listSkillsForWeekAndClass(schoolId, weekId, classId) {
  const q = query(
    collection(db, 'schools', schoolId, 'skills'),
    where('weekId', '==', weekId),
    where('classId', '==', classId),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  return rows;
}

export async function createSkill(schoolId, { weekId, classId, teacherUid, title }) {
  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) throw new Error('اسم المهارة مطلوب.');
  const ref = await addDoc(collection(db, 'schools', schoolId, 'skills'), {
    weekId,
    classId,
    teacherUid,
    title: trimmedTitle,
    archived: false,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function deleteSkill(schoolId, skillId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'skills', skillId));
}
