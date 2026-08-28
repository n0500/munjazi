import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function loadUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    await firebaseSignOut(auth);
    throw new Error('هذا الحساب غير مفعّل بمنجزي. تواصلي مع الدعم.');
  }
  const data = snap.data();
  if (data.disabled) {
    await firebaseSignOut(auth);
    throw new Error('هذا الحساب معطّل حاليًا.');
  }
  return { uid, ...data };
}

export async function loginOwner(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = await loadUserDoc(cred.user.uid);
  if (user.role !== 'owner') {
    await firebaseSignOut(auth);
    throw new Error('هذا الحساب ليس حساب مالكة منصة.');
  }
  return user;
}

export async function loginAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = await loadUserDoc(cred.user.uid);
  if (user.role !== 'admin') {
    await firebaseSignOut(auth);
    throw new Error('هذا الحساب ليس حساب إدارة مدرسة.');
  }
  return user;
}

export async function loginTeacher(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = await loadUserDoc(cred.user.uid);
  if (user.role !== 'teacher') {
    await firebaseSignOut(auth);
    throw new Error('هذا الحساب ليس حساب معلّمة.');
  }
  return user;
}

export async function loginParent(nationalId) {
  const trimmedId = nationalId.trim();
  if (!/^[0-9]{10}$/.test(trimmedId)) {
    throw new Error('السجل المدني يجب أن يتكوّن من 10 أرقام.');
  }

  const hash = await sha256Hex(trimmedId);
  const lookupSnap = await getDoc(doc(db, 'studentsByNationalId', hash));
  if (!lookupSnap.exists()) {
    throw new Error('لم يتم العثور على طالبة بهذا السجل المدني.');
  }
  const { schoolId, studentId } = lookupSnap.data();

  const pseudoEmail = `${trimmedId}@parents.munjazi.local`;

  try {
    const cred = await signInWithEmailAndPassword(auth, pseudoEmail, trimmedId);
    return await loadUserDoc(cred.user.uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-credential') {
      throw err;
    }
    const cred = await createUserWithEmailAndPassword(auth, pseudoEmail, trimmedId);
    await setDoc(doc(db, 'users', cred.user.uid), {
      role: 'parent',
      schoolId,
      studentId,
      displayName: 'ولي الأمر',
      disabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return await loadUserDoc(cred.user.uid);
  }
}

export async function logout() {
  await firebaseSignOut(auth);
}
