require('dotenv').config();

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

/**
 * Tjänster – en PDF per tjänst
 */
const services = [
  'dynlink',
  'gardsbutiker',
  'ksaventyr',
  'ksilinkoping',
  'kswebb.se',
  'lmbk',
  'pwgen_ssl',
  'qsologs',
  'ronda_ssl',
  'sk5lf'
];

/**
 * Tjänstens loggfil
 */
const serviceLogPath = '/var/opt/Mail-logs-from-Apache2/logs/send_logs_apache2.log';
function logService(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(serviceLogPath, `[${timestamp}] ${message}\n`);
  console.log(`[SERVICE LOG] ${message}`);
}

/**
 * SMTP
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Markerade loggrader
 */
function writeLogWithHighlights(doc, content) {
  for (const line of content.split('\n')) {
    if (/error/i.test(line)) {
      doc.fillColor('red').text(line, { lineGap: 1 });
    } else {
      doc.fillColor('black').text(line, { lineGap: 1 });
    }
  }
}

/**
 * Läs loggar för en tjänst
 */
function getLogsForService(service) {
  const defs = [
    {
      title: `${service.toUpperCase()} – Access Logg`,
      file: `/var/log/apache2/${service}_access.log`,
      color: '#31708f'
    },
    {
      title: `${service.toUpperCase()} – Error Logg`,
      file: `/var/log/apache2/${service}_error.log`,
      color: '#a94442'
    }
  ];

  return defs.map(log => {
    let content = '(ingen data)';
    try {
      content = fs.readFileSync(log.file, 'utf-8');
    } catch {
      content = '(kunde inte läsa loggfilen)';
      logService(`⚠️ Kunde inte läsa ${log.file}`);
    }
    return { ...log, content };
  });
}

/**
 * Skapa PDF för EN tjänst
 */
function generatePDF(service, logs, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    stream.on('finish', resolve);
    stream.on('error', reject);

    const dateString = new Date().toLocaleString('sv-SE');

    doc.fontSize(16)
      .fillColor('#333')
      .text(`Apache-loggar – ${service.toUpperCase()}`, { align: 'center' });

    doc.fontSize(10)
      .fillColor('#000')
      .text(`Genererad: ${dateString}`, { align: 'center' });

    doc.moveDown(2);

    logs.forEach((log, index) => {
      if (index > 0) doc.addPage();

      doc.fillColor(log.color)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(log.title);

      doc.moveDown(1);
      doc.font('Courier').fontSize(9);
      writeLogWithHighlights(doc, log.content);
    });

    doc.end();
  });
}

/**
 * Cron – ett mejl med alla PDF:er
 */
(async () => {
  logService('Startar testkörning...');
  const attachments = [];
  const today = new Date().toISOString().slice(0, 10);

  try {
    for (const service of services) {
      logService(`📄 Skapar PDF för ${service}`);
      const logs = getLogsForService(service);
      const pdfPath = `/tmp/apache-${service}-${today}.pdf`;

      await generatePDF(service, logs, pdfPath);
      attachments.push({
        filename: path.basename(pdfPath),
        path: pdfPath
      });

      logService(`✅ PDF klar för ${service}`);
    }

    // Skicka ett mail med alla PDF:er
    await transporter.sendMail({
      from: `"Apache loggrapport" <${process.env.SMTP_FROM_EMAIL}>`,
      to: process.env.SMTP_TO_EMAIL,
      subject: `Apache-loggar ${today}`,
      text: `Bifogat finns loggrapporter (PDF), en per tjänst.`,
      attachments
    });

    logService(`📧 Mail skickat med ${attachments.length} PDF:er`);

    // Städa temporära PDF:er
    for (const file of attachments) {
      fs.unlinkSync(file.path);
    }
    logService('Temporära PDF:er borttagna');
  } catch (err) {
    logService(`❌ Fel i tjänsten: ${err}`);
  }
})();
