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

export async function deleteWeek(schoolId, weekId) {
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
