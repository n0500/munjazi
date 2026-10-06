import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Svg,
  Circle,
} from '@react-pdf/renderer';

Font.register({
  family: 'Plex',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf',
});
Font.register({
  family: 'Plex-Bold',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf',
});

const COLORS = {
  ink: '#14261e',
  primary: '#0b7a4b',
  primaryTint: '#eaf6ee',
  amber: '#8a5a00',
  amberTint: '#fdf3e2',
  red: '#a10000',
  redTint: '#fdecea',
  muted: '#6f6f6f',
  light: '#f7f7f7',
  border: '#dedede',
};

const STATUS = [
  { key: 'mastered', label: 'متقنة', color: '#0b7a4b' },
  { key: 'needsSupport', label: 'تحتاج دعمًا', color: '#d39a23' },
  { key: 'notMastered', label: 'غير متقنة', color: '#c62828' },
  { key: 'absent', label: 'غائبة', color: '#9e9e9e' },
];

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Plex',
    paddingTop: 52,
    paddingBottom: 42,
    paddingHorizontal: 30,
    fontSize: 9,
    color: COLORS.ink,
  },
  pageLandscape: {
    fontFamily: 'Plex',
    paddingTop: 48,
    paddingBottom: 38,
    paddingHorizontal: 24,
    fontSize: 8,
    color: COLORS.ink,
  },
  header: {
    position: 'absolute',
    top: 16,
    left: 30,
    right: 30,
    textAlign: 'center',
  },
  headerLandscape: {
    position: 'absolute',
    top: 14,
    left: 24,
    right: 24,
    textAlign: 'center',
  },
  school: { fontFamily: 'Plex-Bold', fontSize: 11, color: COLORS.ink },
  title: { fontFamily: 'Plex-Bold', fontSize: 15, color: COLORS.primary, marginTop: 4 },
  meta: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontFamily: 'Plex-Bold',
    fontSize: 11,
    color: COLORS.ink,
    marginBottom: 7,
    borderRightWidth: 3,
    borderRightColor: COLORS.primary,
    paddingRight: 6,
  },
  metricsRow: { flexDirection: 'row-reverse', gap: 7, marginBottom: 9 },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  metricValue: { fontFamily: 'Plex-Bold', fontSize: 14, color: COLORS.primary },
  metricLabel: { fontSize: 7.5, color: COLORS.muted, marginTop: 2 },
  executiveBox: {
    backgroundColor: COLORS.primaryTint,
    borderRightWidth: 3,
    borderRightColor: COLORS.primary,
    borderRadius: 6,
    padding: 9,
    marginBottom: 11,
  },
  executiveLine: { fontSize: 8.5, lineHeight: 1.6, marginBottom: 2 },
  chartRow: { flexDirection: 'row-reverse', gap: 14, alignItems: 'center' },
  donutWrap: { width: 145, alignItems: 'center' },
  donutTotal: { fontFamily: 'Plex-Bold', fontSize: 10, marginTop: 3 },
  legend: { flex: 1 },
  legendRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 5 },
  legendText: { fontSize: 8 },
  barRow: { marginBottom: 7 },
  barHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 3 },
  barName: { fontFamily: 'Plex-Bold', fontSize: 8 },
  barPct: { fontFamily: 'Plex-Bold', fontSize: 8, color: COLORS.primary },
  barTrack: { height: 9, backgroundColor: '#eeeeee', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 9, backgroundColor: COLORS.primary, borderRadius: 4 },
  smallNote: { fontSize: 7, color: COLORS.muted, marginTop: 4 },
  trendRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 6 },
  trendLabel: { width: 105, fontSize: 7.5, textAlign: 'right' },
  stackedTrack: {
    flex: 1,
    height: 11,
    flexDirection: 'row-reverse',
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stackedSeg: { height: 11 },
  trendPct: { width: 34, fontFamily: 'Plex-Bold', fontSize: 7.5, textAlign: 'left' },
  movementRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 9 },
  movementCard: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlign: 'center',
  },
  movementValue: { fontFamily: 'Plex-Bold', fontSize: 13 },
  movementLabel: { fontSize: 7, color: COLORS.muted, marginTop: 2 },
  remediationRow: {
    flexDirection: 'row-reverse',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingVertical: 5,
  },
  remediationClass: { width: '28%', fontFamily: 'Plex-Bold', fontSize: 7.5 },
  remediationValue: { width: '18%', textAlign: 'center', fontSize: 7.5 },
  remediationImpact: { width: '18%', textAlign: 'center', fontFamily: 'Plex-Bold', fontSize: 7.5 },
  heatmapHeader: { flexDirection: 'row-reverse', backgroundColor: COLORS.ink },
  heatmapHeaderClass: { width: '18%', color: '#fff', padding: 5, fontFamily: 'Plex-Bold', fontSize: 7 },
  heatmapHeaderSkill: { flex: 1, color: '#fff', padding: 5, fontFamily: 'Plex-Bold', fontSize: 6.5, textAlign: 'center' },
  heatmapRow: { flexDirection: 'row-reverse', borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  heatmapClass: { width: '18%', padding: 5, fontFamily: 'Plex-Bold', fontSize: 7 },
  heatmapCell: { flex: 1, padding: 5, textAlign: 'center', fontFamily: 'Plex-Bold', fontSize: 7 },
  twoCol: { flexDirection: 'row-reverse', gap: 10 },
  listBox: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, padding: 8 },
  listTitle: { fontFamily: 'Plex-Bold', fontSize: 9, marginBottom: 6 },
  listItem: { fontSize: 7.5, marginBottom: 4, lineHeight: 1.5 },
  priorityBox: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
    borderRadius: 6,
    padding: 9,
    marginBottom: 10,
  },
  priorityItem: { fontFamily: 'Plex-Bold', fontSize: 8.5, marginBottom: 5, lineHeight: 1.5 },
  alertBox: {
    borderWidth: 1,
    borderColor: '#e3b9b9',
    backgroundColor: COLORS.redTint,
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 30,
    right: 30,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    paddingTop: 5,
    flexDirection: 'row-reverse',
    color: COLORS.muted,
    fontSize: 7,
  },
  footerRight: { flex: 1, textAlign: 'right' },
  footerCenter: { flex: 1, textAlign: 'center' },
  footerLeft: { flex: 1, textAlign: 'left' },
});

function sumCounts(counts) {
  return STATUS.reduce((sum, item) => sum + (counts?.[item.key] || 0), 0);
}

function DonutChart({ counts }) {
  const total = sumCounts(counts);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (!total) return <Text style={styles.smallNote}>لا توجد بيانات كافية للرسم.</Text>;

  return (
    <View style={styles.donutWrap}>
      <Svg width="110" height="110" viewBox="0 0 110 110">
        {STATUS.map((item) => {
          const value = counts?.[item.key] || 0;
          if (!value) return null;
          const dash = (value / total) * circumference;
          const circle = (
            <Circle
              key={item.key}
              cx="55"
              cy="55"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="17"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
            />
          );
          offset += dash;
          return circle;
        })}
      </Svg>
      <Text style={styles.donutTotal}>إجمالي الرصد: {total}</Text>
    </View>
  );
}

function HeatCell({ value }) {
  let bg = '#f1f1f1';
  let color = '#777';
  if (value !== null && value !== undefined) {
    if (value >= 80) {
      bg = COLORS.primaryTint;
      color = COLORS.primary;
    } else if (value >= 60) {
      bg = COLORS.amberTint;
      color = COLORS.amber;
    } else {
      bg = COLORS.redTint;
      color = COLORS.red;
    }
  }
  return (
    <Text style={[styles.heatmapCell, { backgroundColor: bg, color }]}>
      {value === null || value === undefined ? '—' : `${value}%`}
    </Text>
  );
}

function FixedHeader({ data, landscape = false, subtitle = '' }) {
  return (
    <View style={landscape ? styles.headerLandscape : styles.header} fixed>
      <Text style={styles.school}>{data.schoolName}</Text>
      <Text style={styles.title}>تحليل نتائج جميع الفصول</Text>
      <Text style={styles.meta}>
        المعلّمة: {data.teacherName || '—'} {subtitle ? `— ${subtitle}` : ''} — {data.generatedDate}
      </Text>
    </View>
  );
}

function FixedFooter({ data, landscape = false }) {
  const base = landscape ? { left: 24, right: 24 } : {};
  return (
    <View style={[styles.footer, base]} fixed>
      <Text style={styles.footerRight}>مديرة المدرسة: {data.principalName || '—'}</Text>
      <Text style={styles.footerCenter}>منجزي — تحليل نتائج الفصول</Text>
      <Text
        style={styles.footerLeft}
        render={({ pageNumber, totalPages }) => `صفحة ${pageNumber} من ${totalPages}`}
      />
    </View>
  );
}

export default function AllClassesAnalysisDocument({ data }) {
  const trendRows = data.trend || [];
  const problemSkills = data.problemSkills || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <FixedHeader data={data} subtitle="الملخص التنفيذي" />

        <View style={styles.executiveBox}>
          {(data.executiveSummary || []).map((line, index) => (
            <Text key={index} style={styles.executiveLine}>{line}</Text>
          ))}
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.masteryPercent}%</Text>
            <Text style={styles.metricLabel}>الإتقان العام</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.completenessPercent}%</Text>
            <Text style={styles.metricLabel}>اكتمال الرصد</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.classesCount}</Text>
            <Text style={styles.metricLabel}>الفصول</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.studentsCount}</Text>
            <Text style={styles.metricLabel}>الطالبات</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.uniqueSkillsCount}</Text>
            <Text style={styles.metricLabel}>مهارات محللة</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {data.summary.remediationImpact > 0 ? '+' : ''}{data.summary.remediationImpact}
            </Text>
            <Text style={styles.metricLabel}>متوسط أثر المعالجة</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.bestClass?.latestMastery ?? 0}%</Text>
            <Text style={styles.metricLabel}>أعلى فصل: {data.summary.bestClass?.className || '—'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.summary.supportClass?.latestMastery ?? 0}%</Text>
            <Text style={styles.metricLabel}>الأكثر احتياجًا: {data.summary.supportClass?.className || '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>توزيع حالات الرصد الحالية</Text>
          <View style={styles.chartRow}>
            <DonutChart counts={data.statusCounts} />
            <View style={styles.legend}>
              {STATUS.map((item) => (
                <View key={item.key} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>
                    {item.label}: {data.statusCounts?.[item.key] || 0}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>مقارنة الإتقان بين الفصول</Text>
          {(data.classes || []).map((row) => (
            <View key={row.assignmentId} style={styles.barRow}>
              <View style={styles.barHead}>
                <Text style={styles.barName}>{row.className} — {row.subject}</Text>
                <Text style={styles.barPct}>{row.latestMastery}%</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(2, row.latestMastery)}%` }]} />
              </View>
            </View>
          ))}
          <Text style={styles.smallNote}>المقارنة مبنية على آخر رصد متاح لكل فصل.</Text>
        </View>

        <FixedFooter data={data} />
      </Page>

      <Page size="A4" style={styles.page}>
        <FixedHeader data={data} subtitle="الاتجاه عبر الأسابيع" />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>تطور الأداء عبر الأسابيع</Text>
          {trendRows.length === 0 ? (
            <Text style={styles.smallNote}>لا توجد بيانات اتجاه زمني بعد.</Text>
          ) : (
            trendRows.map((row) => {
              const total = sumCounts(row.counts);
              return (
                <View key={row.weekName} style={styles.trendRow}>
                  <Text style={styles.trendLabel}>{row.weekName}</Text>
                  <View style={styles.stackedTrack}>
                    {STATUS.map((item) => {
                      const value = row.counts?.[item.key] || 0;
                      const width = total ? (value / total) * 100 : 0;
                      return (
                        <View
                          key={item.key}
                          style={[styles.stackedSeg, { width: `${width}%`, backgroundColor: item.color }]}
                        />
                      );
                    })}
                  </View>
                  <Text style={styles.trendPct}>{row.masteryPercent}%</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>اتجاه كل فصل</Text>
          {(data.classes || []).map((row) => {
            const directionLabel = row.direction === 'up' ? 'تحسن' : row.direction === 'down' ? 'تراجع' : 'مستقر';
            const directionColor = row.direction === 'up' ? COLORS.primary : row.direction === 'down' ? COLORS.red : COLORS.amber;
            return (
              <View key={row.assignmentId} style={styles.remediationRow}>
                <Text style={styles.remediationClass}>{row.className}</Text>
                <Text style={styles.remediationValue}>{row.latestWeekName}</Text>
                <Text style={styles.remediationValue}>الإتقان {row.latestMastery}%</Text>
                <Text style={[styles.remediationImpact, { color: directionColor }]}>{directionLabel}</Text>
                <Text style={styles.remediationValue}>الرصد {row.completenessPercent}%</Text>
              </View>
            );
          })}
        </View>

        <FixedFooter data={data} />
      </Page>

      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <FixedHeader data={data} landscape subtitle="الخريطة الحرارية للمهارات" />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الفصول × المهارات الأكثر احتياجًا للدعم</Text>
          {problemSkills.length === 0 ? (
            <Text style={styles.smallNote}>لا توجد بيانات مهارات كافية لبناء الخريطة الحرارية.</Text>
          ) : (
            <>
              <View style={styles.heatmapHeader}>
                <Text style={styles.heatmapHeaderClass}>الفصل</Text>
                {problemSkills.map((skill) => (
                  <Text key={skill.key} style={styles.heatmapHeaderSkill}>{skill.title}</Text>
                ))}
              </View>
              {(data.heatmap || []).map((row, index) => (
                <View key={index} style={styles.heatmapRow}>
                  <Text style={styles.heatmapClass}>{row.className}</Text>
                  {row.cells.map((cell) => (
                    <HeatCell key={cell.key} value={cell.masteryPercent} />
                  ))}
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.twoCol}>
          <View style={styles.listBox}>
            <Text style={styles.listTitle}>المهارات الأكثر احتياجًا للمعالجة</Text>
            {(data.problemSkills || []).slice(0, 5).map((skill, index) => (
              <Text key={skill.key} style={styles.listItem}>
                {index + 1}. {skill.title} — إتقان {skill.masteryPercent}% — ظهرت في {skill.classesCount} فصل/فصول
              </Text>
            ))}
          </View>
          <View style={styles.listBox}>
            <Text style={styles.listTitle}>المهارات الأعلى إتقانًا</Text>
            {(data.strongestSkills || []).slice(0, 5).map((skill, index) => (
              <Text key={skill.key} style={styles.listItem}>
                {index + 1}. {skill.title} — إتقان {skill.masteryPercent}%
              </Text>
            ))}
          </View>
        </View>

        <FixedFooter data={data} landscape />
      </Page>

      <Page size="A4" style={styles.page}>
        <FixedHeader data={data} subtitle="أثر المعالجة والأولويات" />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>حركة الطالبات بعد المعالجة</Text>
          <View style={styles.movementRow}>
            <View style={styles.movementCard}>
              <Text style={[styles.movementValue, { color: COLORS.primary }]}>{data.remediation.movement.improved}</Text>
              <Text style={styles.movementLabel}>تحسن مستوى الحالة</Text>
            </View>
            <View style={styles.movementCard}>
              <Text style={[styles.movementValue, { color: COLORS.primary }]}>{data.remediation.movement.toMastered}</Text>
              <Text style={styles.movementLabel}>انتقلن إلى الإتقان</Text>
            </View>
            <View style={styles.movementCard}>
              <Text style={[styles.movementValue, { color: COLORS.amber }]}>{data.remediation.movement.stable}</Text>
              <Text style={styles.movementLabel}>استقرار</Text>
            </View>
            <View style={styles.movementCard}>
              <Text style={[styles.movementValue, { color: COLORS.red }]}>{data.remediation.movement.declined}</Text>
              <Text style={styles.movementLabel}>تراجع</Text>
            </View>
          </View>

          {(data.remediation.rows || []).length > 0 && (
            <>
              <Text style={styles.listTitle}>مقارنة القياس بالمعالجة</Text>
              {(data.remediation.rows || []).map((row, index) => (
                <View key={index} style={styles.remediationRow}>
                  <Text style={styles.remediationClass}>{row.className}</Text>
                  <Text style={styles.remediationValue}>{row.beforePercent}% قبل</Text>
                  <Text style={styles.remediationValue}>{row.afterPercent}% بعد</Text>
                  <Text
                    style={[
                      styles.remediationImpact,
                      { color: row.impact > 0 ? COLORS.primary : row.impact < 0 ? COLORS.red : COLORS.amber },
                    ]}
                  >
                    {row.impact > 0 ? '+' : ''}{row.impact} نقطة
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.priorityBox}>
          <Text style={styles.sectionTitle}>ما الذي يحتاج تدخلاً الآن؟</Text>
          {(data.priorities || []).map((item, index) => (
            <Text key={index} style={styles.priorityItem}>{index + 1}. {item}</Text>
          ))}
        </View>

        {(data.alerts || []).length > 0 && (
          <View style={styles.alertBox}>
            <Text style={[styles.listTitle, { color: COLORS.red }]}>تنبيهات مبكرة</Text>
            {(data.alerts || []).map((item, index) => (
              <Text key={index} style={styles.listItem}>• {item}</Text>
            ))}
          </View>
        )}

        <View style={styles.listBox}>
          <Text style={styles.listTitle}>توصيات مبنية على البيانات</Text>
          {(data.recommendations || []).map((item, index) => (
            <Text key={index} style={styles.listItem}>{index + 1}. {item}</Text>
          ))}
        </View>

        <FixedFooter data={data} />
      </Page>
    </Document>
  );
}
