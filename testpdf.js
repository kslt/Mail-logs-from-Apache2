const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument();
const outputPath = '/tmp/test-pdf.pdf';
const stream = fs.createWriteStream(outputPath);

doc.pipe(stream);

doc.fontSize(25).text('Hej från PDFKit!', 100, 100);

doc.end();

stream.on('finish', () => {
  console.log('PDF skapad i /tmp/test-pdf.pdf');
});

stream.on('error', (err) => {
  console.error('Fel vid PDF-skapande:', err);
});
