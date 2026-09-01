import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';
import { listClassStudents } from './studentsApi';

const EMPTY_COUNTS = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };

// يرجّع ملخص آخر أسبوع لفصل معيّن: أرقام كل حالة + أسماء الطالبات تحت كل حالة
// (تُستخدم بلوحة المعلمة "نظرة عامة" حيث نحتاج أسماء الطالبات عند التوسيع، فتبقى بحساب كامل)
export async function getLatestWeekSummary(schoolId, classId, teacherUid) {
  const weeks = await listWeeksForClass(schoolId, classId, teacherUid); // الأحدث أولًا
  if (weeks.length === 0) return null;
  const latestWeek = weeks[0];

  const students = await listClassStudents(schoolId, classId);
  const studentNameById = {};
  students.forEach((s) => { studentNameById[s.id] = s.name; });

  const skills = await listSkillsForWeek(schoolId, latestWeek.id);
  const counts = { ...EMPTY_COUNTS };
  const studentsByStatus = { mastered: new Set(), needsSupport: new Set(), notMastered: new Set(), absent: new Set() };

  for (const skill of skills) {
    // eslint-disable-next-line no-await-in-loop
    const assessments = await listAssessmentsForSkill(schoolId, skill.id);
    Object.entries(assessments).forEach(([studentId, data]) => {
      const status = data.status;
      if (status && counts[status] !== undefined) {
        counts[status] += 1;
        studentsByStatus[status].add(studentNameById[studentId] || '؟');
      }
    });
  }

  return {
    weekId: latestWeek.id,
    weekName: latestWeek.name,
    counts,
    studentsByStatus: {
      mastered: [...studentsByStatus.mastered],
      needsSupport: [...studentsByStatus.needsSupport],
      notMastered: [...studentsByStatus.notMastered],
      absent: [...studentsByStatus.absent],
    },
  };
}

// نسخة خفيفة لآخر أسبوع، تُستخدم بلوحة الإدارة (متابعة الرصد) — تقرأ الملخص الجاهز
// المخزَّن على وثيقة الأسبوع نفسها (summaryCounts) بدلاً من فحص كل مهارة من جديد.
// لو الأسبوع قديم وما يملك ملخصًا مخزنًا بعد (أُنشئ قبل تفعيل هذا التخزين)، ترجع للحساب الكامل تلقائيًا.
export async function getLatestWeekSummaryLight(schoolId, classId, teacherUid) {
  const weeks = await listWeeksForClass(schoolId, classId, teacherUid);
  if (weeks.length === 0) return null;
  const latestWeek = weeks[0];

  if (latestWeek.summaryCounts) {
    return {
      weekId: latestWeek.id,
      weekName: latestWeek.name,
      createdAt: latestWeek.createdAt,
      counts: { ...EMPTY_COUNTS, ...latestWeek.summaryCounts },
    };
  }

  // رجوع تلقائي للحساب الكامل لو ما فيه ملخّص مخزَّن بعد (أسبوع قديم)
  const skills = await listSkillsForWeek(schoolId, latestWeek.id);
  const counts = { ...EMPTY_COUNTS };
  for (const skill of skills) {
    // eslint-disable-next-line no-await-in-loop
    const assessments = await listAssessmentsForSkill(schoolId, skill.id);
    Object.values(assessments).forEach((data) => {
      if (data.status && counts[data.status] !== undefined) counts[data.status] += 1;
    });
  }
  return { weekId: latestWeek.id, weekName: latestWeek.name, createdAt: latestWeek.createdAt, counts };
}

// يرجّع أرقام كل أسبوع (بالترتيب الزمني) لفصل معيّن — لرسم مقارنة التقدم
export async function getWeeksTrend(schoolId, classId, teacherUid) {
  const weeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse(); // الأقدم أولًا
  const trend = [];
  for (const week of weeks) {
    if (week.summaryCounts) {
      trend.push({ weekName: week.name, counts: { ...EMPTY_COUNTS, ...week.summaryCounts } });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const skills = await listSkillsForWeek(schoolId, week.id);
    const counts = { ...EMPTY_COUNTS };
    // eslint-disable-next-line no-await-in-loop
    for (const skill of skills) {
      // eslint-disable-next-line no-await-in-loop
      const assessments = await listAssessmentsForSkill(schoolId, skill.id);
      Object.values(assessments).forEach((data) => {
        if (data.status && counts[data.status] !== undefined) counts[data.status] += 1;
      });
    }
    trend.push({ weekName: week.name, counts });
  }
  return trend;
}
