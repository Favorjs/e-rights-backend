/**
 * Run: node inspect-pdf-fields.js
 * Lists all form fields and their page/position info from the rights issue PDF.
 */
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function inspect(pdfPath) {
  const bytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  console.log(`\n=== ${path.basename(pdfPath)} ===`);
  console.log(`Pages: ${pdfDoc.getPageCount()}`);
  console.log(`Fields: ${fields.length}\n`);

  fields.forEach(field => {
    const name = field.getName();
    const widgets = field.acroField.getWidgets();
    widgets.forEach((widget, wi) => {
      const rect = widget.getRectangle();
      const pageRef = widget.P();
      // Find page index
      let pageIndex = '?';
      try {
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].ref === pageRef) { pageIndex = i; break; }
        }
      } catch (_) {}
      console.log(`  [${name}]  widget#${wi}  page=${pageIndex}  x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} h=${Math.round(rect.height)}`);
    });
  });
}

(async () => {
  const pdfs = [
    './rights-form/LINKAGE_RIGHTS_ISSUE.pdf',
  ];
  for (const p of pdfs) {
    await inspect(path.join(__dirname, p));
  }
})();
