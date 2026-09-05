import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
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

// أسماء عربية مختصرة لكل ورقة عمل بملف الإكسل (بحد أقصى 31 حرفًا حسب قيود إكسل)
const SHEET_NAMES_AR = {
  classes: 'الفصول',
  classTeacherAssignments: 'إسناد المعلمات',
  students: 'الطالبات',
  studentPrivate: 'بيانات حساسة',
  weeks: 'الأسابيع الدراسية',
  skills: 'المهارات',
  assessments: 'التقييمات',
  weekRecommendations: 'توصيات أسبوعية',
  actions: 'الإجراءات',
  actionTemplates: 'قوالب الإجراءات',
  teacherRecommendations: 'توصيات المعلمات',
  remediationPlans: 'خطط علاجية',
  remediationFollowUps: 'متابعات الخطط',
  users: 'حسابات المستخدمين',
  studentsByNationalId: 'فهرس السجل المدني',
};

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

// يحوّل حقلًا واحدًا لصيغة تعرضها إكسل بشكل مقروء (بدل [object Object] للمصفوفات/الكائنات المتداخلة)
function flattenRowForSheet(row) {
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const allPrimitive = value.every((v) => typeof v !== 'object' || v === null);
      out[key] = allPrimitive ? value.join('، ') : JSON.stringify(value);
    } else if (value && typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  });
  return out;
}

function safeSheetName(name) {
  return name.slice(0, 31);
}

// يبني ملف إكسل كامل من بيانات النسخة الاحتياطية — ورقة عمل منفصلة لكل نوع بيانات
export async function exportSchoolBackupAsExcelBlob(schoolId) {
  const data = await exportSchoolBackup(schoolId);
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { الحقل: 'اسم المدرسة', القيمة: data.school.name || '' },
    { الحقل: 'رمز المدرسة', القيمة: data.school.schoolCode || '' },
    { الحقل: 'اسم المديرة', القيمة: data.school.principalName || '' },
    { الحقل: 'تاريخ التصدير', القيمة: data.exportedAt },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ملخص عام');

  const arrayKeys = Object.keys(data).filter((k) => Array.isArray(data[k]));
  arrayKeys.forEach((key) => {
    const rows = data[key].map(flattenRowForSheet);
    const sheet = rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([['لا توجد بيانات بهذا القسم']]);
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(SHEET_NAMES_AR[key] || key));
  });

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/octet-stream' });
}

export function downloadBlobAsFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
