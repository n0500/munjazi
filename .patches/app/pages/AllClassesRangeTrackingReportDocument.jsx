import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Link } from '@react-pdf/renderer';
import ReportLogo from '../components/ReportLogo.js';

Font.register({ family: 'Plex', src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf' });
Font.register({ family: 'Plex-Bold', src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf' });
Font.registerHyphenationCallback((word) => [word]);

const STATUS_STYLE = {
  mastered: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
  needsSupport: { bg: '#fff7e0', text: '#8a6d00', border: '#d9b400' },
  notMastered: { bg: '#fdecea', text: '#a10000', border: '#c62828' },
  absent: { bg: '#f2f2f2', text: '#666', border: '#ccc' },
};

const STATUS_KEYS = [
  { key: 'mastered', label: 'متقنة' },
  { key: 'needsSupport', label: 'تحتاج دعمًا' },
  { key: 'notMastered', label: 'غير متقنة' },
  { key: 'absent', label: 'غائبة' },
];

const TYPE_LABELS_AR = { measurement: 'قياس', remediation: 'معالجة' };

const styles = StyleSheet.create({
  page: { fontFamily: 'Plex', paddingTop: 176, paddingBottom: 42, paddingHorizontal: 24, fontSize: 8.4, color: '#14261e' },
  header: { position: 'absolute', top: 13, left: 24, right: 24 },
  logo: { position: 'absolute', top: 0, right: 0, width: 68, height: 31, objectFit: 'contain' },
  batch: { fontFamily: 'Plex-Bold', fontSize: 7.3, color: '#666', textAlign: 'center', marginBottom: 2 },
  school: { fontFamily: 'Plex-Bold', fontSize: 12.5, textAlign: 'center' },
  title: { fontFamily: 'Plex-Bold', fontSize: 13.5, color: '#0b7a4b', textAlign: 'center', marginTop: 6 },
  meta: { fontSize: 7.8, color: '#555', textAlign: 'center', marginTop: 2 },
  link: { color: '#0b7a4b', textDecoration: 'underline' },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 6, marginBottom: 7, fontSize: 7.4 },

  headRow: { flexDirection: 'row-reverse', backgroundColor: '#14261e', borderWidth: 1, borderColor: '#14261e', paddingVertical: 5 },
  headWrap: { borderLeftWidth: 0.6, borderLeftColor: '#3a4a42', paddingHorizontal: 3 },
  headText: { color: '#fff', fontFamily: 'Plex-Bold', fontSize: 8, textAlign: 'center' },
  source: { color: '#bdc7c2', fontSize: 5.9, textAlign: 'center', marginTop: 1 },

  row: { flexDirection: 'row-reverse', minHeight: 20, alignItems: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 0.6, borderColor: '#e0e0e0' },
  even: { backgroundColor: '#fafafa' },
  cell: { paddingHorizontal: 4, paddingVertical: 3, borderLeftWidth: 0.6, borderLeftColor: '#d0d0d0', textAlign: 'right' },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, alignSelf: 'center', minWidth: 42, alignItems: 'center' },
  badgeText: { fontFamily: 'Plex-Bold', fontSize: 8 },

  empty: { padding: 14, textAlign: 'center', color: '#777', borderWidth: 1, borderColor: '#ddd', borderRadius: 5 },
  footer: { position: 'absolute', bottom: 13, left: 24, right: 24, flexDirection: 'row-reverse', fontSize: 7.2, color: '#444', borderTopWidth: 0.5, borderTopColor: '#ccc', paddingTop: 5 },
  f1: { flex: 1, textAlign: 'right' }, f2: { flex: 1, textAlign: 'center' }, f3: { flex: 1, textAlign: 'left' },
});

function StatusBadge({ status, statusLabel }) {
  const s = STATUS_STYLE[status] || { bg: '#f2f2f2', text: '#666', border: '#ccc' };
  return <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
    <Text style={[styles.badgeText, { color: s.text }]}>{statusLabel || '—'}</Text>
  </View>;
}

function widths(skillCount) {
  const nameW = 16;
  const recW = 22;
  const actionW = 20;
  const remaining = 100 - nameW - recW - actionW;
  return { nameW, recW, actionW, skillW: remaining / Math.max(skillCount, 1) };
}

function WeekPage({ report, week, pageIndex, totalPages }) {
  const { nameW, recW, actionW, skillW } = widths(week.skillTitles?.length || 0);
  const sources = week.skillSources || [];

  return <Page size="A4" orientation="landscape" style={styles.page}>
    <View style={styles.header} fixed>
      <ReportLogo style={styles.logo} />
      <Text style={styles.batch}>تقرير رصد جميع الفصول — مدى أسابيع — {pageIndex} من {totalPages}</Text>
      <Text style={styles.school}>{report.schoolName}</Text>
      <Text style={styles.title}>{week.typeLabel || 'رصد'} — {report.className}</Text>
      <Text style={styles.meta}>المعلّمة: {report.teacherName || '—'} — المادة: {report.subject || 'غير محددة'}</Text>
      <Text style={styles.meta}>الفترة: من {report.fromWeekName || '—'} إلى {report.toWeekName || '—'} — الأسبوع الحالي في التقرير: {week.name}</Text>
      {week.enrichmentLink ? <Text style={styles.meta}>الرابط الإثرائي: <Link src={week.enrichmentLink} style={styles.link}>{week.enrichmentLink}</Link></Text> : null}

      <View style={styles.stats}>
        {STATUS_KEYS.map((item) => <Text key={item.key}>{item.label}: {report.classCounts?.[item.key] || 0}</Text>)}
      </View>

      <View style={styles.headRow}>
        <View style={[styles.headWrap, { width: `${nameW}%` }]}><Text style={styles.headText}>الطالبة</Text></View>
        {(week.skillTitles || []).map((title, i) => <View key={i} style={[styles.headWrap, { width: `${skillW}%` }]}>
          <Text style={styles.headText}>{title}</Text>
          {sources[i] ? <Text style={styles.source}>({sources[i].name} — {TYPE_LABELS_AR[sources[i].type] || sources[i].type})</Text> : null}
        </View>)}
        <View style={[styles.headWrap, { width: `${recW}%` }]}><Text style={styles.headText}>التوصية</Text></View>
        <View style={[styles.headWrap, { width: `${actionW}%` }]}><Text style={styles.headText}>الإجراء</Text></View>
      </View>
    </View>

    {(week.rows || []).length === 0 ? <Text style={styles.empty}>لا توجد طالبات أو بيانات رصد لهذا الأسبوع.</Text> : (week.rows || []).map((row, i) => <View key={i} style={[styles.row, i % 2 === 1 && styles.even]} wrap={false}>
      <Text style={[styles.cell, { width: `${nameW}%` }]}>{row.name}</Text>
      {(row.cells || []).map((cell, j) => <View key={j} style={[styles.cell, { width: `${skillW}%`, paddingVertical: 4 }]}>
        <StatusBadge status={cell.status} statusLabel={cell.statusLabel} />
      </View>)}
      <Text style={[styles.cell, { width: `${recW}%`, fontSize: 7.3 }]}>{row.recommendation || ''}</Text>
      <View style={[styles.cell, { width: `${actionW}%` }]}>
        {(row.activeActions || []).map((a, k) => <Text key={k} style={{ fontSize: 6.5, color: a.type === 'remedial' ? '#8a5a00' : '#0b5c33' }}>
          {a.type === 'remedial' ? '⚠' : '⭐'} {(a.affectedSkillTitles || []).join('، ')}: {a.text}
        </Text>)}
      </View>
    </View>)}

    <View style={styles.footer} fixed>
      <Text style={styles.f1}>مديرة المدرسة: {report.principalName || '—'}</Text>
      <Text style={styles.f2}>المعلّمة: {report.teacherName || '—'}</Text>
      <Text style={styles.f3} render={({ pageNumber, totalPages: docPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${docPages}`} />
    </View>
  </Page>;
}

export default function AllClassesRangeTrackingReportDocument({ reports }) {
  const pages = [];
  (reports || []).forEach((report) => {
    (report.weeks || []).forEach((week) => pages.push({ report, week }));
  });

  return <Document>
    {pages.map((item, index) => <WeekPage
      key={`${item.report.className}-${item.week.id || item.week.name}-${index}`}
      report={item.report}
      week={item.week}
      pageIndex={index + 1}
      totalPages={pages.length}
    />)}
  </Document>;
}
