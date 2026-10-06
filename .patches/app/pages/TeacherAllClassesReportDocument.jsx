import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Svg, Circle } from '@react-pdf/renderer';
import ReportLogo from '../components/ReportLogo.js';

Font.register({ family: 'Plex', src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf' });
Font.register({ family: 'Plex-Bold', src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf' });
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: '#14261e',
  primary: '#0b7a4b',
  primaryTint: '#eaf6ee',
  amber: '#8a5a00',
  amberTint: '#fdf3e2',
  red: '#a10000',
  redTint: '#fdecea',
  grey: '#8a8a8a',
  light: '#f4f5f4',
  border: '#dce1de',
};

const STATUS = [
  { key: 'mastered', label: 'متقنة', color: '#0b7a4b' },
  { key: 'needsSupport', label: 'تحتاج دعمًا', color: '#d99a00' },
  { key: 'notMastered', label: 'غير متقنة', color: '#c62828' },
  { key: 'absent', label: 'غائبة', color: '#999999' },
];

const styles = StyleSheet.create({
  page: { fontFamily: 'Plex', paddingTop: 82, paddingBottom: 38, paddingHorizontal: 24, fontSize: 8.2, color: C.ink },
  header: { position: 'absolute', top: 12, left: 24, right: 24 },
  logo: { position: 'absolute', top: 0, right: 0, width: 68, height: 31, objectFit: 'contain' },
  school: { fontFamily: 'Plex-Bold', fontSize: 12, textAlign: 'center' },
  title: { fontFamily: 'Plex-Bold', fontSize: 14, color: C.primary, textAlign: 'center', marginTop: 5 },
  meta: { fontSize: 7.7, color: '#555', textAlign: 'center', marginTop: 2 },

  section: { marginBottom: 11 },
  sectionTitle: { fontFamily: 'Plex-Bold', fontSize: 10.5, marginBottom: 6, color: C.ink, borderRightWidth: 3, borderRightColor: C.primary, paddingRight: 6 },
  note: { borderWidth: 1, borderColor: '#dfe9e3', backgroundColor: '#fbfdfc', borderRadius: 6, padding: 8, marginBottom: 9, lineHeight: 1.5, textAlign: 'right' },

  cards: { flexDirection: 'row-reverse', gap: 7, marginBottom: 10 },
  card: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 7, alignItems: 'center' },
  cardValue: { fontFamily: 'Plex-Bold', fontSize: 14, color: C.primary },
  cardLabel: { fontSize: 7.2, color: '#666', marginTop: 2, textAlign: 'center' },

  cols: { flexDirection: 'row-reverse', gap: 13, alignItems: 'flex-start' },
  col: { flex: 1 },
  donutWrap: { width: 145, alignItems: 'center' },
  donutCaption: { fontFamily: 'Plex-Bold', fontSize: 8.5, marginTop: 2 },
  legend: { flex: 1, paddingTop: 5 },
  legendRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  legendLeft: { flexDirection: 'row-reverse', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 5 },

  barRow: { marginBottom: 6 },
  barHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 2 },
  barLabel: { fontFamily: 'Plex-Bold', fontSize: 7.3 },
  barValue: { fontFamily: 'Plex-Bold', fontSize: 7.3, color: C.primary },
  barTrack: { height: 8, backgroundColor: '#ecefed', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: C.primary, borderRadius: 4 },

  table: { borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row-reverse', borderBottomWidth: 0.5, borderBottomColor: '#ddd', minHeight: 24, alignItems: 'center' },
  head: { backgroundColor: C.ink },
  cell: { paddingHorizontal: 4, paddingVertical: 4, textAlign: 'center', borderLeftWidth: 0.5, borderLeftColor: '#ddd' },
  headText: { color: '#fff', fontFamily: 'Plex-Bold', fontSize: 6.8 },
  classCell: { width: '18%', textAlign: 'right' },
  subjectCell: { width: '13%' },
  weekCell: { width: '15%' },
  pctCell: { width: '9%' },
  changeCell: { width: '9%' },
  analysisCell: { width: '27%', fontSize: 6.3, textAlign: 'right', lineHeight: 1.3 },

  trendRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 6 },
  trendLabel: { width: 105, textAlign: 'right', fontSize: 7.2 },
  trendTrack: { flex: 1, height: 11, flexDirection: 'row-reverse', borderRadius: 4, overflow: 'hidden', backgroundColor: '#eee' },
  trendSeg: { height: 11 },
  trendPct: { width: 38, textAlign: 'left', fontFamily: 'Plex-Bold', fontSize: 7.2 },

  heatHead: { flexDirection: 'row-reverse', backgroundColor: C.ink },
  heatClass: { width: '18%', padding: 5, fontFamily: 'Plex-Bold', fontSize: 6.9, textAlign: 'right' },
  heatSkillHead: { flex: 1, padding: 5, color: '#fff', fontFamily: 'Plex-Bold', fontSize: 6.1, textAlign: 'center' },
  heatRow: { flexDirection: 'row-reverse', borderBottomWidth: 0.5, borderBottomColor: C.border },
  heatCell: { flex: 1, padding: 5, textAlign: 'center', fontFamily: 'Plex-Bold', fontSize: 6.7 },

  listBox: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 7 },
  listTitle: { fontFamily: 'Plex-Bold', fontSize: 8.5, marginBottom: 5 },
  listItem: { fontSize: 7.2, lineHeight: 1.45, marginBottom: 3 },

  movement: { flexDirection: 'row-reverse', gap: 7, marginBottom: 9 },
  movementCard: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 7, alignItems: 'center' },
  movementValue: { fontFamily: 'Plex-Bold', fontSize: 13 },
  movementLabel: { fontSize: 7, color: '#666', textAlign: 'center', marginTop: 2 },

  impactRow: { flexDirection: 'row-reverse', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 5 },
  impactClass: { width: '25%', fontFamily: 'Plex-Bold', fontSize: 7.3, textAlign: 'right' },
  impactVal: { width: '18%', textAlign: 'center', fontSize: 7.2 },
  impactDelta: { width: '20%', textAlign: 'center', fontFamily: 'Plex-Bold', fontSize: 7.2 },

  priority: { borderWidth: 1, borderColor: C.primary, backgroundColor: C.primaryTint, borderRadius: 6, padding: 8, marginBottom: 8 },
  priorityItem: { fontFamily: 'Plex-Bold', fontSize: 7.8, lineHeight: 1.5, marginBottom: 4 },
  alert: { backgroundColor: C.redTint, borderWidth: 1, borderColor: '#e6bcbc', borderRadius: 6, padding: 7, marginBottom: 8 },

  footer: { position: 'absolute', bottom: 12, left: 24, right: 24, borderTopWidth: 0.5, borderTopColor: '#ccc', paddingTop: 5, flexDirection: 'row-reverse', fontSize: 7, color: '#444' },
  f1: { flex: 1, textAlign: 'right' }, f2: { flex: 1, textAlign: 'center' }, f3: { flex: 1, textAlign: 'left' },
});

function totalCounts(counts) {
  return STATUS.reduce((sum, item) => sum + Number(counts?.[item.key] || 0), 0);
}

function Donut({ counts }) {
  const total = totalCounts(counts);
  if (!total) return <Text style={styles.listItem}>لا توجد بيانات كافية للرسم.</Text>;
  const radius = 39;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View style={styles.donutWrap}>
      <Svg width="105" height="105" viewBox="0 0 105 105">
        {STATUS.map((item) => {
          const val = Number(counts?.[item.key] || 0);
          if (!val) return null;
          const dash = val / total * circumference;
          const node = <Circle key={item.key} cx="52.5" cy="52.5" r={radius} fill="none" stroke={item.color} strokeWidth="17" strokeDasharray={`${dash} ${circumference-dash}`} strokeDashoffset={-offset} transform="rotate(-90 52.5 52.5)" />;
          offset += dash;
          return node;
        })}
      </Svg>
      <Text style={styles.donutCaption}>إجمالي الحالات: {total}</Text>
    </View>
  );
}

function HeatCell({ value }) {
  let bg = '#f2f2f2'; let color = '#777';
  if (value !== null && value !== undefined) {
    if (value >= 80) { bg = C.primaryTint; color = C.primary; }
    else if (value >= 60) { bg = C.amberTint; color = C.amber; }
    else { bg = C.redTint; color = C.red; }
  }
  return <Text style={[styles.heatCell, { backgroundColor: bg, color }]}>{value === null || value === undefined ? '—' : `${value}%`}</Text>;
}

function Header({ data, subtitle }) {
  return <View style={styles.header} fixed>
    <ReportLogo style={styles.logo} />
    <Text style={styles.school}>{data.schoolName}</Text>
    <Text style={styles.title}>تحليل نتائج جميع الفصول</Text>
    <Text style={styles.meta}>المعلّمة: {data.teacherName} — الفترة: من {data.fromWeekName} إلى {data.toWeekName}</Text>
    <Text style={styles.meta}>{subtitle} — تاريخ التقرير: {data.generatedDate}</Text>
  </View>;
}

function Footer({ data }) {
  return <View style={styles.footer} fixed>
    <Text style={styles.f1}>مديرة المدرسة: {data.principalName || '—'}</Text>
    <Text style={styles.f2}>المعلّمة: {data.teacherName}</Text>
    <Text style={styles.f3} render={({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}`} />
  </View>;
}

export default function TeacherAllClassesReportDocument({ data }) {
  return <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Header data={data} subtitle="الملخص التنفيذي" />

      <View style={styles.note}>
        {(data.executiveSummary || []).map((line, i) => <Text key={i} style={{ marginBottom: 2 }}>{line}</Text>)}
      </View>

      <View style={styles.cards}>
        <View style={styles.card}><Text style={styles.cardValue}>{data.classesWithData}</Text><Text style={styles.cardLabel}>فصول لديها رصد</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.overallMasteryPercent}%</Text><Text style={styles.cardLabel}>الإتقان العام</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.overallCompletenessPercent}%</Text><Text style={styles.cardLabel}>اكتمال الرصد</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.bestClass?.latest?.masteryPercent ?? 0}%</Text><Text style={styles.cardLabel}>أعلى فصل: {data.bestClass?.className || '—'}</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.remediation?.averageImpact > 0 ? '+' : ''}{data.remediation?.averageImpact || 0}</Text><Text style={styles.cardLabel}>متوسط أثر المعالجة</Text></View>
      </View>

      <View style={styles.cols}>
        <View style={styles.col}>
          <Text style={styles.sectionTitle}>توزيع حالات الرصد الحالية</Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
            <Donut counts={data.overallStatusCounts} />
            <View style={styles.legend}>
              {STATUS.map((item) => <View key={item.key} style={styles.legendRow}>
                <View style={styles.legendLeft}><View style={[styles.dot, { backgroundColor: item.color }]} /><Text>{item.label}</Text></View>
                <Text style={{ fontFamily: 'Plex-Bold' }}>{data.overallStatusCounts?.[item.key] || 0}</Text>
              </View>)}
            </View>
          </View>
        </View>

        <View style={styles.col}>
          <Text style={styles.sectionTitle}>مقارنة الإتقان بين الفصول</Text>
          {(data.classes || []).filter((r) => r.latest).slice().sort((a,b)=>b.latest.masteryPercent-a.latest.masteryPercent).map((row) => <View key={row.assignmentId} style={styles.barRow}>
            <View style={styles.barHead}><Text style={styles.barLabel}>{row.className} — {row.subject}</Text><Text style={styles.barValue}>{row.latest.masteryPercent}%</Text></View>
            <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(1, row.latest.masteryPercent)}%` }]} /></View>
          </View>)}
        </View>
      </View>

      <Footer data={data} />
    </Page>

    <Page size="A4" orientation="landscape" style={styles.page}>
      <Header data={data} subtitle="الاتجاه والمقارنة التفصيلية" />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>الاتجاه عبر الأسابيع</Text>
        {(data.overallTrend || []).map((week) => {
          const total = totalCounts(week.counts);
          return <View key={week.weekName} style={styles.trendRow}>
            <Text style={styles.trendLabel}>{week.weekName}</Text>
            <View style={styles.trendTrack}>
              {STATUS.map((item) => {
                const val = Number(week.counts?.[item.key] || 0);
                const width = total ? val / total * 100 : 0;
                return <View key={item.key} style={[styles.trendSeg, { width: `${width}%`, backgroundColor: item.color }]} />;
              })}
            </View>
            <Text style={styles.trendPct}>{week.masteryPercent}%</Text>
          </View>;
        })}
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.head]} fixed>
          <Text style={[styles.cell, styles.classCell, styles.headText]}>الفصل</Text>
          <Text style={[styles.cell, styles.subjectCell, styles.headText]}>المادة</Text>
          <Text style={[styles.cell, styles.weekCell, styles.headText]}>آخر رصد</Text>
          <Text style={[styles.cell, styles.pctCell, styles.headText]}>الإتقان</Text>
          <Text style={[styles.cell, styles.pctCell, styles.headText]}>متابعة</Text>
          <Text style={[styles.cell, styles.pctCell, styles.headText]}>اكتمال</Text>
          <Text style={[styles.cell, styles.changeCell, styles.headText]}>التغير</Text>
          <Text style={[styles.cell, styles.analysisCell, styles.headText]}>الخلاصة</Text>
        </View>
        {(data.classes || []).map((row, i) => <View key={row.assignmentId || i} style={styles.row} wrap={false}>
          <Text style={[styles.cell, styles.classCell]}>{row.className}</Text>
          <Text style={[styles.cell, styles.subjectCell]}>{row.subject}</Text>
          <Text style={[styles.cell, styles.weekCell]}>{row.latest ? `${row.latest.weekName} — ${row.latest.weekTypeLabel}` : 'لا يوجد رصد'}</Text>
          <Text style={[styles.cell, styles.pctCell]}>{row.latest ? `${row.latest.masteryPercent}%` : '—'}</Text>
          <Text style={[styles.cell, styles.pctCell]}>{row.latest ? `${row.latest.attentionPercent}%` : '—'}</Text>
          <Text style={[styles.cell, styles.pctCell]}>{row.latest ? `${row.completenessPercent}%` : '—'}</Text>
          <Text style={[styles.cell, styles.changeCell]}>{row.latest ? `${row.masteryChange > 0 ? '+' : ''}${row.masteryChange}` : '—'}</Text>
          <Text style={[styles.cell, styles.analysisCell]}>{row.analysis}</Text>
        </View>)}
      </View>

      <Footer data={data} />
    </Page>

    <Page size="A4" orientation="landscape" style={styles.page}>
      <Header data={data} subtitle="الخريطة الحرارية وتحليل المهارات" />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>الفصول × المهارات الأكثر احتياجًا للدعم</Text>
        {(data.problemSkills || []).length === 0 ? <Text style={styles.listItem}>لا توجد بيانات مهارات كافية.</Text> : <>
          <View style={styles.heatHead}>
            <Text style={[styles.heatClass, { color: '#fff' }]}>الفصل</Text>
            {data.problemSkills.map((skill) => <Text key={skill.key} style={styles.heatSkillHead}>{skill.title}</Text>)}
          </View>
          {(data.heatmap || []).map((row, i) => <View key={i} style={styles.heatRow}>
            <Text style={styles.heatClass}>{row.className}</Text>
            {row.cells.map((cell) => <HeatCell key={cell.key} value={cell.masteryPercent} />)}
          </View>)}
        </>}
      </View>

      <View style={styles.cols}>
        <View style={styles.listBox}>
          <Text style={styles.listTitle}>المهارات الأكثر احتياجًا للمعالجة</Text>
          {(data.problemSkills || []).slice(0,5).map((skill, i) => <Text key={skill.key} style={styles.listItem}>{i+1}. {skill.title} — إتقان {skill.masteryPercent}% — في {skill.classesCount} فصل/فصول</Text>)}
        </View>
        <View style={styles.listBox}>
          <Text style={styles.listTitle}>المهارات الأعلى إتقانًا</Text>
          {(data.strongestSkills || []).slice(0,5).map((skill, i) => <Text key={skill.key} style={styles.listItem}>{i+1}. {skill.title} — إتقان {skill.masteryPercent}%</Text>)}
        </View>
        <View style={styles.listBox}>
          <Text style={styles.listTitle}>أفضل تقدم</Text>
          {data.bestProgressClass ? <>
            <Text style={{ fontFamily: 'Plex-Bold', fontSize: 17, color: C.primary }}>{data.bestProgressClass.masteryChange > 0 ? '+' : ''}{data.bestProgressClass.masteryChange} نقطة</Text>
            <Text style={styles.listItem}>{data.bestProgressClass.className} — من أول إلى آخر رصد داخل الفترة.</Text>
          </> : <Text style={styles.listItem}>لا توجد بيانات كافية.</Text>}
        </View>
      </View>

      <Footer data={data} />
    </Page>

    <Page size="A4" orientation="landscape" style={styles.page}>
      <Header data={data} subtitle="أثر المعالجة والأولويات" />

      <Text style={styles.sectionTitle}>حركة الطالبات بعد المعالجة</Text>
      <View style={styles.movement}>
        <View style={styles.movementCard}><Text style={[styles.movementValue,{color:C.primary}]}>{data.remediation?.movement?.improved || 0}</Text><Text style={styles.movementLabel}>تحسن مستوى الحالة</Text></View>
        <View style={styles.movementCard}><Text style={[styles.movementValue,{color:C.primary}]}>{data.remediation?.movement?.toMastered || 0}</Text><Text style={styles.movementLabel}>انتقلن إلى الإتقان</Text></View>
        <View style={styles.movementCard}><Text style={[styles.movementValue,{color:C.amber}]}>{data.remediation?.movement?.stable || 0}</Text><Text style={styles.movementLabel}>استقرار</Text></View>
        <View style={styles.movementCard}><Text style={[styles.movementValue,{color:C.red}]}>{data.remediation?.movement?.declined || 0}</Text><Text style={styles.movementLabel}>تراجع</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>مقارنة القياس بالمعالجة</Text>
        {(data.remediation?.rows || []).length === 0 ? <Text style={styles.listItem}>لا توجد أزواج قياس/معالجة مترابطة كافية داخل الفترة.</Text> : (data.remediation.rows || []).map((row,i)=><View key={i} style={styles.impactRow}>
          <Text style={styles.impactClass}>{row.className}</Text>
          <Text style={styles.impactVal}>{row.beforePercent}% قبل</Text>
          <Text style={styles.impactVal}>{row.afterPercent}% بعد</Text>
          <Text style={[styles.impactDelta,{color:row.impact>0?C.primary:row.impact<0?C.red:C.amber}]}>{row.impact>0?'+':''}{row.impact} نقطة</Text>
          <Text style={styles.impactVal}>{row.matchedSkills} مهارة</Text>
        </View>)}
      </View>

      <View style={styles.cols}>
        <View style={styles.col}>
          <View style={styles.priority}>
            <Text style={styles.listTitle}>ما الذي يحتاج تدخلاً الآن؟</Text>
            {(data.priorities || []).map((item,i)=><Text key={i} style={styles.priorityItem}>{i+1}. {item}</Text>)}
          </View>
        </View>
        <View style={styles.col}>
          {(data.alerts || []).length > 0 && <View style={styles.alert}>
            <Text style={[styles.listTitle,{color:C.red}]}>تنبيهات مبكرة</Text>
            {data.alerts.map((item,i)=><Text key={i} style={styles.listItem}>• {item}</Text>)}
          </View>}
        </View>
      </View>

      <Footer data={data} />
    </Page>
  </Document>;
}
