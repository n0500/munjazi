import { getSchool } from './schoolsApi';
import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill, getStudentAssessment } from './assessmentsApi';
import { listRecommendationsForWeek } from './weekRecommendationsApi';
import { listClassStudents } from './studentsApi';
import { listClassAssignments } from './classesApi';
import { STATUS_LABELS } from './recommendationsApi';
import { listActionsForClass } from './actionEngine';

const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };

function weeksInRange(allWeeksChronological, fromWeekId, toWeekId) {
  const fromIdx = allWeeksChronological.findIndex((w) => w.id === fromWeekId);
  const toIdx = allWeeksChronological.findIndex((w) => w.id === toWeekId);
  if (fromIdx === -1 || toIdx === -1) return [];
  const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  return allWeeksChronological.slice(start, end + 1);
}

async function activeActionsForStudent(schoolId, classId, studentId, teacherUid) {
  const allActions = await listActionsForClass(schoolId, classId);
  return allActions
    .filter((a) => a.studentId === studentId && a.status === 'active' && a.teacherUid === teacherUid)
    .map((a) => ({
      id: a.id,
      type: a.type,
      typeLabel: a.type === 'remedial' ? 'علاجي' : 'إثرائي',
      affectedSkillTitles: a.affectedSkillTitles || [],
      text: a.finalText || a.suggestedText,
      parentAcknowledgment: a.parentAcknowledgment || { viewedAt: null, viewedByParentId: null },
    }));
}

export async function listSubjectsForStudentClass(schoolId, classId) {
  const assignments = await listClassAssignments(schoolId, classId);
  return assignments.filter((a) => a.active !== false);
}

// يبني ملخّص كل مادة/معلمة لطالبة معينة — يُستخدم بلوحة ولي الأمر
// يستخدم getStudentAssessment (قراءة مباشرة لوثيقة الطالبة) بدل القراءة الجماعية،
// لأن ولي الأمر ما يملك صلاحية يقرأ تقييمات كل طالبات الفصل
export async function buildParentOverviewData(schoolId, { classId, className, studentId, studentName }) {
  const assignments = await listSubjectsForStudentClass(schoolId, classId);
  const allActions = await listActionsForClass(schoolId, classId);

  const subjects = [];
  for (const a of assignments) {
    // eslint-disable-next-line no-await-in-loop
    const weeks = await listWeeksForClass(schoolId, classId, a.teacherUid);
    const latestWeek = weeks[0] || null;

    let skillRows = [];
    let masteredCount = 0;
    let totalSkills = 0;
    let enrichmentLink = '';
    let weekName = '';

    if (latestWeek) {
      weekName = latestWeek.name;
      enrichmentLink = latestWeek.enrichmentLink || '';
      // eslint-disable-next-line no-await-in-loop
      const skills = await listSkillsForWeek(schoolId, latestWeek.id);
      totalSkills = skills.length;
      // eslint-disable-next-line no-await-in-loop
      for (const skill of skills) {
        // eslint-disable-next-line no-await-in-loop
        const assessment = await getStudentAssessment(schoolId, skill.id, studentId);
        const status = assessment?.status || null;
        if (status === 'mastered') masteredCount += 1;
        skillRows.push({ title: skill.title, status, statusLabel: status ? STATUS_LABELS[status] : '—' });
      }
    }

    const subjectActions = allActions
      .filter((act) => act.studentId === studentId && act.teacherUid === a.teacherUid && act.status === 'active')
      .map((act) => ({
        id: act.id,
        type: act.type,
        typeLabel: act.type === 'remedial' ? 'علاجي' : 'إثرائي',
        affectedSkillTitles: act.affectedSkillTitles || [],
        text: act.finalText || act.suggestedText,
      }));

    const hasRemedial = subjectActions.some((x) => x.type === 'remedial');
    const statusKey = !latestWeek ? 'notTracked' : hasRemedial ? 'needsAttention' : 'stable';

    subjects.push({
      teacherUid: a.teacherUid,
      subject: a.subject || 'بدون اسم',
      teacherName: a.teacherName,
      weekName,
      masteredCount,
      totalSkills,
      skillRows,
      enrichmentLink,
      activeActions: subjectActions,
      statusKey,
    });
  }

  const priority = subjects
    .flatMap((s) => s.activeActions.filter((x) => x.type === 'remedial').map((x) => ({ ...x, subject: s.subject })))[0] || null;

  return {
    studentName,
    className,
    subjects,
    priority,
    counts: {
      needsAttention: subjects.filter((s) => s.statusKey === 'needsAttention').length,
      stable: subjects.filter((s) => s.statusKey === 'stable').length,
      total: subjects.length,
    },
  };
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

  const activeActions = await activeActionsForStudent(schoolId, classId, student.id, teacherUid);

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
    activeActions,
  };
}

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
  const allActions = await listActionsForClass(schoolId, classId);

  const classCounts = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
  const rows = students.map((student) => {
    const cells = skills.map((skill) => {
      const status = assessmentsBySkill[skill.id]?.[student.id]?.status || null;
      if (status && classCounts[status] !== undefined) classCounts[status] += 1;
      return { title: skill.title, status, statusLabel: status ? STATUS_LABELS[status] : '—' };
    });
    const studentActions = allActions
      .filter((a) => a.studentId === student.id && a.status === 'active' && a.teacherUid === teacherUid)
      .map((a) => ({
        type: a.type,
        typeLabel: a.type === 'remedial' ? 'علاجي' : 'إثرائي',
        affectedSkillTitles: a.affectedSkillTitles || [],
        text: a.finalText || a.suggestedText,
      }));
    return { name: student.name, cells, recommendation: weekRecs[student.id] || '', activeActions: studentActions };
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

export async function buildClassRangeReportData(schoolId, { classId, teacherUid, className, subject, teacherName, fromWeekId, toWeekId }) {
  const school = await getSchool(schoolId);
  const students = await listClassStudents(schoolId, classId);
  const allWeeks = (await listWeeksForClass(schoolId, classId, teacherUid)).slice().reverse();
  const rangeWeeks = weeksInRange(allWeeks, fromWeekId, toWeekId);
  const allActions = await listActionsForClass(schoolId, classId);

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
        return { title: skill.title, status, statusLabel: status ? STATUS_LABELS[status] : '—' };
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

  const studentActiveActions = {};
  students.forEach((student) => {
    studentActiveActions[student.name] = allActions
      .filter((a) => a.studentId === student.id && a.status === 'active' && a.teacherUid === teacherUid)
      .map((a) => ({
        type: a.type,
        typeLabel: a.type === 'remedial' ? 'علاجي' : 'إثرائي',
        affectedSkillTitles: a.affectedSkillTitles || [],
        text: a.finalText || a.suggestedText,
      }));
  });

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
    studentActiveActions,
  };
}

export { weeksInRange };
