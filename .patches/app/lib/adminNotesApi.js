import { collection, doc, addDoc, updateDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
export function watchNotes(schoolId, teacherUid, next, fail) {
  const ref = collection(db, 'schools', schoolId, 'adminNotes');
  return onSnapshot(teacherUid ? query(ref, where('teacherUid', '==', teacherUid)) : ref, snap => {
    next(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  }, fail);
}
export async function createNote(schoolId, profile, data) {
  if (profile?.role !== 'admin' || profile.schoolId !== schoolId) throw new Error('هذه الخدمة لإدارة المدرسة.');
  const text = data.text.trim();
  if (!text || text.length > 2000 || !data.teacherUid) throw new Error('اختاري المعلمة واكتبي ملاحظة حتى ٢٠٠٠ حرف.');
  return addDoc(collection(db, 'schools', schoolId, 'adminNotes'), {
    ...data, text, adminUid: profile.uid, adminName: profile.displayName || 'إدارة المدرسة',
    createdAt: serverTimestamp(), readAt: null, completedAt: null, reply: '', repliedAt: null,
  });
}
export function respondToNote(schoolId, id, changes) {
  return updateDoc(doc(db, 'schools', schoolId, 'adminNotes', id), changes);
}
export { serverTimestamp };
