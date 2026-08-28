import { getSchool } from './schoolsApi';
import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';
import { listRecommendationsForWeek } from './weekRecommendationsApi';
import { STATUS_LABELS } from './recommendationsApi';

const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };

// يرجّع الأسابيع بين أسبوعين مختارين (شاملة الطرفين)، مرتبة زمنيًا من الأقدم للأحدث
function weeksInRange(allWeeksChronological, fromWeekId, toWeekId) {
  const fromIdx = allWeeksChronological.findIndex((w) => w.id === fromWeekId);
  const toIdx = allWeeksChronological.findIndex((w) => w.id === toWeekId);
  if (fromIdx === -1 || toIdx === -1) return [];
  const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  return allWeeksChronological.slice(start, end + 1);
}

export async function buildStudentReportData(schoolId, { classId, teacherUid, student, className, subject, teacherName, fromWeekId, toWeekId }) {
  const school = await getSchool(schoolId);
  const allWeeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse(); // الأقدم أولًا
  const rangeWeeks = weeksInRange(allWeeks, fromWeekId, toWeekId);

  const weeksData = [];
  const statusCounts = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };

  for (const week of rangeWeeks) {
    // eslint-disable-next-line no-await-in-loop
    const skills = await listSkillsForWeek(schoolId, week.id);
    const skillRows = [];
    // eslint-disable-next-line no-await-in-loop
    for (const skill of skills) {
      // eslint-disable-next-line no-await-in-loop
      const assessments = await listAssessmentsForSkill(schoolId, skill.id);
      const status = assessments[student.id]?.status || null;
      if (status && statusCounts[status] !== undefined) statusCounts[status] += 1;
      skillRows.push({ title: skill.title, status, statusLabel: status ? STATUS_LABELS[status] : '—' });
    }
    // eslint-disable-next-line no-await-in-loop
    const weekRecs = await listRecommendationsForWeek(schoolId, week.id);
    weeksData.push({
      id: week.id,
      name: week.name,
      typeLabel: TYPE_LABELS[week.type],
      enrichmentLink: week.enrichmentLink || '',
      skills: skillRows,
      recommendation: weekRecs[student.id] || '',
    });
  }

  return {
    schoolName: school.name,
    principalName: school.principalName || '',
    teacherName,
    className,
    subject,
    studentName: student.name,
    fromWeekName: weeksData[0]?.name || '',
    toWeekName: weeksData[weeksData.length - 1]?.name || '',
    weeks: weeksData,
    statusCounts,
  };
}

export { weeksInRange };
