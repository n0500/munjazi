import { getSchool } from './schoolsApi.js';
import { listSkillsForWeek } from './skillsApi.js';
import { listAssessmentsForSkill } from './assessmentsApi.js';
import { listClassStudents } from './studentsApi.js';
import { normalizeWeekName, compareWeeksAsc } from './dataLogic.js';

const STATUS_KEYS = ['mastered', 'needsSupport', 'notMastered', 'absent'];
const RANK = { notMastered: 0, needsSupport: 1, mastered: 2 };

function counts0() {
  return { mastered: 0, needsSupport: 0, notMastered: 0, absent: 0 };
}
function addCounts(target, source) {
  STATUS_KEYS.forEach((key) => { target[key] += Number(source?.[key] || 0); });
  return target;
}
function assessedCount(counts) {
  return (counts.mastered || 0) + (counts.needsSupport || 0) + (counts.notMastered || 0);
}
function recordedCount(counts) {
  return assessedCount(counts) + (counts.absent || 0);
}
function pct(part, total) {
  return total > 0 ? Math.round((Number(part) || 0) / total * 100) : 0;
}
function masteryPct(counts) {
  return pct(counts.mastered || 0, assessedCount(counts));
}
function normalizeSkill(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function weekLabel(week) {
  if (!week) return '—';
  if (week.type !== 'remediation') return 'قياس';
  return `معالجة ${Math.max(1, Number(week.remediationStage) || 1)}`;
}
function selectedWeekNames(periodOptions, fromWeekName, toWeekName) {
  const options = periodOptions || [];
  const a = options.indexOf(normalizeWeekName(fromWeekName));
  const b = options.indexOf(normalizeWeekName(toWeekName));
  if (a < 0 || b < 0) return [];
  return options.slice(Math.min(a, b), Math.max(a, b) + 1);
}
function analysisText(row) {
  if (!row.latest) return 'لا يوجد رصد خلال الفترة المحددة.';
  if (row.completenessPercent < 80) return `اكتمال الرصد ${row.completenessPercent}%؛ يفضّل استكماله قبل اعتماد المقارنة.`;
  if (row.masteryChange >= 8) return `تحسن واضح بمقدار +${row.masteryChange} نقاط مئوية خلال الفترة.`;
  if (row.masteryChange <= -8) return `انخفاض بمقدار ${row.masteryChange} نقاط ويحتاج متابعة أسباب التراجع.`;
  if (row.latest.masteryPercent >= 80) return 'مستوى الإتقان مرتفع ومستقر نسبيًا.';
  if (row.latest.masteryPercent < 60) return 'مستوى الإتقان يحتاج تدخلًا ومتابعة قريبة.';
  return 'الأداء متوسط ويحتاج استمرار المتابعة والتركيز على المهارات الأقل إتقانًا.';
}

async function getWeekData(schoolId, week, students, caches) {
  let skills = caches.skills.get(week.id);
  if (!skills) {
    skills = await listSkillsForWeek(schoolId, week.id);
    caches.skills.set(week.id, skills);
  }

  const counts = counts0();
  const skillRows = [];
  const byStudentStatuses = {};

  for (const skill of skills) {
    let assessments = caches.assessments.get(skill.id);
    if (!assessments) {
      // eslint-disable-next-line no-await-in-loop
      assessments = await listAssessmentsForSkill(schoolId, skill.id);
      caches.assessments.set(skill.id, assessments);
    }

    const skillCounts = counts0();
    Object.entries(assessments || {}).forEach(([studentId, row]) => {
      const status = row?.status;
      if (!status || skillCounts[status] === undefined) return;
      skillCounts[status] += 1;
      counts[status] += 1;
      if (!byStudentStatuses[studentId]) byStudentStatuses[studentId] = [];
      byStudentStatuses[studentId].push(status);
    });

    skillRows.push({
      id: skill.id,
      title: skill.title || 'مهارة غير مسمّاة',
      normalizedTitle: normalizeSkill(skill.title),
      copySourceSkillId: skill.copySourceSkillId || null,
      originMeasurementWeekId: skill.originMeasurementWeekId || null,
      counts: skillCounts,
      masteryPercent: masteryPct(skillCounts),
      assessments,
    });
  }

  const expected = students.length * skills.length;
  const recorded = recordedCount(counts);
  return {
    weekId: week.id,
    weekName: week.name,
    weekType: week.type || 'measurement',
    weekTypeLabel: weekLabel(week),
    remediationStage: week.remediationStage || null,
    sourceMeasurementWeekId: week.sourceMeasurementWeekId || null,
    counts,
    masteryPercent: masteryPct(counts),
    attentionPercent: pct((counts.needsSupport || 0) + (counts.notMastered || 0), assessedCount(counts)),
    absencePercent: pct(counts.absent || 0, recorded),
    completenessPercent: pct(recorded, expected),
    skills: skillRows,
    expectedCells: expected,
    recordedCells: recorded,
  };
}

function buildClassSkillLatest(weekData) {
  const map = new Map();
  weekData.forEach((week) => {
    week.skills.forEach((skill) => {
      if (!skill.normalizedTitle) return;
      map.set(skill.normalizedTitle, {
        key: skill.normalizedTitle,
        title: skill.title,
        masteryPercent: skill.masteryPercent,
        counts: skill.counts,
        weekName: week.weekName,
      });
    });
  });
  return [...map.values()];
}

function aggregateTrend(classes) {
  const map = new Map();
  classes.forEach((row) => {
    row.trend.forEach((week, index) => {
      const key = normalizeWeekName(week.weekName) || `week-${index}`;
      if (!map.has(key)) map.set(key, { weekName: week.weekName, counts: counts0(), order: index });
      addCounts(map.get(key).counts, week.counts);
    });
  });
  return [...map.values()].map((row) => ({
    ...row,
    masteryPercent: masteryPct(row.counts),
  }));
}

function aggregateSkills(classes) {
  const map = new Map();
  classes.forEach((row) => {
    row.skillLatest.forEach((skill) => {
      if (!map.has(skill.key)) {
        map.set(skill.key, { key: skill.key, title: skill.title, counts: counts0(), classes: new Set() });
      }
      const target = map.get(skill.key);
      addCounts(target.counts, skill.counts);
      target.classes.add(row.classId);
    });
  });
  return [...map.values()].map((row) => ({
    key: row.key,
    title: row.title,
    masteryPercent: masteryPct(row.counts),
    classesCount: row.classes.size,
    totalAssessed: assessedCount(row.counts),
  }));
}

function buildHeatmap(classes, skills) {
  return classes.map((row) => {
    const map = new Map(row.skillLatest.map((s) => [s.key, s]));
    return {
      className: row.className,
      subject: row.subject,
      cells: skills.map((skill) => ({
        key: skill.key,
        title: skill.title,
        masteryPercent: map.has(skill.key) ? map.get(skill.key).masteryPercent : null,
      })),
    };
  });
}

function sourceSkillFor(remediationSkill, measurementSkills) {
  if (remediationSkill.copySourceSkillId) {
    const direct = measurementSkills.find((s) => s.id === remediationSkill.copySourceSkillId);
    if (direct) return direct;
  }
  return measurementSkills.find((s) => s.normalizedTitle === remediationSkill.normalizedTitle) || null;
}

function buildRemediationImpact(classRow) {
  const pairs = [];
  const movementByStudent = new Map();

  classRow.trend.forEach((remediation) => {
    if (remediation.weekType !== 'remediation' || !remediation.sourceMeasurementWeekId) return;
    const measurement = classRow.trend.find((w) => w.weekId === remediation.sourceMeasurementWeekId);
    if (!measurement) return;

    let beforeMastered = 0;
    let beforeAssessed = 0;
    let afterMastered = 0;
    let afterAssessed = 0;
    let matchedSkills = 0;

    remediation.skills.forEach((afterSkill) => {
      const beforeSkill = sourceSkillFor(afterSkill, measurement.skills);
      if (!beforeSkill) return;
      matchedSkills += 1;

      beforeMastered += beforeSkill.counts.mastered || 0;
      beforeAssessed += assessedCount(beforeSkill.counts);
      afterMastered += afterSkill.counts.mastered || 0;
      afterAssessed += assessedCount(afterSkill.counts);

      const ids = new Set([
        ...Object.keys(beforeSkill.assessments || {}),
        ...Object.keys(afterSkill.assessments || {}),
      ]);

      ids.forEach((studentId) => {
        const before = beforeSkill.assessments?.[studentId]?.status;
        const after = afterSkill.assessments?.[studentId]?.status;
        if (RANK[before] === undefined || RANK[after] === undefined) return;
        const key = `${classRow.classId}:${studentId}`;
        const item = movementByStudent.get(key) || { delta: 0, comparisons: 0, toMastered: false };
        item.delta += RANK[after] - RANK[before];
        item.comparisons += 1;
        if (after === 'mastered' && before !== 'mastered') item.toMastered = true;
        movementByStudent.set(key, item);
      });
    });

    if (!matchedSkills || !beforeAssessed || !afterAssessed) return;
    const beforePercent = pct(beforeMastered, beforeAssessed);
    const afterPercent = pct(afterMastered, afterAssessed);
    pairs.push({
      className: classRow.className,
      subject: classRow.subject,
      beforeWeekName: measurement.weekName,
      afterWeekName: remediation.weekName,
      beforePercent,
      afterPercent,
      impact: afterPercent - beforePercent,
      matchedSkills,
      stage: remediation.remediationStage || 1,
    });
  });

  const latestByClass = new Map();
  pairs.forEach((pair) => latestByClass.set(pair.className, pair));
  const latestPairs = [...latestByClass.values()];

  const movement = { improved: 0, stable: 0, declined: 0, toMastered: 0 };
  movementByStudent.forEach((item) => {
    if (item.delta > 0) movement.improved += 1;
    else if (item.delta < 0) movement.declined += 1;
    else movement.stable += 1;
    if (item.toMastered) movement.toMastered += 1;
  });

  const averageImpact = latestPairs.length
    ? Math.round(latestPairs.reduce((sum, row) => sum + row.impact, 0) / latestPairs.length)
    : 0;

  return { rows: latestPairs, movement, averageImpact, classesWithData: latestPairs.length };
}

export async function buildEnhancedAllClassesAnalysisData(schoolId, {
  assignments = [],
  classNameFor,
  teacherName = '',
  fromWeekName,
  toWeekName,
  periodContext,
}) {
  const school = await getSchool(schoolId);
  const selectedNames = selectedWeekNames(periodContext?.periodOptions || [], fromWeekName, toWeekName);
  const wanted = new Set(selectedNames.map(normalizeWeekName));
  const caches = { skills: new Map(), assessments: new Map(), students: new Map() };

  const classes = [];
  for (const assignment of assignments) {
    const weeks = (periodContext?.weekLists?.[assignment.id] || [])
      .filter((week) => wanted.has(normalizeWeekName(week.name)))
      .slice()
      .sort(compareWeeksAsc);

    let students = caches.students.get(assignment.classId);
    if (!students) {
      // eslint-disable-next-line no-await-in-loop
      students = await listClassStudents(schoolId, assignment.classId);
      caches.students.set(assignment.classId, students);
    }

    const trend = [];
    for (const week of weeks) {
      // eslint-disable-next-line no-await-in-loop
      trend.push(await getWeekData(schoolId, week, students, caches));
    }

    const latest = trend.length ? trend[trend.length - 1] : null;
    const first = trend.length ? trend[0] : null;
    const masteryChange = first && latest ? latest.masteryPercent - first.masteryPercent : 0;
    const row = {
      assignmentId: assignment.id,
      classId: assignment.classId,
      className: classNameFor(assignment.classId),
      subject: assignment.subject || 'غير محددة',
      teacherName: assignment.teacherName || teacherName,
      studentsCount: students.length,
      first,
      latest,
      masteryChange,
      completenessPercent: latest?.completenessPercent || 0,
      direction: masteryChange >= 5 ? 'up' : masteryChange <= -5 ? 'down' : 'stable',
      trend,
      skillLatest: buildClassSkillLatest(trend),
    };
    row.analysis = analysisText(row);
    classes.push(row);
  }

  const withData = classes.filter((row) => row.latest);
  const overallStatusCounts = counts0();
  let totalExpected = 0;
  let totalRecorded = 0;
  withData.forEach((row) => {
    addCounts(overallStatusCounts, row.latest.counts);
    totalExpected += row.latest.expectedCells || 0;
    totalRecorded += row.latest.recordedCells || 0;
  });

  const overallMasteryPercent = masteryPct(overallStatusCounts);
  const overallCompletenessPercent = pct(totalRecorded, totalExpected);
  const skills = aggregateSkills(classes)
    .filter((row) => row.totalAssessed > 0)
    .sort((a, b) => a.masteryPercent - b.masteryPercent);
  const problemSkills = skills.slice(0, 6);
  const strongestSkills = skills.slice().sort((a, b) => b.masteryPercent - a.masteryPercent).slice(0, 5);
  const heatmap = buildHeatmap(classes, problemSkills);
  const overallTrend = aggregateTrend(classes);
  const remediation = buildRemediationImpact({ trend: classes.flatMap((row) => row.trend) });
  // buildRemediationImpact needs class context; aggregate class-by-class instead.
  const remediationRows = [];
  const movement = { improved: 0, stable: 0, declined: 0, toMastered: 0 };
  classes.forEach((row) => {
    const r = buildRemediationImpact(row);
    remediationRows.push(...r.rows);
    Object.keys(movement).forEach((key) => { movement[key] += r.movement[key] || 0; });
  });
  const latestImpactRows = remediationRows;
  const averageImpact = latestImpactRows.length
    ? Math.round(latestImpactRows.reduce((sum, row) => sum + row.impact, 0) / latestImpactRows.length)
    : 0;

  const sortedByMastery = withData.slice().sort((a, b) => (b.latest?.masteryPercent || 0) - (a.latest?.masteryPercent || 0));
  const bestClass = sortedByMastery[0] || null;
  const supportClass = sortedByMastery[sortedByMastery.length - 1] || null;
  const bestProgressClass = withData.slice().sort((a, b) => b.masteryChange - a.masteryChange)[0] || null;

  const alerts = [];
  classes.forEach((row) => {
    if (row.latest && row.completenessPercent < 80) alerts.push(`اكتمال الرصد في ${row.className} هو ${row.completenessPercent}% فقط.`);
    if (row.masteryChange <= -5) alerts.push(`انخفض الإتقان في ${row.className} بمقدار ${Math.abs(row.masteryChange)} نقاط خلال الفترة.`);
  });
  problemSkills.slice(0, 3).forEach((skill) => {
    if (skill.masteryPercent < 70 && skill.classesCount >= 2) alerts.push(`مهارة «${skill.title}» منخفضة الإتقان (${skill.masteryPercent}%) في ${skill.classesCount} فصول.`);
  });
  latestImpactRows.forEach((row) => {
    if (row.impact <= 0) alerts.push(`لم يظهر أثر إيجابي بعد آخر معالجة في ${row.className}.`);
  });

  const priorities = [];
  if (problemSkills[0]) priorities.push(`إعادة تدريس مهارة «${problemSkills[0].title}» للفصول المتأثرة ثم إعادة القياس.`);
  if (supportClass && (supportClass.latest?.masteryPercent || 0) < 80) priorities.push(`إعطاء أولوية متابعة لفصل ${supportClass.className}؛ الإتقان الحالي ${supportClass.latest.masteryPercent}%.`);
  if (overallCompletenessPercent < 90) priorities.push(`رفع اكتمال الرصد من ${overallCompletenessPercent}% قبل اعتماد المقارنات النهائية.`);
  else if (latestImpactRows.length && averageImpact < 5) priorities.push('مراجعة التدخلات العلاجية ذات الأثر المحدود قبل القياس القادم.');
  while (priorities.length < 3 && classes.length) {
    priorities.push(priorities.length === 1
      ? 'متابعة اتجاه الإتقان أسبوعيًا والتركيز على أي فصل يظهر فيه تراجع متكرر.'
      : 'ربط كل معالجة بقياس لاحق لتوثيق الأثر بصورة واضحة.');
  }

  const executiveSummary = [];
  executiveSummary.push(`بلغ الإتقان العام ${overallMasteryPercent}% عبر ${withData.length} فصل/فصول لديها رصد، مع اكتمال بيانات قدره ${overallCompletenessPercent}%.`);
  if (bestClass) executiveSummary.push(`حقق ${bestClass.className} أعلى إتقان حالي (${bestClass.latest.masteryPercent}%)، بينما يحتاج ${supportClass?.className || 'أحد الفصول'} إلى متابعة أكبر.`);
  if (problemSkills[0]) executiveSummary.push(`أكثر المهارات احتياجًا للدعم هي «${problemSkills[0].title}» بنسبة إتقان ${problemSkills[0].masteryPercent}%.`);
  if (latestImpactRows.length) executiveSummary.push(`متوسط أثر آخر المعالجات المتاحة هو ${averageImpact > 0 ? '+' : ''}${averageImpact} نقطة مئوية.`);

  return {
    schoolName: school.name || '',
    principalName: school.principalName || '',
    teacherName: teacherName || '—',
    fromWeekName: selectedNames[0] || fromWeekName,
    toWeekName: selectedNames[selectedNames.length - 1] || toWeekName,
    generatedDate: new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }),
    classes,
    classesWithData: withData.length,
    overallMasteryPercent,
    overallCompletenessPercent,
    overallStatusCounts,
    overallTrend,
    problemSkills,
    strongestSkills,
    heatmap,
    remediation: { rows: latestImpactRows, movement, averageImpact, classesWithData: latestImpactRows.length },
    bestClass,
    supportClass,
    bestProgressClass,
    alerts: alerts.slice(0, 8),
    priorities: priorities.slice(0, 3),
    executiveSummary,
  };
}
