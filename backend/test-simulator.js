require('dotenv').config();
const matcher = require('./matcher');
const telegram = require('./telegram');
const ai = require('./ai');
const resumeParser = require('./resumeParser');

// Intercept telegram.sendMessage for local console output
telegram.sendMessage = async (bot, chatId, text) => {
  console.log(`\n=================== BOT RESPONSE TO CHAT ${chatId} ===================\n`);
  console.log(text);
  console.log(`\n=====================================================================\n`);
};

// Intercept resumeParser for mock documents
resumeParser.extractTextFromBuffer = async (buffer, mimeType, filename) => {
  if (filename.includes('JobDescription')) {
    return `We are looking for a Senior Java Full Stack Developer.
Required Skills: Java, Spring Boot, React, MySQL, REST APIs, Git
Preferred: AWS, Docker
Experience: 1-3 years`;
  }
  if (filename.includes('Rahul')) {
    return `Rahul Sharma
Email: rahul@example.com
Education: B.Tech Computer Science
SKILLS: Java, Spring Boot, React, MySQL, REST APIs, Git
EXPERIENCE: Software Engineer (2.5 years)`;
  }
  if (filename.includes('Priya')) {
    return `Priya Patel
Education: B.E IT
SKILLS: Java, Spring Boot, React, REST APIs, Git, AWS
EXPERIENCE: Full Stack Engineer (3 years)`;
  }
  return 'Sample Resume Text';
};

// Mock download
telegram.downloadTelegramFile = async (bot, fileId) => {
  return Buffer.from('MOCK_FILE_BUFFER');
};

async function runSimulation() {
  const dummyBot = null;
  const chatId = 987654321;

  console.log('\n--- STEP 1: USER SENDS "/start" ---');
  await matcher.handleIncomingMessage(dummyBot, { chat: { id: chatId }, text: '/start' });

  console.log('\n--- STEP 2: USER UPLOADS JOB DESCRIPTION AS A PDF DOCUMENT ---');
  await matcher.handleIncomingMessage(dummyBot, {
    chat: { id: chatId },
    document: { file_id: 'mock_jd_pdf', file_name: 'JobDescription_SeniorDev.pdf', mime_type: 'application/pdf' },
  });

  console.log('\n--- STEP 3: USER UPLOADS RESUME DOCUMENTS ---');
  await matcher.handleIncomingMessage(dummyBot, {
    chat: { id: chatId },
    document: { file_id: 'mock_rahul', file_name: 'Rahul_Resume.pdf', mime_type: 'application/pdf' },
  });

  await matcher.handleIncomingMessage(dummyBot, {
    chat: { id: chatId },
    document: { file_id: 'mock_priya', file_name: 'Priya_Resume.pdf', mime_type: 'application/pdf' },
  });

  console.log('\n--- STEP 4: USER SENDS "/analyze" ---');
  await matcher.handleIncomingMessage(dummyBot, { chat: { id: chatId }, text: '/analyze' });

  console.log('\n--- STEP 5: USER REQUESTS COURSE RECOMMENDATIONS WITH LINKS ("7") ---');
  await matcher.handleIncomingMessage(dummyBot, { chat: { id: chatId }, text: '7' });

  console.log('\n🎉 TELEGRAM ENHANCED FEATURE SIMULATION COMPLETED!');
}

runSimulation().catch(console.error);
