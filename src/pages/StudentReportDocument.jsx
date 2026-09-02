import { Document, Page, Text, View, StyleSheet, Font, Link } from '@react-pdf/renderer';

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
  page: { fontFamily: 'Plex', paddingTop: 150, paddingBottom: 40, paddingHorizontal: 26, fontSize: 9 },

  fixedHeaderBlock: { position: 'absolute', top: 14, left: 26, right: 26 },
  schoolName: { fontFamily: 'Plex-Bold', fontSize: 14, color: '#14261e', textAlign: 'center', lineHeight: 1.3 },
  headerLine: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 3, lineHeight: 1.3 },
  reportTitle: { fontFamily: 'Plex-Bold', fontSize: 13, color: '#0b7a4b', textAlign: 'center', marginTop: 8, marginBottom: 4 },
  studentLine: { fontSize: 10, textAlign: 'center', marginTop: 2 },
  studentLineBold: { fontFamily: 'Plex-Bold' },

  actionBox: {
    borderWidth: 1, borderRadius: 6, padding: 8, marginBottom: 8,
  },
  actionRemedial: { backgroundColor: '#fdf3e2', borderColor: '#e0b25c' },
  actionEnrichment: { backgroundColor: '#eaf6ee', borderColor: '#0b7a4b' },
  actionTitle: { fontFamily: 'Plex-Bold', fontSize: 9, marginBottom: 2 },
  actionText: { fontSize: 8 },

  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10, fontSize: 8, color: '#333' },

  weekBlock: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, marginBottom: 10 },
  weekTitle: { fontFamily: 'Plex-Bold', fontSize: 11, marginBottom: 4 },
  weekLink: { fontSize: 8, color: '#0b7a4b', textDecoration: 'underline', marginBottom: 6 },

  tableHeaderRow: { flexDirection: 'row-reverse', backgroundColor: HEADER_BG, paddingVertical: 4 },
  tableHeaderCell: { fontFamily: 'Plex-Bold', fontSize: 8.5, color: '#fff', textAlign: 'center', borderLeftWidth: 0.5, borderLeftColor: HEADER_DIVIDER },
  tableHeaderCellFirst: { textAlign: 'right', paddingRight: 6 },

  skillRow: { flexDirection: 'row-reverse', minHeight: 18, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: ROW_BORDER },
  skillCell: { fontSize: 8.5, paddingHorizontal: 4, paddingVertical: 3, borderLeftWidth: 0.5, borderLeftColor: COL_BORDER },

  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, alignSelf: 'center', minWidth: 40, alignItems: 'center' },
  badgeText: { fontSize: 8, fontFamily: 'Plex-Bold' },

  recLine: { fontSize: 8.5, marginTop: 5 },

  footer: {
    position: 'absolute', bottom: 14, left: 26, right: 26,
    flexDirection: 'row-reverse', fontSize: 8, color: '#333',
    borderTop: 0.5, borderTopColor: '#ccc', paddingTop: 6,
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

export default function StudentReportDocument({ data }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.fixedHeaderBlock} fixed>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.headerLine}>المادة: {data.subject || 'غير محددة'}</Text>
          <Text style={styles.headerLine}>من {data.fromWeekName} إلى {data.toWeekName}</Text>
          <Text style={styles.reportTitle}>تقرير طالبة</Text>
          <Text style={styles.studentLine}>
            <Text style={styles.studentLineBold}>الطالبة: </Text>{data.studentName}
          </Text>
          <Text style={styles.studentLine}>
            <Text style={styles.studentLineBold}>الفصل: </Text>{data.className}
          </Text>
        </View>

        {data.activeActions && data.activeActions.length > 0 && (
          <View wrap={false}>
            {data.activeActions.map((a, i) => (
              <View
                key={i}
                style={[styles.actionBox, a.type === 'remedial' ? styles.actionRemedial : styles.actionEnrichment]}
              >
                <Text style={[styles.actionTitle, { color: a.type === 'remedial' ? '#8a5a00' : '#0b5c33' }]}>
                  {a.type === 'remedial' ? '⚠ إجراء علاجي' : '⭐ إجراء إثرائي'} — {a.affectedSkillTitles.join('، ')}
                </Text>
                <Text style={styles.actionText}>{a.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsRow} wrap={false}>
          <Text>متقنة: {data.statusCounts.mastered}</Text>
          <Text>تحتاج دعم: {data.statusCounts.needsSupport}</Text>
          <Text>غير متقنة: {data.statusCounts.notMastered}</Text>
          <Text>غائبة: {data.statusCounts.absent}</Text>
        </View>

        {data.weeks.map((w) => (
          <View key={w.id} style={styles.weekBlock} wrap={false}>
            <Text style={styles.weekTitle}>{w.name} — {w.typeLabel}</Text>
            {w.enrichmentLink && (
              <Text style={styles.weekLink}>
                <Link src={w.enrichmentLink} style={styles.weekLink}>الرابط الإثرائي</Link>
              </Text>
            )}

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.tableHeaderCellFirst, { width: '65%' }]}>المهارة</Text>
              <Text style={[styles.tableHeaderCell, { width: '35%' }]}>الحالة</Text>
            </View>
            {w.skills.map((sk, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={[styles.skillCell, { width: '65%' }]}>{sk.title}</Text>
                <View style={[styles.skillCell, { width: '35%' }]}>
                  <StatusBadge status={sk.status} statusLabel={sk.statusLabel} />
                </View>
              </View>
            ))}

            {w.recommendation && (
              <Text style={styles.recLine}>
                <Text style={styles.studentLineBold}>التوصية: </Text>{w.recommendation}
              </Text>
            )}
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
