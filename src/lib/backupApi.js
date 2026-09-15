import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from './firebase';

// المجموعات الفرعية الموجودة تحت كل مدرسة — بيانات المدرسة الأساسية التي تحاول
// أداة النسخ الاحتياطي تصديرها. لا نفشل التصدير كاملًا إذا رفضت قواعد Firestore
// قراءة قسم إضافي؛ بل نسجّل حالته بوضوح داخل ورقة "سجل التصدير".
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

const SECTION_LABELS_AR = {
  school: 'بيانات المدرسة',
  ...SHEET_NAMES_AR,
};

function serializeValue(value) {
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => { out[k] = serializeValue(v); });
    return out;
  }
  return value;
}

function permissionDenied(err) {
  return err?.code === 'permission-denied' || /missing or insufficient permissions/i.test(err?.message || '');
}

function statusRow(section, status, count = 0, note = '') {
  return {
    القسم: SECTION_LABELS_AR[section] || section,
    الحالة: status,
    'عدد السجلات': count,
    ملاحظة: note,
  };
}

async function fetchCollectionAsArray(colRef) {
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => serializeValue({ id: d.id, ...d.data() }));
}

async function fetchOptionalSection(section, getter, exportStatus) {
  try {
    const rows = await getter();
    exportStatus.push(statusRow(section, 'تم التصدير', rows.length));
    return rows;
  } catch (err) {
    if (!permissionDenied(err)) throw err;
    exportStatus.push(statusRow(
      section,
      'تعذر بسبب الصلاحيات',
      0,
      'لم تسمح قواعد Firebase لحساب الإدارة بقراءة هذا القسم. بقية النسخة الاحتياطية لم تتأثر.',
    ));
    return [];
  }
}

export async function exportSchoolBackup(schoolId) {
  const exportStatus = [];

  const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
  if (!schoolSnap.exists()) throw new Error('لم يتم العثور على المدرسة.');
  const schoolData = serializeValue({ id: schoolSnap.id, ...schoolSnap.data() });
  exportStatus.push(statusRow('school', 'تم التصدير', 1));

  const subcollections = {};
  for (const name of SCHOOL_SUBCOLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    subcollections[name] = await fetchOptionalSection(
      name,
      () => fetchCollectionAsArray(collection(db, 'schools', schoolId, name)),
      exportStatus,
    );
  }

  const users = await fetchOptionalSection(
    'users',
    async () => {
      const usersQ = query(collection(db, 'users'), where('schoolId', '==', schoolId));
      const usersSnap = await getDocs(usersQ);
      return usersSnap.docs.map((d) => serializeValue({ uid: d.id, ...d.data() }));
    },
    exportStatus,
  );

  const studentsByNationalId = await fetchOptionalSection(
    'studentsByNationalId',
    async () => {
      const nationalIdIndexQ = query(collection(db, 'studentsByNationalId'), where('schoolId', '==', schoolId));
      const nationalIdIndexSnap = await getDocs(nationalIdIndexQ);
      return nationalIdIndexSnap.docs.map((d) => serializeValue({ hash: d.id, ...d.data() }));
    },
    exportStatus,
  );

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    school: schoolData,
    exportStatus,
    users,
    studentsByNationalId,
    ...subcollections,
  };
}

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

export async function exportSchoolBackupAsExcelBlob(schoolId) {
  const data = await exportSchoolBackup(schoolId);
  const wb = XLSX.utils.book_new();

  const completedSections = data.exportStatus.filter((x) => x['الحالة'] === 'تم التصدير').length;
  const blockedSections = data.exportStatus.filter((x) => x['الحالة'] !== 'تم التصدير').length;
  const summaryRows = [
    { الحقل: 'اسم المدرسة', القيمة: data.school.name || '' },
    { الحقل: 'رمز المدرسة', القيمة: data.school.schoolCode || '' },
    { الحقل: 'اسم المديرة', القيمة: data.school.principalName || '' },
    { الحقل: 'تاريخ التصدير', القيمة: data.exportedAt },
    { الحقل: 'الأقسام التي تم تصديرها', القيمة: completedSections },
    { الحقل: 'الأقسام التي تعذرت بسبب الصلاحيات', القيمة: blockedSections },
    { الحقل: 'مهم', القيمة: blockedSections > 0 ? 'راجعي ورقة سجل التصدير لمعرفة الأقسام التي لم تسمح Firebase بقراءتها.' : 'تم تصدير جميع الأقسام المطلوبة.' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ملخص عام');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.exportStatus), 'سجل التصدير');

  const arrayKeys = Object.keys(data).filter((k) => Array.isArray(data[k]) && k !== 'exportStatus');
  arrayKeys.forEach((key) => {
    const rows = data[key].map(flattenRowForSheet);
    const sheet = rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([['لا توجد بيانات بهذا القسم أو لم تسمح الصلاحيات بقراءته — راجعي ورقة سجل التصدير']]);
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
