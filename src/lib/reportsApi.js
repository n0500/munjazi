import { getSchool } from './schoolsApi';
import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';
import { listRecommendationsForWeek } from './weekRecommendationsApi';
import { listClassStudents } from './studentsApi';
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
  const allWeeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse();
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

// تقرير الفصل — أسبوع محدد وحد: جدول كامل (طالبات × مهارات) + توصية كل طالبة + ملخص إحصائي للفصل
export async function buildClassWeekReportData(schoolId, { classId, teacherUid, className, subject, teacherName, weekId, weekName, weekTypeLabel, enrichmentLink }) {
  const school = await getSchool(schoolId);
  const students = await listClassStudents(schoolId, classId);
  const skills = await listSkillsForWeek(schoolId, weekId);
  const assessmentsBySkill = {};
  for (const skill of skills) {
    // eslint-disable-next-line no-await-in-loop
    assessmentsBySkill[skill.id] = await listAssessmentsForSkill(schoolId, skill.id);
  }
  const weekRecs = await listRecommendationsForWeek(schoolId, weekId);

  const classCounts = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
  const rows = students.map((student) => {
    const cells = skills.map((skill) => {
      const status = assessmentsBySkill[skill.id]?.[student.id]?.status || null;
      if (status && classCounts[status] !== undefined) classCounts[status] += 1;
      return { title: skill.title, statusLabel: status ? STATUS_LABELS[status] : '—' };
    });
    return { name: student.name, cells, recommendation: weekRecs[student.id] || '' };
  });

  return {
    schoolName: school.name,
    principalName: school.principalName || '',
    teacherName,
    className,
    subject,
    weekName,
    weekTypeLabel,
    enrichmentLink,
    skillTitles: skills.map((s) => s.title),
    rows,
    classCounts,
  };
}

// تقرير الفصل — مدى أسابيع: جدول كامل (طالبات × مهارات) لكل أسبوع بالمدى، عرض وحد بعد الثاني
// عشان تسهل مقارنة نفس المهارة بين أسبوع قياس وأسبوع معالجة + ملخص إحصائي إجمالي بالنهاية
export async function buildClassRangeReportData(schoolId, { classId, teacherUid, className, subject, teacherName, fromWeekId, toWeekId }) {
  const school = await getSchool(schoolId);
  const students = await listClassStudents(schoolId, classId);
  const allWeeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse();
  const rangeWeeks = weeksInRange(allWeeks, fromWeekId, toWeekId);

  const classCounts = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
  const weeksData = [];

  for (const week of rangeWeeks) {
    // eslint-disable-next-line no-await-in-loop
    const skills = await listSkillsForWeek(schoolId, week.id);
    const assessmentsBySkill = {};
    // eslint-disable-next-line no-await-in-loop
    for (const skill of skills) {
      // eslint-disable-next-line no-await-in-loop
      assessmentsBySkill[skill.id] = await listAssessmentsForSkill(schoolId, skill.id);
    }
    // eslint-disable-next-line no-await-in-loop
    const weekRecs = await listRecommendationsForWeek(schoolId, week.id);

    const rows = students.map((student) => {
      const cells = skills.map((skill) => {
        const status = assessmentsBySkill[skill.id]?.[student.id]?.status || null;
        if (status && classCounts[status] !== undefined) classCounts[status] += 1;
        return { title: skill.title, statusLabel: status ? STATUS_LABELS[status] : '—' };
      });
      return { name: student.name, cells, recommendation: weekRecs[student.id] || '' };
    });

    weeksData.push({
      id: week.id,
      name: week.name,
      typeLabel: TYPE_LABELS[week.type],
      enrichmentLink: week.enrichmentLink || '',
      skillTitles: skills.map((s) => s.title),
      rows,
    });
  }

  return {
    schoolName: school.name,
    principalName: school.principalName || '',
    teacherName,
    className,
    subject,
    fromWeekName: weeksData[0]?.name || '',
    toWeekName: weeksData[weeksData.length - 1]?.name || '',
    weeks: weeksData,
    classCounts,
  };
}

export { weeksInRange };
