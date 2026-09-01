import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// الدالة القياسية (تبقى كما هي، مستقرة وتُستخدم لتقرير الطالبة، الخطة العلاجية،
// وتقرير الفصل بوضع "مدى أسابيع") — تحوّل عنصر HTML لملف PDF متعدد الصفحات،
// مع تفادي قطع أي عنصر عليه صنف "pdf-avoid-break" بمنتصف صفحتين.
export async function exportElementToPdf(element, filename, orientation = 'p') {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const ratio = imgWidth / element.offsetWidth;
  const elementRect = element.getBoundingClientRect();

  const links = Array.from(element.querySelectorAll('a[href]')).map((a) => {
    const r = a.getBoundingClientRect();
    return {
      url: a.getAttribute('href'),
      x: (r.left - elementRect.left) * ratio,
      y: (r.top - elementRect.top) * ratio,
      w: r.width * ratio,
      h: r.height * ratio,
    };
  });

  const noBreakBlocks = Array.from(element.querySelectorAll('.pdf-avoid-break')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: (r.top - elementRect.top) * ratio,
      bottom: (r.bottom - elementRect.top) * ratio,
    };
  });

  function addLinksForRange(topMm, bottomMm) {
    links.forEach((l) => {
      if (l.y >= topMm && l.y < bottomMm) {
        pdf.link(l.x, l.y - topMm, l.w, l.h, { url: l.url });
      }
    });
  }

  let currentTopMm = 0;
  let firstPage = true;

  while (currentTopMm < imgHeight) {
    let pageBottomMm = Math.min(currentTopMm + pageHeight, imgHeight);

    const breakingBlock = noBreakBlocks
      .filter((b) => b.top > currentTopMm && b.top < pageBottomMm && b.bottom > pageBottomMm)
      .sort((a, b) => a.top - b.top)[0];

    if (breakingBlock && breakingBlock.top > currentTopMm) {
      pageBottomMm = breakingBlock.top;
    }

    if (!firstPage) pdf.addPage();
    firstPage = false;

    pdf.addImage(imgData, 'PNG', 0, -currentTopMm, imgWidth, imgHeight);
    addLinksForRange(currentTopMm, pageBottomMm);

    currentTopMm = pageBottomMm;
  }

  pdf.save(filename);
}

// دالة مخصصة لتقرير الفصل بوضع "أسبوع محدد" — تلتقط رأس الصفحة وعناوين أعمدة الجدول
// وصفوف الطالبات كثلاث صور مستقلة تمامًا (بدل اقتطاعها من صورة واحدة مشتركة)، لضمان
// عدم حدوث أي تراكب أو تشويه بصري. يعتمد على إخفاء/إظهار thead وtbody مؤقتًا لالتقاط
// كل جزء لحاله بنفس عرض الأعمدة الفعلي (بما إنه نفس عنصر الجدول بالضبط).
export async function exportClassWeekReportWithRepeatingHeader(
  { headerEl, tableEl },
  filename,
  orientation = 'l',
) {
  const theadEl = tableEl.querySelector('thead');
  const tbodyEl = tableEl.querySelector('tbody');

  const headerCanvas = await html2canvas(headerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

  const originalTbodyDisplay = tbodyEl.style.display;
  tbodyEl.style.display = 'none';
  const theadCanvas = await html2canvas(tableEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  tbodyEl.style.display = originalTbodyDisplay;

  const originalTheadDisplay = theadEl.style.display;
  theadEl.style.display = 'none';
  const bodyCanvas = await html2canvas(tableEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  theadEl.style.display = originalTheadDisplay;

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;

  const headerHeightMm = (headerCanvas.height * imgWidth) / headerCanvas.width;
  const theadHeightMm = (theadCanvas.height * imgWidth) / theadCanvas.width;
  const bodyHeightMm = (bodyCanvas.height * imgWidth) / bodyCanvas.width;

  const headerImgData = headerCanvas.toDataURL('image/png');
  const theadImgData = theadCanvas.toDataURL('image/png');
  const bodyImgData = bodyCanvas.toDataURL('image/png');

  // حدود كل صف (بالمليمتر، نسبةً لأعلى منطقة الصفوف نفسها) — تفاديًا لقطع أي صف بمنتصفه
  const ratio = imgWidth / tableEl.offsetWidth;
  const tableRect = tableEl.getBoundingClientRect();
  const rowBlocks = Array.from(tbodyEl.querySelectorAll('tr')).map((tr) => {
    const r = tr.getBoundingClientRect();
    return {
      top: (r.top - tableRect.top) * ratio,
      bottom: (r.bottom - tableRect.top) * ratio,
    };
  });

  let currentTopMm = 0;
  let firstPage = true;

  while (currentTopMm < bodyHeightMm) {
    const reservedTopMm = headerHeightMm + theadHeightMm;
    const availableHeightMm = pageHeight - reservedTopMm;
    let pageBottomMm = Math.min(currentTopMm + availableHeightMm, bodyHeightMm);

    const breakingRow = rowBlocks
      .filter((b) => b.top > currentTopMm && b.top < pageBottomMm && b.bottom > pageBottomMm)
      .sort((a, b) => a.top - b.top)[0];
    if (breakingRow && breakingRow.top > currentTopMm) {
      pageBottomMm = breakingRow.top;
    }

    if (!firstPage) pdf.addPage();
    firstPage = false;

    pdf.addImage(headerImgData, 'PNG', 0, 0, imgWidth, headerHeightMm);
    pdf.addImage(theadImgData, 'PNG', 0, headerHeightMm, imgWidth, theadHeightMm);
    pdf.addImage(bodyImgData, 'PNG', 0, reservedTopMm - currentTopMm, imgWidth, bodyHeightMm);

    currentTopMm = pageBottomMm;
  }

  pdf.save(filename);
}
