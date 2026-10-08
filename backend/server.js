require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const telegram = require('./telegram');
const matcher = require('./matcher');
const ai = require('./ai');
const resumeParser = require('./resumeParser');
const { checkATSCompliance } = require('./atsChecker');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Multer memory storage for web file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static web dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/status', (req, res) => {
  res.send({
    status: 'online',
    service: 'JD Resume Matcher & ATS Format Checker',
    timestamp: new Date().toISOString(),
    telegramConnected: !!process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN.includes('your_'),
    activeBotSessions: Object.keys(matcher.sessions).length,
  });
});

/**
 * Web Dashboard Analysis API Endpoint
 * Handles uploaded JD file / text and multiple resume attachments.
 */
app.post(
  '/api/analyze',
  upload.fields([
    { name: 'jdFile', maxCount: 1 },
    { name: 'resumes', maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      let jdText = (req.body.jdText || '').trim();

      // Extract text from uploaded JD file if present
      if (req.files && req.files.jdFile && req.files.jdFile.length > 0) {
        const file = req.files.jdFile[0];
        jdText = await resumeParser.extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
      }

      if (!jdText || jdText.length < 20) {
        return res.status(400).json({
          error: 'Please paste a complete Job Description text or upload a valid JD PDF/DOCX file.',
        });
      }

      const resumeFiles = (req.files && req.files.resumes) || [];
      if (resumeFiles.length === 0) {
        return res.status(400).json({
          error: 'Please upload at least one candidate resume file (PDF or DOCX).',
        });
      }

      // Step 1: Parse JD
      console.log('🌐 Web API: Parsing Job Description...');
      const parsedJD = await ai.parseJobDescription(jdText);

      // Step 2: Extract & analyze candidate resumes
      const results = [];
      for (let i = 0; i < resumeFiles.length; i++) {
        const file = resumeFiles[i];
        console.log(`🌐 Web API: Analyzing candidate resume ${i + 1}/${resumeFiles.length}: ${file.originalname}`);
        const resumeText = await resumeParser.extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
        const analysis = await ai.analyzeCandidateVsJD(parsedJD, resumeText, file.originalname);
        results.push(analysis);
      }

      return res.json({
        success: true,
        parsedJD,
        results,
      });
    } catch (err) {
      console.error('❌ Web API Analysis Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to process JD and resumes.' });
    }
  }
);

// Fallback route to serve Dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Telegram Bot
const bot = telegram.initBot();

if (bot) {
  bot.on('message', (msg) => {
    matcher.handleIncomingMessage(bot, msg).catch((err) => {
      console.error(`❌ Error processing Telegram message from chat ${msg.chat.id}:`, err);
    });
  });

  bot.on('polling_error', (error) => {
    console.error('❌ Telegram Polling Error:', error.message);
  });
} else {
  console.log('💡 Note: Set TELEGRAM_BOT_TOKEN in .env to connect live Telegram Bot polling.');
}

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 JD Resume Matcher & ATS Format Checker Dashboard running on http://localhost:${PORT}`);
});
