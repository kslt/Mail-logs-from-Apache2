require('dotenv').config();
const fs = require('fs');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const path = require('path');
const cron = require('node-cron');

// Create PDF
function generatePDF(logText, outputPath) {
    return new Promise((resolve, reject) => {
        console.log('🔧 Startar PDF-generering...');
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
        const stream = fs.createWriteStream(outputPath);

        stream.on('finish', () => {
            console.log('✅ PDF färdigskriven.');
            resolve();
        });
        stream.on('error', (err) => {
            console.error('❌ Fel i stream:', err);
            reject(err);
        });

        doc.pipe(stream);

        try {
            const now = new Date();
            const dateString = now.toLocaleString('sv-SE');
            const logoPath = 'logo.png';

            const accessStart = logText.indexOf('=== Access Log ===');
            const errorStart = logText.indexOf('=== Error Log ===');
            const vhostStart = logText.indexOf('=== Vhost Log ===');

            const accessContent = logText.slice(accessStart + 18, errorStart).trim();
            const errorContent = logText.slice(errorStart + 17, vhostStart).trim();
            const vhostContent = logText.slice(vhostStart + 17).trim();

            // Statistik
            const totalLines = accessContent.split('\n').length + errorContent.split('\n').length + vhostContent.split('\n').length;
            const errorLines = (errorContent.match(/error/gi) || []).length;

            //Access logpage
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, doc.page.width / 2 - 50, 40, { width: 100 });
                doc.moveDown(3.5);
              } else {
                console.log('⚠️ Logotyp hittades inte.');
            }

            doc.fontSize(16).fillColor('#333333').font('Helvetica').text('vm210 - Apache Loggrapport', { align: 'center' });
            doc.fontSize(10).fillColor('#000000').font('Helvetica').text(`Genererad: ${dateString}`, { align: 'center' });
            doc.moveDown(1.5);

            doc.fontSize(12).fillColor('#000000').text(`Sammanfattning:`);
            doc.fontSize(10).text(`- Totalt antal rader: ${totalLines}`);
            doc.text(`- Antal rader med "ERROR": ${errorLines}`);
            doc.moveDown(3);

            doc.fillColor('#31708f').font('Helvetica-Bold').fontSize(12).text(' Access Logg', doc.x + 5, doc.y - 15);
            doc.moveDown(1);
            doc.font('Courier').fontSize(9);
            writeLogWithHighlights(doc, accessContent || '(ingen data)');
            doc.moveDown(4);

            //doc.addPage();

            //Error logpage
            doc.fillColor('#a94442').font('Helvetica-Bold').fontSize(12).text(' Error Logg', doc.x + 5, doc.y - 15);
            doc.moveDown(1);
            doc.font('Courier').fontSize(9);
            writeLogWithHighlights(doc, errorContent || '(ingen data)');
            doc.moveDown(4);

            //doc.addPage();

            //Vhost logpage
            doc.fillColor('#44a942').font('Helvetica-Bold').fontSize(12).text(' Vhost Logg', doc.x + 5, doc.y - 15);
            doc.moveDown(1);
            doc.font('Courier').fontSize(9);
            writeLogWithHighlights(doc, vhostContent || '(ingen data)');

            doc.end();
        } catch (e) {
            console.error('🚨 Fel under PDF-generering:', e);
            reject(e);
        }
    });
}

// Colored rows
function writeLogWithHighlights(doc, content) {
  const lines = content.split('\n');
  for (const line of lines) {
    if (/error/i.test(line)) {
      doc.fillColor('red').text(line, { lineGap: 1 });
    } else {
      doc.fillColor('black').text(line, { lineGap: 1 });
    }
  }
}

cron.schedule('* * * * *', async () => {
    console.log(`[${new Date().toISOString()}] Kör schemalagd loggrapport...`);
  
    try {
      const accessLog = '/var/log/apache2/access.log';
      const errorLog = '/var/log/apache2/error.log';
      const vhostLog = '/var/log/apache2/other_vhosts_access.log';
      const pdfPath = `/tmp/apache-loggar-${new Date().toISOString().slice(0, 10)}.pdf`;
  
      const accessContent = fs.readFileSync(accessLog, 'utf-8');
      const errorContent = fs.readFileSync(errorLog, 'utf-8');
      const vhostContent = fs.readFileSync(vhostLog, 'utf-8');
  
      const combinedLog = `=== Access Log ===\n${accessContent}\n\n=== Error Log ===\n${errorContent}\n\n=== Vhost Log ===\n${vhostContent}`;
      await generatePDF(combinedLog, pdfPath);
  
      // SMTP config
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
  
      // Send mail with PDF attachment
      await transporter.sendMail({
        from: `"vm250 - Apache logg" <${process.env.SMTP_FROM_EMAIL}>`,
        to: process.env.SMTP_TO_EMAIL,
        subject: 'Daglig Apache-logg som PDF',
        text: 'Se bifogad PDF-fil med dagens loggar.',
        attachments: [
          {
            filename: path.basename(pdfPath),
            path: pdfPath,
          },
        ],
      });
  
      fs.unlinkSync(pdfPath);
      console.log('PDF-logg skickad!');
    } catch (err) {
      console.error('Fel vid logghantering eller e-postskick:', err);
    }
  });