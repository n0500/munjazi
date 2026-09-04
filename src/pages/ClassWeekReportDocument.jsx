import { Document, Page, Text, View, Image, StyleSheet, Font, Link } from '@react-pdf/renderer';

Font.register({
  family: 'Plex',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf',
});
Font.register({
  family: 'Plex-Bold',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf',
});

const STATUS_STYLE = {
  mastered: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
  needsSupport: { bg: '#fff7e0', text: '#8a6d00', border: '#d9b400' },
  notMastered: { bg: '#fdecea', text: '#a10000', border: '#c62828' },
  absent: { bg: '#f2f2f2', text: '#666', border: '#ccc' },
};

const HEADER_BG = '#14261e';
const HEADER_DIVIDER = '#3a4a42';
const ROW_BORDER = '#e0e0e0';
const COL_BORDER = '#cfcfcf';

const styles = StyleSheet.create({
  page: { fontFamily: 'Plex', paddingTop: 105, paddingBottom: 40, paddingHorizontal: 24, fontSize: 9 },

  // القالب الجاهز (الشعار والحدود) — صورة خلفية ثابتة تغطي الصفحة كاملة، تتكرر تلقائيًا
  templateBg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },

  fixedHeaderBlock: { position: 'absolute', top: 14, left: 24, right: 24 },
  schoolName: { fontFamily: 'Plex-Bold', fontSize: 13, color: '#14261e', textAlign: 'center', lineHeight: 1.3 },
  reportTitle: { fontFamily: 'Plex-Bold', fontSize: 14, color: '#0b7a4b', textAlign: 'center', marginTop: 10, lineHeight: 1.3 },
  metaLine: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 4, lineHeight: 1.3 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 8, fontSize: 8 },

  columnHeaderRow: {
    flexDirection: 'row-reverse',
    backgroundColor: HEADER_BG,
    borderWidth: 1, borderColor: HEADER_BG,
    paddingVertical: 5,
  },
  headerCell: {
    fontFamily: 'Plex-Bold', fontSize: 9, textAlign: 'center', color: '#ffffff',
    borderLeftWidth: 0.75, borderLeftColor: HEADER_DIVIDER, paddingHorizontal: 3,
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

  badge: {
    paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 4, borderWidth: 1,
    alignSelf: 'center', minWidth: 44, alignItems: 'center',
  },
  badgeText: { fontSize: 9, fontFamily: 'Plex-Bold' },

  footer: {
    position: 'absolute', bottom: 14, left: 24, right: 24,
    flexDirection: 'row-reverse',
    fontSize: 8, color: '#333', borderTop: 0.5, borderTopColor: '#ccc', paddingTop: 6,
  },
  footerColRight: { flex: 1, textAlign: 'right' },
  footerColCenter: { flex: 1, textAlign: 'center' },
  footerColLeft: { flex: 1, textAlign: 'left' },
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
  { key: 'needsSupport', label: 'تحتاج دعمًا' },
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
        {/* القالب الجاهز يُرسم أولًا (خلفية)، وكل شي ثاني يُرسم فوقه */}
        <Image src="templates/report-landscape.png" style={styles.templateBg} fixed />

        <View style={styles.fixedHeaderBlock} fixed>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.metaLine}>المادة: {data.subject || 'غير محددة'}</Text>
          <Text style={styles.metaLine}>{data.weekName}</Text>

          <Text style={styles.reportTitle}>{reportTypeLabel}</Text>
          {data.enrichmentLink && (
            <Text style={styles.metaLine}>
              الرابط الإثرائي: <Link src={data.enrichmentLink} style={{ color: '#0b7a4b' }}>{data.enrichmentLink}</Link>
            </Text>
          )}
          <View style={styles.statsRow}>
            {STATUS_KEYS.map((s) => (
              <Text key={s.key}>{s.label}: {data.classCounts[s.key]}</Text>
            ))}
          </View>

          <View style={styles.columnHeaderRow}>
            <Text style={[styles.headerCell, styles.headerCellFirst, { width: `${nameW}%` }]}>الطالبة</Text>
            {data.skillTitles.map((t, i) => (
              <Text key={i} style={[styles.headerCell, { width: `${skillW}%` }]}>{t}</Text>
            ))}
            <Text style={[styles.headerCell, { width: `${recW}%` }]}>التوصية</Text>
            <Text style={[styles.headerCell, { width: `${actionW}%` }]}>الإجراء</Text>
          </View>
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
          <Text style={styles.footerColRight}>مديرة المدرسة: {data.principalName || '—'}</Text>
          <Text style={styles.footerColCenter}>المعلّمة: {data.teacherName}</Text>
          <Text
            style={styles.footerColLeft}
            render={({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
