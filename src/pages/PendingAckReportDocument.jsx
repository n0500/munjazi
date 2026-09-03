import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Plex',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf',
});
Font.register({
  family: 'Plex-Bold',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf',
});

const HEADER_BG = '#14261e';
const HEADER_DIVIDER = '#3a4a42';
const ROW_BORDER = '#e0e0e0';
const COL_BORDER = '#cfcfcf';

const styles = StyleSheet.create({
  page: { fontFamily: 'Plex', paddingTop: 130, paddingBottom: 40, paddingHorizontal: 24, fontSize: 9 },

  fixedHeaderBlock: { position: 'absolute', top: 14, left: 24, right: 24 },
  schoolName: { fontFamily: 'Plex-Bold', fontSize: 14, color: '#14261e', textAlign: 'center', lineHeight: 1.3 },
  reportTitle: { fontFamily: 'Plex-Bold', fontSize: 14, color: '#a10000', textAlign: 'center', marginTop: 6, lineHeight: 1.3 },
  metaLine: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 3, lineHeight: 1.3 },
  scopeLine: { fontSize: 9, color: '#0b7a4b', fontFamily: 'Plex-Bold', textAlign: 'center', marginTop: 4 },
  countLine: { fontSize: 9, color: '#a10000', textAlign: 'center', marginTop: 6, marginBottom: 8, fontFamily: 'Plex-Bold' },

  tableHeaderRow: { flexDirection: 'row-reverse', backgroundColor: HEADER_BG, paddingVertical: 5 },
  headerCell: {
    fontFamily: 'Plex-Bold', fontSize: 8.5, textAlign: 'center', color: '#ffffff',
    borderLeftWidth: 0.75, borderLeftColor: HEADER_DIVIDER, paddingHorizontal: 3,
  },
  headerCellFirst: { textAlign: 'right', paddingRight: 6 },

  row: {
    flexDirection: 'row-reverse', minHeight: 20, alignItems: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 0.75, borderColor: ROW_BORDER,
  },
  rowEven: { backgroundColor: '#fafafa' },
  cell: { fontSize: 8, textAlign: 'right', paddingHorizontal: 4, paddingVertical: 3, borderLeftWidth: 0.75, borderLeftColor: COL_BORDER },

  repeatedBadge: {
    backgroundColor: '#fdecea', borderColor: '#c62828', borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1.5, alignSelf: 'center',
  },
  repeatedBadgeText: { fontSize: 7.5, color: '#a10000', fontFamily: 'Plex-Bold' },

  footer: {
    position: 'absolute', bottom: 14, left: 24, right: 24,
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    fontSize: 8, color: '#333', borderTop: 0.5, borderTopColor: '#ccc', paddingTop: 6,
  },
});

const COL_WIDTHS = { student: 18, teacher: 15, subjectClass: 20, skill: 22, date: 13, repeated: 12 };

export default function PendingAckReportDocument({ rows, schoolName, scopeLabel, generatedDate }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.fixedHeaderBlock} fixed>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.reportTitle}>تقرير: أولياء أمور لم يطّلعوا على إجراءات نشطة</Text>
          <Text style={styles.metaLine}>تاريخ التقرير: {generatedDate}</Text>
          <Text style={styles.scopeLine}>النطاق: {scopeLabel}</Text>
          <Text style={styles.countLine}>عدد الحالات: {rows.length}</Text>

          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, styles.headerCellFirst, { width: `${COL_WIDTHS.student}%` }]}>الطالبة</Text>
            <Text style={[styles.headerCell, { width: `${COL_WIDTHS.teacher}%` }]}>المعلّمة</Text>
            <Text style={[styles.headerCell, { width: `${COL_WIDTHS.subjectClass}%` }]}>المادة / الفصل</Text>
            <Text style={[styles.headerCell, { width: `${COL_WIDTHS.skill}%` }]}>المهارة</Text>
            <Text style={[styles.headerCell, { width: `${COL_WIDTHS.date}%` }]}>تاريخ التفعيل</Text>
            <Text style={[styles.headerCell, { width: `${COL_WIDTHS.repeated}%` }]}>متكررة؟</Text>
          </View>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={[styles.row, i % 2 === 1 && styles.rowEven]} wrap={false}>
            <Text style={[styles.cell, { width: `${COL_WIDTHS.student}%` }]}>{r.studentName}</Text>
            <Text style={[styles.cell, { width: `${COL_WIDTHS.teacher}%` }]}>{r.teacherName}</Text>
            <Text style={[styles.cell, { width: `${COL_WIDTHS.subjectClass}%` }]}>{r.subject} — {r.className}</Text>
            <Text style={[styles.cell, { width: `${COL_WIDTHS.skill}%` }]}>{r.skillTitles}</Text>
            <Text style={[styles.cell, { width: `${COL_WIDTHS.date}%`, textAlign: 'center' }]}>{r.activatedDate}</Text>
            <View style={[styles.cell, { width: `${COL_WIDTHS.repeated}%` }]}>
              {r.repeated ? (
                <View style={styles.repeatedBadge}>
                  <Text style={styles.repeatedBadgeText}>متكررة</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 8, textAlign: 'center', color: '#999' }}>—</Text>
              )}
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text />
          <Text render={({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
