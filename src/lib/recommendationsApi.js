import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const STATUS_LABELS = {
  mastered: 'متقنة',
  needsSupport: 'تحتاج دعم',
  notMastered: 'غير متقنة',
  absent: 'غائبة',
};

// رسائل شكر وتشجيع تلقائية متنوعة — تُختار عشوائيًا عند تعيين حالة "متقنة"
export const ENCOURAGEMENT_MESSAGES = [
  'أحسنتِ! إتقان رائع لهذه المهارة، استمري بهذا التميز.',
  'ما شاء الله، أداء متميز! فخورون بكِ.',
  'عمل ممتاز! واصلي هذا المستوى الرائع.',
  'رائعة! إتقانك لهذه المهارة يستحق الثناء.',
  'بارك الله فيكِ، تقدّم ملحوظ ومستوى ممتاز.',
  'استمري بهذا الأداء المتميز، أنتِ قدوة لزميلاتك.',
];

export function pickRandomEncouragement() {
  return ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
}

// توصيات افتراضية جاهزة لكل حالة (غير "متقنة") — نقطة انطلاق قبل إضافات المعلّمة
export const DEFAULT_RECOMMENDATIONS = {
  needsSupport: [
    'مراجعة إضافية مع تدريبات منزلية بسيطة.',
    'إعادة شرح المهارة بأسلوب مبسّط داخل الحصة القادمة.',
    'تدريب فردي قصير خلال وقت الحصة.',
  ],
  notMastered: [
    'إحالة لجلسة معالجة فردية مكثّفة.',
    'إشراك ولي الأمر بمتابعة يومية بسيطة بالمنزل.',
    'إعادة تقديم المهارة من الأساس بأسلوب مختلف.',
  ],
  absent: [
    'تعويض المهارة في أقرب حصة متاحة.',
    'التنسيق مع ولي الأمر لمتابعة ما فات.',
  ],
};

export async function listCustomRecommendations(schoolId, teacherUid, status) {
  const q = query(
    collection(db, 'schools', schoolId, 'teacherRecommendations'),
    where('teacherUid', '==', teacherUid),
    where('status', '==', status),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addCustomRecommendation(schoolId, teacherUid, status, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('نص التوصية مطلوب.');
  const ref = await addDoc(collection(db, 'schools', schoolId, 'teacherRecommendations'), {
    teacherUid,
    status,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, text: trimmed };
}

export async function deleteCustomRecommendation(schoolId, id) {
  await deleteDoc(doc(db, 'schools', schoolId, 'teacherRecommendations', id));
}

export async function listAllRecommendationsForStatus(schoolId, teacherUid, status) {
  const custom = await listCustomRecommendations(schoolId, teacherUid, status);
  const defaults = (DEFAULT_RECOMMENDATIONS[status] || []).map((text, i) => ({ id: `default_${i}`, text, isDefault: true }));
  return [...defaults, ...custom];
}
