import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parsePastedRows(rawText) {
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      return { name: parts[0] || '', nationalId: parts[1] || '' };
    });
}

export async function listClassStudents(schoolId, classId) {
  const q = query(
    collection(db, 'schools', schoolId, 'students'),
    orderBy('name'),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.currentClassId === classId && !s.archived);
}

async function createOneStudent(schoolId, classId, name, nationalId) {
  const trimmedName = (name || '').trim();
  const trimmedId = (nationalId || '').trim();
  if (!trimmedName) throw new Error('اسم الطالبة مطلوب.');
  if (!/^[0-9]{10}$/.test(trimmedId)) throw new Error('السجل المدني يجب أن يتكوّن من 10 أرقام.');

  const studentRef = doc(collection(db, 'schools', schoolId, 'students'));
  const batch = writeBatch(db);
  batch.set(studentRef, {
    name: trimmedName,
    currentClassId: classId,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'schools', schoolId, 'studentPrivate', studentRef.id), {
    nationalId: trimmedId,
    createdAt: serverTimestamp(),
  });
  const hash = await sha256Hex(trimmedId);
  batch.set(doc(db, 'studentsByNationalId', hash), {
    schoolId,
    studentId: studentRef.id,
  });
  await batch.commit();
  return studentRef.id;
}

export async function addSingleStudent(schoolId, classId, name, nationalId) {
  return createOneStudent(schoolId, classId, name, nationalId);
}

export async function bulkImportStudents(schoolId, classId, rawText) {
  const rows = parsePastedRows(rawText);
  let success = 0;
  const failed = [];
  for (const row of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await createOneStudent(schoolId, classId, row.name, row.nationalId);
      success += 1;
    } catch (err) {
      failed.push({ ...row, reason: err.message });
    }
  }
  return { success, failed, total: rows.length };
}

export async function updateStudent(schoolId, studentId, { name, nationalId }) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('اسم الطالبة مطلوب.');
  await updateDoc(doc(db, 'schools', schoolId, 'students', studentId), {
    name: trimmedName,
    updatedAt: serverTimestamp(),
  });
  if (nationalId && nationalId.trim()) {
    const trimmedId = nationalId.trim();
    if (!/^[0-9]{10}$/.test(trimmedId)) throw new Error('السجل المدني يجب أن يتكوّن من 10 أرقام.');
    await updateDoc(doc(db, 'schools', schoolId, 'studentPrivate', studentId), {
      nationalId: trimmedId,
    });
    const hash = await sha256Hex(trimmedId);
    await setDoc(doc(db, 'studentsByNationalId', hash), { schoolId, studentId });
  }
}

export async function deleteStudent(schoolId, studentId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'students', studentId));
  await deleteDoc(doc(db, 'schools', schoolId, 'studentPrivate', studentId));
}

export async function moveStudent(schoolId, studentId, newClassId) {
  await updateDoc(doc(db, 'schools', schoolId, 'students', studentId), {
    currentClassId: newClassId,
    updatedAt: serverTimestamp(),
  });
}
