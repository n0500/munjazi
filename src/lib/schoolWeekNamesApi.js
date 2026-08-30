import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export async function listSchoolWeekNames(schoolId) {
  const q = query(
    collection(db, 'schools', schoolId, 'weekNames'),
    orderBy('order', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addSchoolWeekName(schoolId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('اسم الأسبوع مطلوب.');
  const existing = await listSchoolWeekNames(schoolId);
  const maxOrder = existing.reduce((max, w) => Math.max(max, w.order || 0), 0);
  const ref = await addDoc(collection(db, 'schools', schoolId, 'weekNames'), {
    name: trimmed,
    order: maxOrder + 1,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function deleteSchoolWeekName(schoolId, weekNameId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'weekNames', weekNameId));
}
