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

export async function deleteWeek(schoolId, weekId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'weeks', weekId));
}

export async function countActiveActionsForWeek(schoolId, weekId) {
  const q = query(
    collection(db, 'schools', schoolId, 'actions'),
    where('triggerWeekIds', 'array-contains', weekId),
  );
  const snap = await getDocs(q);
  return snap.docs.filter((d) => d.data().status === 'active').length;
}

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

// ينسخ مهارات محدَّدة يدويًا (من أسابيع مصدر مختلفة) إلى أسبوع جديد واحد، مع نسخ
// تقييماتها، وتوثيق اسم ونوع الأسبوع الأصلي لكل مهارة. تُجلب كل الأسابيع المصدر
// دفعة واحدة أولًا (بدل الجلب المتكرر أثناء الحلقة)، لضمان دقة الربط بين كل مهارة
// وأسبوعها الأصلي بشكل مباشر وواضح.
export async function copySelectedSkillsToNewWeek(schoolId, { classId, teacherUid, name, type, selectedSkillIds }) {
  const { id: newWeekId } = await createWeek(schoolId, {
    classId,
    teacherUid,
    name,
    type,
    enrichmentLink: '',
  });

  // الخطوة 1: جلب كل وثائق المهارات المصدر دفعة واحدة
  const skillSnaps = await Promise.all(
    selectedSkillIds.map((skillId) => getDoc(doc(db, 'schools', schoolId, 'skills', skillId))),
  );
  const validSkills = skillSnaps
    .filter((snap) => snap.exists())
    .map((snap) => ({ id: snap.id, ...snap.data() }));

  // الخطوة 2: جلب كل وثائق الأسابيع المصدر الفريدة دفعة واحدة (بدون تكرار نفس الأسبوع)
  const uniqueWeekIds = [...new Set(validSkills.map((s) => s.weekId))];
  const weekSnaps = await Promise.all(
    uniqueWeekIds.map((weekId) => getDoc(doc(db, 'schools', schoolId, 'weeks', weekId))),
  );
  const weekById = {};
  weekSnaps.forEach((snap) => {
    if (snap.exists()) weekById[snap.id] = snap.data();
  });

  // الخطوة 3: إنشاء كل مهارة جديدة بمصدرها الموثَّق، مع نسخ تقييماتها
  for (const sourceSkill of validSkills) {
    const sourceWeek = weekById[sourceSkill.weekId] || null;

    // eslint-disable-next-line no-await-in-loop
    const { id: newSkillId } = await createSkill(schoolId, {
      weekId: newWeekId,
      classId,
      teacherUid,
      title: sourceSkill.title,
      sourceWeekName: sourceWeek ? sourceWeek.name : '',
      sourceWeekType: sourceWeek ? sourceWeek.type : '',
    });

    // eslint-disable-next-line no-await-in-loop
    const sourceAssessments = await listAssessmentsForSkill(schoolId, sourceSkill.id);
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
