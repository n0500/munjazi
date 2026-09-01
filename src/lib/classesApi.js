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
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listClassStudents } from './studentsApi';

export async function listClasses(schoolId) {
  const q = query(collection(db, 'schools', schoolId, 'classes'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createClass(schoolId, name) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('اسم الفصل مطلوب.');
  const ref = await addDoc(collection(db, 'schools', schoolId, 'classes'), {
    name: trimmedName,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function updateClassName(schoolId, classId, name) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('اسم الفصل مطلوب.');
  await updateDoc(doc(db, 'schools', schoolId, 'classes', classId), {
    name: trimmedName,
    updatedAt: serverTimestamp(),
  });
}

export async function setClassArchived(schoolId, classId, archived) {
  await updateDoc(doc(db, 'schools', schoolId, 'classes', classId), {
    archived,
    updatedAt: serverTimestamp(),
  });
}

export async function getClass(schoolId, classId) {
  const snap = await getDoc(doc(db, 'schools', schoolId, 'classes', classId));
  if (!snap.exists()) throw new Error('لم يتم العثور على الفصل.');
  return { id: snap.id, ...snap.data() };
}

// حذف نهائي لفصل — مسموح فقط لو كان فارغًا تمامًا (بدون طالبات وبدون إسنادات معلّمات)،
// حماية ضد حذف فصل بالخطأ فيه بيانات فعلية. الأسابيع والرصد مرتبطة بالإسناد (classId+teacherUid)،
// فعدم وجود أي إسناد يعني عمليًا عدم وجود أي رصد ممكن لهذا الفصل.
export async function deleteClassIfEmpty(schoolId, classId) {
  const [students, assignments] = await Promise.all([
    listClassStudents(schoolId, classId),
    listClassAssignments(schoolId, classId),
  ]);

  if (students.length > 0) {
    throw new Error(`لا يمكن حذف هذا الفصل لأنه يحتوي على ${students.length} طالبة. أرشفيه بدلاً من ذلك، أو انقلي الطالبات أولاً.`);
  }
  if (assignments.length > 0) {
    throw new Error('لا يمكن حذف هذا الفصل لوجود معلّمات مسندات إليه. أزيلي الإسنادات أولاً، أو أرشفي الفصل بدلاً من الحذف.');
  }

  await deleteDoc(doc(db, 'schools', schoolId, 'classes', classId));
}

export async function linkTeacherToClass(schoolId, classId, teacherUid, teacherName, subject) {
  const ref = await addDoc(collection(db, 'schools', schoolId, 'classTeacherAssignments'), {
    classId,
    teacherUid,
    teacherName: (teacherName || '').trim(),
    subject: (subject || '').trim(),
    active: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function listTeacherAssignments(schoolId, teacherUid) {
  const q = query(
    collection(db, 'schools', schoolId, 'classTeacherAssignments'),
    where('teacherUid', '==', teacherUid),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listClassAssignments(schoolId, classId) {
  const q = query(
    collection(db, 'schools', schoolId, 'classTeacherAssignments'),
    where('classId', '==', classId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function removeAssignment(schoolId, assignmentId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'classTeacherAssignments', assignmentId));
}
