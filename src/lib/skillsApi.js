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

export async function createSkill(schoolId, params) {
  const { weekId, classId, teacherUid, title, sourceWeekName, sourceWeekType } = params || {};
  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) throw new Error('اسم المهارة مطلوب.');

  const docData = {
    weekId,
    classId,
    teacherUid,
    title: trimmedTitle,
    archived: false,
    createdAt: serverTimestamp(),
    sourceWeekName: sourceWeekName ? sourceWeekName : null,
    sourceWeekType: sourceWeekType ? sourceWeekType : null,
  };

  const ref = await addDoc(collection(db, 'schools', schoolId, 'skills'), docData);
  return { id: ref.id };
}

export async function updateSkillTitle(schoolId, skillId, title) {
  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) throw new Error('اسم المهارة مطلوب.');
  await updateDoc(doc(db, 'schools', schoolId, 'skills', skillId), {
    title: trimmedTitle,
  });
}

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

export async function deleteSkill(schoolId, skillId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'skills', skillId));
}
