import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون أحرف/أرقام متشابهة (0/O, 1/I)

function randomCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

async function generateUniqueSchoolCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = randomCode(6);
    const q = query(collection(db, 'schools'), where('schoolCode', '==', candidate));
    const snap = await getDocs(q);
    if (snap.empty) return candidate;
  }
  throw new Error('تعذّر توليد رمز مدرسة فريد، حاولي مرة أخرى.');
}

export async function listSchools() {
  const q = query(collection(db, 'schools'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createSchool({ name, principalName }) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('اسم المدرسة مطلوب.');

  const schoolCode = await generateUniqueSchoolCode();
  const ref = await addDoc(collection(db, 'schools'), {
    name: trimmedName,
    principalName: (principalName || '').trim(),
    schoolCode,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, schoolCode };
}

export async function setSchoolActive(schoolId, active) {
  await updateDoc(doc(db, 'schools', schoolId), {
    active,
    updatedAt: serverTimestamp(),
  });
}
