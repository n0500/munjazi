import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listSkillsForWeek, createSkill } from './skillsApi';
import { listAssessmentsForSkill, setAssessment } from './assessmentsApi';

export async function listWeeksForClass(schoolId, classId, teacherUid) {
  const q = query(
    collection(db, 'schools', schoolId, 'weeks'),
    where('classId', '==', classId),
    where('teacherUid', '==', teacherUid),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return rows;
}

export async function createWeek(schoolId, { classId, teacherUid, name, type, enrichmentLink }) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('اسم الأسبوع الدراسي مطلوب.');
  const ref = await addDoc(collection(db, 'schools', schoolId, 'weeks'), {
    classId,
    teacherUid,
    name: trimmedName,
    type: type === 'remediation' ? 'remediation' : 'measurement',
    enrichmentLink: (enrichmentLink || '').trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function updateWeek(schoolId, weekId, { name, type, enrichmentLink }) {
  await updateDoc(doc(db, 'schools', schoolId, 'weeks', weekId), {
    name: (name || '').trim(),
    type: type === 'remediation' ? 'remediation' : 'measurement',
    enrichmentLink: (enrichmentLink || '').trim(),
    updatedAt: serverTimestamp(),
  });
}

// محفوظة للتوافق مع أي استخدام سابق — تحذف وثيقة الأسبوع فقط دون بياناته التابعة.
// يُفضَل استخدام deleteWeekWithData بدلًا منها لضمان عدم بقاء بيانات يتيمة.
export async function deleteWeek(schoolId, weekId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'weeks', weekId));
}

// عدد الإجراءات (العلاجية/الإثرائية) النشطة المرتبطة بهذا الأسبوع — تُستخدم لبناء
// رسالة تنبيه واضحة قبل الحذف، بدون حذف الإجراءات نفسها (سجلات أعمق قد ترتبط بعدة أسابيع)
export async function countActiveActionsForWeek(schoolId, weekId) {
  const q = query(
    collection(db, 'schools', schoolId, 'actions'),
    where('triggerWeekIds', 'array-contains', weekId),
  );
  const snap = await getDocs(q);
  return snap.docs.filter((d) => d.data().status === 'active').length;
}

// حذف أسبوع كامل نهائيًا، مع كل مهاراته، كل التقييمات المسجَلة على تلك المهارات لكل
// الطالبات، والتوصيات الأسبوعية المخصّصة لهذا الأسبوع — يُستخدم بعد تأكيد صريح من
// المعلمة، لأن العملية لا رجعة فيها. الإجراءات العلاجية/الإثرائية النشطة لا تُحذف
// (تبقى سجلات صالحة قد ترتبط بأسابيع أخرى أيضًا).
export async function deleteWeekWithData(schoolId, weekId) {
  const skills = await listSkillsForWeek(schoolId, weekId);

  for (const skill of skills) {
    const assessmentsQ = query(
      collection(db, 'schools', schoolId, 'assessments'),
      where('skillId', '==', skill.id),
    );
    // eslint-disable-next-line no-await-in-loop
    const assessmentsSnap = await getDocs(assessmentsQ);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(assessmentsSnap.docs.map((d) => deleteDoc(d.ref)));
    // eslint-disable-next-line no-await-in-loop
    await deleteDoc(doc(db, 'schools', schoolId, 'skills', skill.id));
  }

  const recommendationsQ = query(
    collection(db, 'schools', schoolId, 'weekRecommendations'),
    where('weekId', '==', weekId),
  );
  const recommendationsSnap = await getDocs(recommendationsQ);
  await Promise.all(recommendationsSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(db, 'schools', schoolId, 'weeks', weekId));
}

export async function getWeek(schoolId, weekId) {
  const weeks = await getDocs(query(collection(db, 'schools', schoolId, 'weeks')));
  const found = weeks.docs.find((d) => d.id === weekId);
  if (!found) throw new Error('لم يتم العثور على الأسبوع الدراسي.');
  return { id: found.id, ...found.data() };
}

// ينسخ كل مهارات وتقييمات أسبوع مصدر إلى أسبوع جديد بالكامل
export async function copyWeek(schoolId, sourceWeekId, { classId, teacherUid, name, type }) {
  const { id: newWeekId } = await createWeek(schoolId, {
    classId,
    teacherUid,
    name,
    type,
    enrichmentLink: '',
  });

  const sourceSkills = await listSkillsForWeek(schoolId, sourceWeekId);
  for (const skill of sourceSkills) {
    // eslint-disable-next-line no-await-in-loop
    const { id: newSkillId } = await createSkill(schoolId, {
      weekId: newWeekId,
      classId,
      teacherUid,
      title: skill.title,
    });
    // eslint-disable-next-line no-await-in-loop
    const sourceAssessments = await listAssessmentsForSkill(schoolId, skill.id);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      Object.entries(sourceAssessments).map(([studentId, data]) =>
        setAssessment(schoolId, {
          skillId: newSkillId,
          weekId: newWeekId,
          classId,
          teacherUid,
          studentId,
          status: data.status,
          recommendationText: data.recommendationText || '',
        }),
      ),
    );
  }

  return { id: newWeekId };
}
