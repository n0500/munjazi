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
  page: { fontFamily: 'Plex', paddingTop: 100, paddingBottom: 40, paddingHorizontal: 26, fontSize: 9 },

  fixedHeaderBlock: { position: 'absolute', top: 14, left: 26, right: 26 },
  schoolName: { fontFamily: 'Plex-Bold', fontSize: 13, color: '#14261e', textAlign: 'center', lineHeight: 1.3 },
  reportTitle: { fontFamily: 'Plex-Bold', fontSize: 14, color: '#0b7a4b', textAlign: 'center', marginTop: 8, lineHeight: 1.3 },
  metaLine: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 4, lineHeight: 1.3 },

  weekBlock: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, marginBottom: 12 },
  weekTitle: { fontFamily: 'Plex-Bold', fontSize: 11, marginBottom: 4 },
  weekLink: { fontSize: 8, color: '#0b7a4b', textDecoration: 'underline', marginBottom: 6 },
  noSkillsText: { fontSize: 8.5, color: '#999' },

  tableHeaderRow: { flexDirection: 'row-reverse', backgroundColor: HEADER_BG, paddingVertical: 4 },
  headerCell: {
    fontFamily: 'Plex-Bold', fontSize: 8, color: '#fff', textAlign: 'center',
    borderLeftWidth: 0.5, borderLeftColor: HEADER_DIVIDER,
  },
  headerCellFirst: { textAlign: 'right', paddingRight: 5 },

  skillRow: { flexDirection: 'row-reverse', minHeight: 18, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: ROW_BORDER },
  skillCell: { fontSize: 8, paddingHorizontal: 4, paddingVertical: 3, borderLeftWidth: 0.5, borderLeftColor: COL_BORDER },
  recCell: { fontSize: 7.5 },

  badge: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, borderWidth: 1, alignSelf: 'center', minWidth: 38, alignItems: 'center' },
  badgeText: { fontSize: 7.5, fontFamily: 'Plex-Bold' },

  actionsCell: { fontSize: 7 },

  summaryBox: { borderWidth: 1, borderColor: '#0b7a4b', borderRadius: 6, padding: 10, marginTop: 4, marginBottom: 10 },
  summaryTitle: { fontFamily: 'Plex-Bold', fontSize: 10, marginBottom: 4, color: '#0b5c33' },
  summaryRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, fontSize: 9 },

  footer: {
    position: 'absolute', bottom: 14, left: 26, right: 26,
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

function weekColumnWidths(skillCount, includeActions) {
  const nameW = 18;
  const recW = 24;
  const actionW = includeActions ? 18 : 0;
  const remaining = 100 - nameW - recW - actionW;
  const skillW = remaining / Math.max(skillCount, 1);
  return { nameW, recW, actionW, skillW };
}

export default function ClassRangeReportDocument({ data }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.fixedHeaderBlock} fixed>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.reportTitle}>تقرير فصل — مدى أسابيع — {data.className}</Text>
          <Text style={styles.metaLine}>المادة: {data.subject || 'غير محددة'}</Text>
          <Text style={styles.metaLine}>من {data.fromWeekName} إلى {data.toWeekName}</Text>
        </View>

        {data.weeks.map((w, wIdx) => {
          const isLastWeek = wIdx === data.weeks.length - 1;
          const { nameW, recW, actionW, skillW } = weekColumnWidths(w.skillTitles.length, isLastWeek);
          return (
            <View key={w.id} style={styles.weekBlock} wrap={false}>
              <Text style={styles.weekTitle}>{w.name} — {w.typeLabel}</Text>
              {w.enrichmentLink && (
                <Text style={styles.weekLink}>
                  <Link src={w.enrichmentLink} style={styles.weekLink}>الرابط الإثرائي</Link>
                </Text>
              )}

              {w.skillTitles.length === 0 ? (
                <Text style={styles.noSkillsText}>لا توجد مهارات مسجَّلة لهذا الأسبوع.</Text>
              ) : (
                <>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.headerCell, styles.headerCellFirst, { width: `${nameW}%` }]}>الطالبة</Text>
                    {w.skillTitles.map((t, i) => (
                      <Text key={i} style={[styles.headerCell, { width: `${skillW}%` }]}>{t}</Text>
                    ))}
                    <Text style={[styles.headerCell, { width: `${recW}%` }]}>التوصية</Text>
                    {isLastWeek && (
                      <Text style={[styles.headerCell, { width: `${actionW}%` }]}>الإجراء (الوضع الحالي)</Text>
                    )}
                  </View>
                  {w.rows.map((row, i) => (
                    <View key={i} style={styles.skillRow}>
                      <Text style={[styles.skillCell, { width: `${nameW}%` }]}>{row.name}</Text>
                      {row.cells.map((c, j) => (
                        <View key={j} style={[styles.skillCell, { width: `${skillW}%` }]}>
                          <StatusBadge status={c.status} statusLabel={c.statusLabel} />
                        </View>
                      ))}
                      <Text style={[styles.skillCell, styles.recCell, { width: `${recW}%` }]}>{row.recommendation}</Text>
                      {isLastWeek && (
                        <View style={[styles.skillCell, { width: `${actionW}%` }]}>
                          {(data.studentActiveActions?.[row.name] || []).map((a, k) => (
                            <Text key={k} style={[styles.actionsCell, { color: a.type === 'remedial' ? '#8a5a00' : '#0b5c33' }]}>
                              {a.type === 'remedial' ? '⚠' : '⭐'} {a.affectedSkillTitles.join('، ')}: {a.text}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}
            </View>
          );
        })}

        <View style={styles.summaryBox} wrap={false}>
          <Text style={styles.summaryTitle}>ملخّص إحصائي إجمالي</Text>
          <View style={styles.summaryRow}>
            {STATUS_KEYS.map((s) => (
              <Text key={s.key}>{s.label}: {data.classCounts[s.key]}</Text>
            ))}
          </View>
        </View>

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
