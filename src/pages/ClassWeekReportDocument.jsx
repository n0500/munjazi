import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Amiri',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf',
});
Font.register({
  family: 'Amiri-Bold',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Bold.ttf',
});

const STATUS_STYLE = {
  mastered: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
  needsSupport: { bg: '#fff7e0', text: '#8a6d00', border: '#d9b400' },
  notMastered: { bg: '#fdecea', text: '#a10000', border: '#c62828' },
  absent: { bg: '#f2f2f2', text: '#666', border: '#ccc' },
};

const COL_BORDER = '#cfcfcf';
const ROW_BORDER = '#e0e0e0';

const styles = StyleSheet.create({
  page: { fontFamily: 'Amiri', paddingTop: 105, paddingBottom: 40, paddingHorizontal: 24, fontSize: 9 },

  pageHeader: {
    position: 'absolute', top: 14, left: 24, right: 24,
    textAlign: 'center',
  },
  schoolName: { fontFamily: 'Amiri-Bold', fontSize: 15, color: '#14261e', lineHeight: 1.3 },
  headerLine: { fontSize: 9, color: '#555', marginTop: 4, lineHeight: 1.3 },

  // رأس الجدول: خلفية خضراء فاتحة + إطار كامل، متسق مع هوية الموقع
  columnHeaderRow: {
    position: 'absolute', top: 82, left: 24, right: 24,
    flexDirection: 'row-reverse',
    backgroundColor: '#eaf6ee',
    borderWidth: 1, borderColor: '#0b7a4b',
    paddingVertical: 5,
  },
  headerCell: {
    fontFamily: 'Amiri-Bold', fontSize: 9, textAlign: 'center', color: '#0b5c33',
    borderLeftWidth: 0.75, borderLeftColor: '#7fbfa0', paddingHorizontal: 3,
  },
  headerCellFirst: { textAlign: 'right', paddingRight: 6 },

  row: {
    flexDirection: 'row-reverse', minHeight: 20, alignItems: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 0.75,
    borderColor: ROW_BORDER,
  },
  rowEven: { backgroundColor: '#fafafa' },
  cell: {
    fontSize: 9, textAlign: 'right', paddingHorizontal: 4, paddingVertical: 3,
    borderLeftWidth: 0.75, borderLeftColor: COL_BORDER,
  },

  reportTitle: { fontFamily: 'Amiri-Bold', fontSize: 14, color: '#0b7a4b', textAlign: 'center', marginBottom: 4 },
  metaLine: { fontSize: 8, color: '#666', textAlign: 'center', marginBottom: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10, fontSize: 8 },

  badge: {
    paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 4, borderWidth: 1,
    alignSelf: 'center', minWidth: 44, alignItems: 'center',
  },
  badgeText: { fontSize: 9, fontFamily: 'Amiri-Bold' },

  footer: {
    position: 'absolute', bottom: 14, left: 24, right: 24,
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    fontSize: 8, color: '#333', borderTop: 0.5, borderTopColor: '#ccc', paddingTop: 6,
  },
});

function StatusBadge({ status, statusLabel }) {
  const s = STATUS_STYLE[status] || { bg: '#f2f2f2', text: '#666', border: '#ccc' };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.badgeText, { color: s.text }]}>{statusLabel}</Text>
    </View>
  );
}

const STATUS_KEYS = [
  { key: 'mastered', label: 'متقنة' },
  { key: 'needsSupport', label: 'تحتاج دعم' },
  { key: 'notMastered', label: 'غير متقنة' },
  { key: 'absent', label: 'غائبة' },
];

function columnWidths(skillCount) {
  const nameW = 16;
  const recW = 22;
  const actionW = 20;
  const remaining = 100 - nameW - recW - actionW;
  const skillW = remaining / Math.max(skillCount, 1);
  return { nameW, recW, actionW, skillW };
}

export default function ClassWeekReportDocument({ data, reportTypeLabel }) {
  const { nameW, recW, actionW, skillW } = columnWidths(data.skillTitles.length);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.pageHeader} fixed>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.headerLine}>المادة: {data.subject || 'غير محددة'}</Text>
          <Text style={styles.headerLine}>{data.weekName}</Text>
        </View>

        <View style={styles.columnHeaderRow} fixed>
          <Text style={[styles.headerCell, styles.headerCellFirst, { width: `${nameW}%` }]}>الطالبة</Text>
          {data.skillTitles.map((t, i) => (
            <Text key={i} style={[styles.headerCell, { width: `${skillW}%` }]}>{t}</Text>
          ))}
          <Text style={[styles.headerCell, { width: `${recW}%` }]}>التوصية</Text>
          <Text style={[styles.headerCell, { width: `${actionW}%` }]}>الإجراء</Text>
        </View>

        <Text style={styles.reportTitle}>{reportTypeLabel}</Text>
        {data.enrichmentLink && (
          <Text style={styles.metaLine}>الرابط الإثرائي: {data.enrichmentLink}</Text>
        )}
        <View style={styles.statsRow}>
          {STATUS_KEYS.map((s) => (
            <Text key={s.key}>{s.label}: {data.classCounts[s.key]}</Text>
          ))}
        </View>

        {data.rows.map((row, i) => (
          <View key={i} style={[styles.row, i % 2 === 1 && styles.rowEven]} wrap={false}>
            <Text style={[styles.cell, { width: `${nameW}%` }]}>{row.name}</Text>
            {row.cells.map((c, j) => (
              <View key={j} style={[styles.cell, { width: `${skillW}%`, paddingVertical: 4 }]}>
                <StatusBadge status={c.status} statusLabel={c.statusLabel} />
              </View>
            ))}
            <Text style={[styles.cell, { width: `${recW}%`, fontSize: 8 }]}>{row.recommendation}</Text>
            <View style={[styles.cell, { width: `${actionW}%` }]}>
              {(row.activeActions || []).map((a, k) => (
                <Text key={k} style={{ fontSize: 7, color: a.type === 'remedial' ? '#8a5a00' : '#0b5c33' }}>
                  {a.type === 'remedial' ? '⚠' : '⭐'} {a.affectedSkillTitles.join('، ')}: {a.text}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>مديرة المدرسة: {data.principalName || '—'}</Text>
          <Text>المعلّمة: {data.teacherName}</Text>
          <Text render={({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
