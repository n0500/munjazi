import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { recomputeWeekSummary } from './assessmentsApi';

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

// تعديل اسم مهارة موجودة، دون التأثير على تقييماتها المسجَّلة
export async function updateSkillTitle(schoolId, skillId, title) {
  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) throw new Error('اسم المهارة مطلوب.');
  await updateDoc(doc(db, 'schools', schoolId, 'skills', skillId), {
    title: trimmedTitle,
  });
}

// حذف مهارة نهائيًا، مع حذف كل التقييمات المسجَّلة عليها لكل الطالبات،
// ثم إعادة حساب ملخّص الأسبوع المخزَّن ليعكس الحذف فورًا
export async function deleteSkillWithAssessments(schoolId, skillId) {
  const skillSnap = await getDoc(doc(db, 'schools', schoolId, 'skills', skillId));
  const weekId = skillSnap.exists() ? skillSnap.data().weekId : null;

  const assessmentsQ = query(
    collection(db, 'schools', schoolId, 'assessments'),
    where('skillId', '==', skillId),
  );
  const assessmentsSnap = await getDocs(assessmentsQ);
  await Promise.all(assessmentsSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(db, 'schools', schoolId, 'skills', skillId));

  if (weekId) {
    await recomputeWeekSummary(schoolId, weekId);
  }
}

// محفوظة للتوافق مع أي استخدام سابق — تحذف وثيقة المهارة فقط دون تقييماتها.
// يُفضَّل استخدام deleteSkillWithAssessments بدلًا منها لضمان عدم بقاء بيانات يتيمة.
export async function deleteSkill(schoolId, skillId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'skills', skillId));
}
