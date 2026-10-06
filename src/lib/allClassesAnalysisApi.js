import { getSchool } from './schoolsApi';
import { listClasses, listTeacherAssignments } from './classesApi';
import { listClassStudents } from './studentsApi';
import { listWeeksForClass } from './weeksApi';
import { listSkillsForWeek } from './skillsApi';
import { listAssessmentsForSkill } from './assessmentsApi';

const EMPTY_COUNTS = { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
const STATUS_KEYS = Object.keys(EMPTY_COUNTS);

function emptyCounts() {
  return { ...EMPTY_COUNTS };
}

function mergeCounts(target, source) {
  STATUS_KEYS.forEach((key) => {
    target[key] = (target[key] || 0) + (source?.[key] || 0);
  });
  return target;
}

function countTotal(counts, includeAbsent = true) {
  return (counts.mastered || 0)
    + (counts.needsSupport || 0)
    + (counts.notMastered || 0)
    + (includeAbsent ? (counts.absent || 0) : 0);
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function masteryPercent(counts, includeAbsent = true) {
  return percent(counts.mastered || 0, countTotal(counts, includeAbsent));
}

function normalizeSkillTitle(title) {
  return (title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar');
}

function deriveStudentStatus(statuses) {
  const present = (statuses || []).filter(Boolean);
  const assessed = present.filter((status) => status !== 'absent');
  if (assessed.includes('notMastered')) return 'notMastered';
  if (assessed.includes('needsSupport')) return 'needsSupport';
  if (assessed.includes('mastered')) return 'mastered';
  if (present.includes('absent')) return 'absent';
  return null;
}

function compareStudentStatuses(beforeMap, afterMap) {
  const transition = {
    improved: 0,
    stable: 0,
    declined: 0,
    toMastered: 0,
    notMasteredToSupport: 0,
  };
  const rank = { notMastered: 1, needsSupport: 2, mastered: 3 };
  const ids = new Set([...Object.keys(beforeMap || {}), ...Object.keys(afterMap || {})]);

  ids.forEach((studentId) => {
    const before = beforeMap?.[studentId] || null;
    const after = afterMap?.[studentId] || null;
    if (!before || !after || before === 'absent' || after === 'absent') return;

    if (rank[after] > rank[before]) transition.improved += 1;
    else if (rank[after] < rank[before]) transition.declined += 1;
    else transition.stable += 1;

    if (after === 'mastered' && before !== 'mastered') transition.toMastered += 1;
    if (before === 'notMastered' && after === 'needsSupport') transition.notMasteredToSupport += 1;
  });

  return transition;
}

function addTransition(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] += source?.[key] || 0;
  });
  return target;
}

async function buildWeekData(schoolId, week, students) {
  const skills = await listSkillsForWeek(schoolId, week.id);
  const assessmentMaps = await Promise.all(
    skills.map((skill) => listAssessmentsForSkill(schoolId, skill.id)),
  );

  const counts = emptyCounts();
  const studentStatuses = {};
  students.forEach((student) => {
    studentStatuses[student.id] = [];
  });

  const skillStats = skills.map((skill, index) => {
    const skillCounts = emptyCounts();
    const assessments = assessmentMaps[index] || {};

    Object.entries(assessments).forEach(([studentId, assessment]) => {
      const status = assessment?.status;
      if (!status || skillCounts[status] === undefined) return;
      skillCounts[status] += 1;
      counts[status] += 1;
      if (!studentStatuses[studentId]) studentStatuses[studentId] = [];
      studentStatuses[studentId].push(status);
    });

    const assessedWithoutAbsence = countTotal(skillCounts, false);
    return {
      title: skill.title,
      normalizedTitle: normalizeSkillTitle(skill.title),
      counts: skillCounts,
      masteryPercent: masteryPercent(skillCounts, false),
      assessedCount: assessedWithoutAbsence,
    };
  });

  const studentStatusById = {};
  Object.entries(studentStatuses).forEach(([studentId, statuses]) => {
    const status = deriveStudentStatus(statuses);
    if (status) studentStatusById[studentId] = status;
  });

  const expected = students.length * skills.length;
  const assessed = countTotal(counts, true);

  return {
    id: week.id,
    name: week.name,
    type: week.type || 'measurement',
    createdAt: week.createdAt || null,
    counts,
    masteryPercent: masteryPercent(counts, true),
    completenessPercent: percent(assessed, expected),
    skillsCount: skills.length,
    assessed,
    expected,
    skillStats,
    studentStatusById,
  };
}

function aggregateSkillStats(weekData) {
  const map = {};

  weekData.forEach((week) => {
    week.skillStats.forEach((skill) => {
      const key = skill.normalizedTitle;
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          key,
          title: skill.title,
          counts: emptyCounts(),
          occurrences: 0,
        };
      }
      mergeCounts(map[key].counts, skill.counts);
      map[key].occurrences += 1;
    });
  });

  return Object.values(map).map((row) => ({
    ...row,
    masteryPercent: masteryPercent(row.counts, false),
    total: countTotal(row.counts, false),
  }));
}

function latestMeasurementRemediationPair(weeks) {
  const pairs = [];

  for (let i = 0; i < weeks.length; i += 1) {
    if (weeks[i].type !== 'remediation') continue;
    let measurement = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (weeks[j].type === 'measurement') {
        measurement = weeks[j];
        break;
      }
    }
    if (!measurement) continue;

    const remediation = weeks[i];
    const transition = compareStudentStatuses(
      measurement.studentStatusById,
      remediation.studentStatusById,
    );

    pairs.push({
      beforeWeekName: measurement.name,
      afterWeekName: remediation.name,
      beforePercent: measurement.masteryPercent,
      afterPercent: remediation.masteryPercent,
      impact: remediation.masteryPercent - measurement.masteryPercent,
      transition,
    });
  }

  return pairs.length > 0 ? pairs[pairs.length - 1] : null;
}

async function buildClassAnalysis(schoolId, assignment, classRow) {
  const [students, rawWeeks] = await Promise.all([
    listClassStudents(schoolId, assignment.classId),
    listWeeksForClass(schoolId, assignment.classId, assignment.teacherUid),
  ]);

  const weeksChronological = rawWeeks.slice().reverse();
  const weeks = await Promise.all(
    weeksChronological.map((week) => buildWeekData(schoolId, week, students)),
  );

  const latestWeek = [...weeks].reverse().find((week) => countTotal(week.counts, true) > 0)
    || weeks[weeks.length - 1]
    || null;
  const firstWeek = weeks.find((week) => countTotal(week.counts, true) > 0) || null;
  const previousWeek = latestWeek
    ? [...weeks.slice(0, Math.max(0, weeks.indexOf(latestWeek)))].reverse().find((week) => countTotal(week.counts, true) > 0) || null
    : null;

  const latestMastery = latestWeek?.masteryPercent ?? 0;
  const previousMastery = previousWeek?.masteryPercent ?? latestMastery;
  const delta = latestMastery - previousMastery;
  const direction = delta >= 4 ? 'up' : delta <= -4 ? 'down' : 'stable';
  const progress = firstWeek ? latestMastery - firstWeek.masteryPercent : 0;

  const skillAggregate = aggregateSkillStats(weeks);
  const latestPair = latestMeasurementRemediationPair(weeks);

  return {
    assignmentId: assignment.id,
    classId: assignment.classId,
    className: classRow?.name || 'فصل غير مسمّى',
    subject: assignment.subject || 'دون تحديد مادة',
    studentsCount: students.length,
    weeksCount: weeks.length,
    latestWeekName: latestWeek?.name || 'لا يوجد رصد',
    latestMastery,
    previousMastery,
    direction,
    progress,
    completenessPercent: latestWeek?.completenessPercent ?? 0,
    currentCounts: latestWeek?.counts || emptyCounts(),
    currentExpected: latestWeek?.expected || 0,
    currentAssessed: latestWeek?.assessed || 0,
    skillAggregate,
    uniqueSkillsCount: skillAggregate.length,
    latestRemediationPair: latestPair,
    weeks,
  };
}

function aggregateTrend(classes) {
  const map = {};

  classes.forEach((classRow) => {
    classRow.weeks.forEach((week, index) => {
      const key = (week.name || `أسبوع ${index + 1}`).trim();
      if (!map[key]) {
        map[key] = {
          weekName: key,
          counts: emptyCounts(),
          sortKey: week.createdAt?.seconds || index,
        };
      }
      mergeCounts(map[key].counts, week.counts);
      const ts = week.createdAt?.seconds;
      if (ts && (!map[key].sortKey || ts < map[key].sortKey)) map[key].sortKey = ts;
    });
  });

  return Object.values(map)
    .map((row) => ({
      ...row,
      masteryPercent: masteryPercent(row.counts, true),
    }))
    .sort((a, b) => a.sortKey - b.sortKey);
}

function aggregateSkills(classes) {
  const map = {};

  classes.forEach((classRow) => {
    classRow.skillAggregate.forEach((skill) => {
      if (!map[skill.key]) {
        map[skill.key] = {
          key: skill.key,
          title: skill.title,
          counts: emptyCounts(),
          classIds: new Set(),
          occurrences: 0,
        };
      }
      mergeCounts(map[skill.key].counts, skill.counts);
      map[skill.key].classIds.add(classRow.classId);
      map[skill.key].occurrences += skill.occurrences;
    });
  });

  return Object.values(map).map((row) => ({
    key: row.key,
    title: row.title,
    counts: row.counts,
    classesCount: row.classIds.size,
    occurrences: row.occurrences,
    total: countTotal(row.counts, false),
    masteryPercent: masteryPercent(row.counts, false),
  }));
}

function buildHeatmap(classes, problemSkills) {
  return classes.map((classRow) => {
    const byKey = Object.fromEntries(classRow.skillAggregate.map((skill) => [skill.key, skill]));
    return {
      className: classRow.className,
      subject: classRow.subject,
      cells: problemSkills.map((skill) => ({
        key: skill.key,
        title: skill.title,
        masteryPercent: byKey[skill.key]?.masteryPercent ?? null,
        total: byKey[skill.key]?.total || 0,
      })),
    };
  });
}

function buildNarrative({ classes, summary, problemSkills, remediation, alerts }) {
  if (classes.length === 0) return ['لا توجد فصول مرتبطة بالمعلّمة حتى الآن.'];

  const sentences = [];
  sentences.push(
    `بلغ الإتقان العام في آخر رصد متاح ${summary.masteryPercent}% عبر ${classes.length} فصل/فصول، مع اكتمال رصد قدره ${summary.completenessPercent}%.`,
  );

  if (summary.bestClass?.className) {
    sentences.push(
      `حقق ${summary.bestClass.className} أعلى نسبة إتقان حالية (${summary.bestClass.latestMastery}%)، بينما يحتاج ${summary.supportClass?.className || 'أحد الفصول'} إلى متابعة أكبر.`,
    );
  }

  if (problemSkills[0]) {
    sentences.push(
      `أكثر المهارات احتياجًا للمعالجة حاليًا هي «${problemSkills[0].title}» بنسبة إتقان ${problemSkills[0].masteryPercent}% عبر ${problemSkills[0].classesCount} فصل/فصول.`,
    );
  }

  if (remediation.classesWithData > 0) {
    const direction = remediation.averageImpact > 0 ? 'تحسنًا' : remediation.averageImpact < 0 ? 'تراجعًا' : 'استقرارًا';
    sentences.push(
      `تُظهر بيانات المعالجة ${direction} بمتوسط أثر ${remediation.averageImpact > 0 ? '+' : ''}${remediation.averageImpact} نقطة مئوية.`,
    );
  }

  if (alerts.length > 0) {
    sentences.push(`يوجد ${alerts.length} تنبيه/تنبيهات تستحق المتابعة قبل القياس القادم.`);
  }

  return sentences;
}

export async function buildAllClassesAnalysis(schoolId, teacherUid, teacherName = '') {
  const [school, classesRows, assignmentsRows] = await Promise.all([
    getSchool(schoolId),
    listClasses(schoolId),
    listTeacherAssignments(schoolId, teacherUid),
  ]);

  const classById = Object.fromEntries(classesRows.map((row) => [row.id, row]));
  const assignments = assignmentsRows.filter((row) => row.active !== false);

  const classes = await Promise.all(
    assignments.map((assignment) => buildClassAnalysis(
      schoolId,
      assignment,
      classById[assignment.classId],
    )),
  );

  classes.sort((a, b) => b.latestMastery - a.latestMastery);

  const statusCounts = emptyCounts();
  classes.forEach((row) => mergeCounts(statusCounts, row.currentCounts));

  const totalExpected = classes.reduce((sum, row) => sum + row.currentExpected, 0);
  const totalAssessed = classes.reduce((sum, row) => sum + row.currentAssessed, 0);
  const skills = aggregateSkills(classes)
    .filter((row) => row.total > 0)
    .sort((a, b) => {
      if (a.masteryPercent !== b.masteryPercent) return a.masteryPercent - b.masteryPercent;
      return b.total - a.total;
    });

  const problemSkills = skills
    .filter((row) => row.classesCount >= 2 || classes.length === 1)
    .slice(0, 6);

  const strongestSkills = skills.slice().sort((a, b) => b.masteryPercent - a.masteryPercent).slice(0, 5);
  const bestClass = classes.length > 0 ? classes[0] : null;
  const supportClass = classes.length > 0
    ? classes.slice().sort((a, b) => a.latestMastery - b.latestMastery)[0]
    : null;

  const latestPairs = classes
    .map((row) => ({ classRow: row, pair: row.latestRemediationPair }))
    .filter((row) => row.pair);

  const movement = { improved: 0, stable: 0, declined: 0, toMastered: 0, notMasteredToSupport: 0 };
  latestPairs.forEach(({ pair }) => addTransition(movement, pair.transition));

  const averageImpact = latestPairs.length
    ? Math.round(latestPairs.reduce((sum, row) => sum + row.pair.impact, 0) / latestPairs.length)
    : 0;

  const remediation = {
    classesWithData: latestPairs.length,
    averageImpact,
    movement,
    rows: latestPairs.map(({ classRow, pair }) => ({
      className: classRow.className,
      subject: classRow.subject,
      ...pair,
    })),
  };

  const summary = {
    classesCount: classes.length,
    studentsCount: classes.reduce((sum, row) => sum + row.studentsCount, 0),
    uniqueSkillsCount: skills.length,
    masteryPercent: masteryPercent(statusCounts, true),
    completenessPercent: percent(totalAssessed, totalExpected),
    bestClass,
    supportClass,
    problemSkill: problemSkills[0] || null,
    remediationImpact: averageImpact,
    bestProgressClass: classes.length > 0
      ? classes.slice().sort((a, b) => b.progress - a.progress)[0]
      : null,
  };

  const alerts = [];
  classes.forEach((row) => {
    if (row.direction === 'down') {
      alerts.push(`انخفض الإتقان في ${row.className} من ${row.previousMastery}% إلى ${row.latestMastery}%.`);
    }
    if (row.completenessPercent < 80 && row.weeksCount > 0) {
      alerts.push(`اكتمال الرصد في ${row.className} هو ${row.completenessPercent}% فقط؛ يفضّل استكمال الرصد قبل المقارنة النهائية.`);
    }
    if (row.latestRemediationPair && row.latestRemediationPair.impact <= 0) {
      alerts.push(`لم يظهر أثر إيجابي بعد المعالجة الأخيرة في ${row.className}؛ يلزم مراجعة الإجراء العلاجي وإعادة القياس.`);
    }
  });

  problemSkills.slice(0, 3).forEach((skill) => {
    if (skill.masteryPercent < 70 && skill.classesCount >= 2) {
      alerts.push(`مهارة «${skill.title}» منخفضة الإتقان (${skill.masteryPercent}%) في أكثر من فصل، ما يشير إلى حاجة لتدخل مشترك.`);
    }
  });

  const priorities = [];
  if (problemSkills[0]) {
    priorities.push(`إعادة تدريس مهارة «${problemSkills[0].title}» للفصول المتأثرة، ثم إجراء قياس قصير للتحقق من الأثر.`);
  }
  if (supportClass && supportClass.latestMastery < 80) {
    priorities.push(`إعطاء أولوية متابعة لفصل ${supportClass.className}؛ نسبة الإتقان الحالية ${supportClass.latestMastery}%.`);
  }
  if (summary.completenessPercent < 90) {
    priorities.push(`رفع اكتمال الرصد من ${summary.completenessPercent}% قبل اعتماد المقارنة النهائية بين الفصول.`);
  } else if (remediation.classesWithData > 0 && remediation.averageImpact < 5) {
    priorities.push('مراجعة الخطط العلاجية ذات الأثر المحدود، وتعديل الاستراتيجية قبل إعادة القياس.');
  }
  while (priorities.length < 3 && classes.length > 0) {
    if (priorities.length === 1) priorities.push('متابعة اتجاه الإتقان أسبوعيًا والتركيز على الفصول التي يظهر فيها تراجع متكرر.');
    else priorities.push('توثيق أثر المعالجة وربط كل توصية بنتيجة قياس لاحقة لإظهار التحسن بوضوح.');
  }

  const recommendations = [];
  if (problemSkills.length > 0) {
    recommendations.push(`تنفيذ معالجة مشتركة للمهارات الأقل إتقانًا، وفي مقدمتها «${problemSkills[0].title}».`);
  }
  if (summary.bestProgressClass?.progress > 0) {
    recommendations.push(`الاستفادة من الممارسة التي رفعت ${summary.bestProgressClass.className} بمقدار +${summary.bestProgressClass.progress} نقطة ومشاركتها مع بقية الفصول عند ملاءمتها.`);
  }
  if (remediation.movement.toMastered > 0) {
    recommendations.push(`الاستمرار في التدخلات التي نقلت ${remediation.movement.toMastered} طالبة إلى حالة الإتقان بعد المعالجة.`);
  }
  if (alerts.some((item) => item.includes('اكتمال الرصد'))) {
    recommendations.push('استكمال الرصد الناقص قبل اتخاذ قرارات مقارنة أو تصنيف نهائية.');
  }

  const trend = aggregateTrend(classes);
  const heatmap = buildHeatmap(classes, problemSkills);
  const executiveSummary = buildNarrative({
    classes,
    summary,
    problemSkills,
    remediation,
    alerts,
  });

  return {
    schoolName: school.name || '',
    principalName: school.principalName || '',
    teacherName: teacherName || assignments[0]?.teacherName || '',
    generatedDate: new Date().toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    summary,
    statusCounts,
    classes,
    trend,
    skills,
    problemSkills,
    strongestSkills,
    heatmap,
    remediation,
    alerts: alerts.slice(0, 8),
    priorities: priorities.slice(0, 3),
    recommendations: recommendations.slice(0, 5),
    executiveSummary,
  };
}
