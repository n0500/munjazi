import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

// المجموعات الفرعية الموجودة تحت كل مدرسة — هذي القائمة الكاملة لكل بيانات المدرسة
const SCHOOL_SUBCOLLECTIONS = [
  'classes',
  'classTeacherAssignments',
  'students',
  'studentPrivate', // بيانات حساسة: السجل المدني — يُحفَّظ الملف الناتج بمكان آمن فقط
  'weeks',
  'skills',
  'assessments',
  'weekRecommendations',
  'actions',
  'actionTemplates',
  'teacherRecommendations',
  'remediationPlans',
  'remediationFollowUps',
];

// يحوّل أي قيمة Timestamp من Firestore إلى نص تاريخ قابل للتخزين بصيغة JSON عادية
function serializeValue(value) {
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => { out[k] = serializeValue(v); });
    return out;
  }
  return value;
}

async function fetchCollectionAsArray(colRef) {
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => serializeValue({ id: d.id, ...d.data() }));
}

// يجمع كل بيانات مدرسة واحدة بالكامل (لصلاحية الإدارة) — يشمل بيانات حساسة (السجل المدني)
export async function exportSchoolBackup(schoolId) {
  const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
  if (!schoolSnap.exists()) throw new Error('لم يتم العثور على المدرسة.');
  const schoolData = serializeValue({ id: schoolSnap.id, ...schoolSnap.data() });

  const subcollections = {};
  for (const name of SCHOOL_SUBCOLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    subcollections[name] = await fetchCollectionAsArray(collection(db, 'schools', schoolId, name));
  }

  const usersQ = query(collection(db, 'users'), where('schoolId', '==', schoolId));
  const usersSnap = await getDocs(usersQ);
  const users = usersSnap.docs.map((d) => serializeValue({ uid: d.id, ...d.data() }));

  const nationalIdIndexQ = query(collection(db, 'studentsByNationalId'), where('schoolId', '==', schoolId));
  const nationalIdIndexSnap = await getDocs(nationalIdIndexQ);
  const studentsByNationalId = nationalIdIndexSnap.docs.map((d) => serializeValue({ hash: d.id, ...d.data() }));

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    school: schoolData,
    users,
    studentsByNationalId,
    ...subcollections,
  };
}

export function downloadBackupJson(backupData, filenamePrefix) {
  const json = JSON.stringify(backupData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `${filenamePrefix}-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
