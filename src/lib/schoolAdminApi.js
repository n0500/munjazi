import { createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, doc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export async function registerSchoolAdmin({ schoolCode, displayName, email, password }) {
  const cleanCode = schoolCode.trim().toUpperCase();
  const q = query(collection(db, 'schools'), where('schoolCode', '==', cleanCode));
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error('رمز المدرسة غير صحيح.');
  }
  const schoolDoc = snap.docs[0];
  const school = schoolDoc.data();
  if (!school.active) {
    throw new Error('هذه المدرسة غير نشطة حاليًا. تواصلي مع مالكة المنصة.');
  }

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    await setDoc(doc(db, 'users', cred.user.uid), {
      role: 'admin',
      schoolId: schoolDoc.id,
      displayName: (displayName || '').trim() || 'إدارة المدرسة',
      disabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    await firebaseSignOut(auth);
    throw err;
  }

  return { schoolId: schoolDoc.id, schoolName: school.name };
}
