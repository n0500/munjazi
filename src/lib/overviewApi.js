import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';
import { listClassStudents } from './studentsApi';

const EMPTY_COUNTS = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };

// يرجّع ملخص آخر أسبوع لفصل معيّن: أرقام كل حالة + أسماء الطالبات تحت كل حالة
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

// يرجّع أرقام كل أسبوع (بالترتيب الزمني) لفصل معيّن — لرسم مقارنة التقدم
export async function getWeeksTrend(schoolId, classId, teacherUid) {
  const weeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse(); // الأقدم أولًا
  const trend = [];
  for (const week of weeks) {
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
