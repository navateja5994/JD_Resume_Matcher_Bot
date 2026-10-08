const telegram = require('./telegram');
const ai = require('./ai');
const resumeParser = require('./resumeParser');

// In-memory session store: chatId -> Session object
const sessions = {};

/**
 * Get or create session for a given chat ID.
 * @param {number|string} chatId 
 * @returns {Object}
 */
function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = {
      state: 'WAITING_FOR_JD',
      rawJD: '',
      parsedJD: null,
      resumes: [], // Array of { id, filename, mimeType, text }
      results: [], // Array of candidate analysis JSON objects
    };
  }
  return sessions[chatId];
}

/**
 * Returns emoji string for status.
 * @param {string} status 
 * @returns {string}
 */
function getStatusEmoji(status) {
  if (status === 'HIGH MATCH') return '🟢';
  if (status === 'GOOD MATCH') return '🟢';
  if (status === 'PARTIAL MATCH') return '🟡';
  return '🔴';
}

/**
 * Generates direct clickable markdown links for learning platforms based on skill/course name.
 * @param {string} topic 
 * @returns {string}
 */
function generateCourseLinks(topic) {
  const query = encodeURIComponent(`${topic} tutorial course`);
  const courseraUrl = `https://www.coursera.org/search?query=${encodeURIComponent(topic)}`;
  const udemyUrl = `https://www.udemy.com/courses/search/?q=${encodeURIComponent(topic)}`;
  const youtubeUrl = `https://www.youtube.com/results?search_query=${query}`;

  return `🔗 *Learning Links:*
• [Coursera Search](${courseraUrl})
• [Udemy Search](${udemyUrl})
• [YouTube Free Tutorial](${youtubeUrl})`;
}

/**
 * Handle incoming Telegram message (text or document).
 * @param {TelegramBot} bot 
 * @param {Object} msg - Telegram message object
 */
async function handleIncomingMessage(bot, msg) {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  const text = (msg.text || msg.caption || '').trim();
  const upperText = text.toUpperCase();

  console.log(`📩 Telegram message from ${chatId} | Text: "${text}" | Document: ${msg.document ? msg.document.file_name : 'none'} | State: ${session.state}`);

  // Handle global commands
  if (upperText === '/START' || upperText === 'HI' || upperText === 'HELLO' || upperText === 'START') {
    return await handleGreeting(bot, chatId, session);
  }

  if (upperText === '/HELP' || upperText === 'HELP') {
    return await handleHelp(bot, chatId);
  }

  if (upperText === '/RESET' || upperText === 'RESET') {
    return await handleReset(bot, chatId);
  }

  if (upperText === '/RESULT' || upperText === 'RESULT') {
    if (session.results && session.results.length > 0) {
      return await sendFinalResultsSummary(bot, chatId, session);
    } else {
      return await telegram.sendMessage(
        bot,
        chatId,
        '⚠️ No analysis results available yet.\n\nPlease upload a Job Description and resumes, then type /analyze.'
      );
    }
  }

  if (upperText === '/ANALYZE' || upperText === 'ANALYZE') {
    return await handleAnalyze(bot, chatId, session);
  }

  // Handle results selection options (1-N, 5, 6, 7, 8)
  if (session.results && session.results.length > 0) {
    if (upperText === '5') {
      return await handleSkillComparison(bot, chatId, session);
    }
    if (upperText === '6') {
      return await handleResumeSuggestions(bot, chatId, session);
    }
    if (upperText === '7') {
      return await handleCourseRecommendations(bot, chatId, session);
    }
    if (upperText === '8') {
      return await handleATSAuditReport(bot, chatId, session);
    }

    const numIndex = parseInt(upperText, 10);
    if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= session.results.length) {
      return await handleCandidateDetails(bot, chatId, session, numIndex - 1);
    }
  }

  // Handle Document Uploads (PDF / DOCX for JD or Resumes)
  if (msg.document) {
    return await handleDocumentUpload(bot, chatId, session, msg.document);
  }

  // Handle Text Inputs based on session state
  if (text) {
    if (session.state === 'WAITING_FOR_JD') {
      return await handleJobDescriptionInput(bot, chatId, session, text);
    }

    if (session.state === 'WAITING_FOR_RESUMES') {
      return await telegram.sendMessage(
        bot,
        chatId,
        `📄 Current status: *${session.resumes.length}* resume(s) uploaded.\n\nSend another PDF/DOCX resume file, or type */analyze* to start AI analysis.`
      );
    }

    if (session.state === 'ANALYZED') {
      return await telegram.sendMessage(
        bot,
        chatId,
        `📊 Analysis complete for *${session.results.length}* candidate(s).\n\nReply with candidate number (1-${session.results.length}), *5* for skills matrix, *6* for suggestions, *7* for course links, *8* for ATS audit, or */reset* to start over.`
      );
    }
  }

  // Fallback
  return await handleGreeting(bot, chatId, session);
}

/**
 * Greeting message handler
 */
async function handleGreeting(bot, chatId, session) {
  const message = `👋 Welcome to Telegram JD Resume Matcher & ATS Format Checker!

I compare multiple resumes against a Job Description and audit ATS formatting compliance.

📌 Steps:
1️⃣ Send Job Description (as text OR upload a PDF/DOCX file)
2️⃣ Upload candidate resumes (PDF/DOCX files)
3️⃣ Send /analyze or type ANALYZE
4️⃣ Get match scores & ATS format compliance check
5️⃣ Access direct course learning links & ATS formatting fixes

📄 Please send the Job Description (text or PDF file).`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Help message handler
 */
async function handleHelp(bot, chatId) {
  const message = `🤖 Telegram JD Resume Matcher & ATS Checker

/analyze → Analyze uploaded resumes & check ATS format
/result → Show latest results summary
1–4 → View individual candidate details & ATS audit
5 → View skill comparison matrix
6 → View resume suggestions & corrections
7 → View course recommendations & links
8 → View ATS format compliance audit report
/reset → Start new analysis session
/help → Command list`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Reset session handler
 */
async function handleReset(bot, chatId) {
  sessions[chatId] = {
    state: 'WAITING_FOR_JD',
    rawJD: '',
    parsedJD: null,
    resumes: [],
    results: [],
  };

  const message = `🔄 Session reset!

📄 Please send a new Job Description (text or PDF/DOCX file) to begin.`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Handle incoming Job Description text or extracted text
 */
async function handleJobDescriptionInput(bot, chatId, session, text) {
  if (text.length < 20) {
    await telegram.sendMessage(
      bot,
      chatId,
      '⚠️ The Job Description text seems too short. Please paste or upload a complete Job Description.'
    );
    return;
  }

  await telegram.sendMessage(bot, chatId, '⏳ Processing Job Description with AI...');

  try {
    const parsed = await ai.parseJobDescription(text);
    session.rawJD = text;
    session.parsedJD = parsed;
    session.state = 'WAITING_FOR_RESUMES';

    const reqSkillsFormatted = (parsed.requiredSkills || []).map((s) => `• ${s}`).join('\n');
    const prefSkillsFormatted = (parsed.preferredSkills || []).map((s) => `• ${s}`).join('\n') || '• None specified';

    const response = `✅ Job Description received!

🎯 Role:
*${parsed.jobTitle || 'Job Position'}*

💻 Required Skills:
${reqSkillsFormatted || '• As specified in description'}

⭐ Preferred:
${prefSkillsFormatted}

💼 Experience:
${parsed.experience || 'Not specified'}

Now upload candidate resumes (PDF or DOCX).

You can upload multiple resume files.`;

    await telegram.sendMessage(bot, chatId, response);
  } catch (error) {
    console.error('Failed to parse JD:', error.message);
    await telegram.sendMessage(
      bot,
      chatId,
      `⚠️ Error parsing Job Description: ${error.message}. Please try sending the JD again.`
    );
  }
}

/**
 * Handle document (PDF/DOCX) upload for Job Description or Resumes
 */
async function handleDocumentUpload(bot, chatId, session, doc) {
  const fileId = doc.file_id;
  const filename = doc.file_name || 'Document.pdf';
  const mimeType = doc.mime_type || '';

  // Check if user is uploading the Job Description as a PDF/DOCX file
  if (session.state === 'WAITING_FOR_JD') {
    await telegram.sendMessage(bot, chatId, `📥 Receiving Job Description document: *${filename}*...`);

    try {
      const buffer = await telegram.downloadTelegramFile(bot, fileId);
      const text = await resumeParser.extractTextFromBuffer(buffer, mimeType, filename);
      return await handleJobDescriptionInput(bot, chatId, session, text);
    } catch (error) {
      console.error('Error parsing JD document:', error.message);
      return await telegram.sendMessage(
        bot,
        chatId,
        `⚠️ Could not read Job Description document (*${filename}*). Please paste the JD as text or upload a valid text-based PDF.`
      );
    }
  }

  // Otherwise, user is uploading a Candidate Resume PDF/DOCX
  await telegram.sendMessage(bot, chatId, `📥 Receiving resume: *${filename}*...`);

  try {
    const buffer = await telegram.downloadTelegramFile(bot, fileId);
    const text = await resumeParser.extractTextFromBuffer(buffer, mimeType, filename);

    session.resumes.push({
      id: session.resumes.length + 1,
      filename,
      mimeType,
      text,
    });

    const response = `✅ Resume received!

📄 Resume:
*${filename}*

📊 Total resumes:
*${session.resumes.length}*

Upload another resume file, or send /analyze to compare.`;

    await telegram.sendMessage(bot, chatId, response);
  } catch (error) {
    console.error('Error handling Telegram document upload:', error.message);
    const errorMsg = `⚠️ Could not read resume (*${filename}*).

Please upload a text-based PDF or DOCX document file.`;
    await telegram.sendMessage(bot, chatId, errorMsg);
  }
}

/**
 * Handle ANALYZE command
 */
async function handleAnalyze(bot, chatId, session) {
  if (!session.parsedJD) {
    return await telegram.sendMessage(bot, chatId, '⚠️ Please send or upload the Job Description first.');
  }

  if (!session.resumes || session.resumes.length === 0) {
    return await telegram.sendMessage(bot, chatId, '⚠️ Please upload at least one candidate resume (PDF or DOCX).');
  }

  const progressMsg = `🔍 Analyzing candidate resumes & checking ATS format compliance...

📄 Resumes: *${session.resumes.length}*
🎯 Role: *${session.parsedJD.jobTitle || 'Job Position'}*

Please wait...`;

  await telegram.sendMessage(bot, chatId, progressMsg);

  session.results = [];

  try {
    for (let i = 0; i < session.resumes.length; i++) {
      const resume = session.resumes[i];
      console.log(`Analyzing resume ${i + 1}/${session.resumes.length}: ${resume.filename}`);
      const analysis = await ai.analyzeCandidateVsJD(session.parsedJD, resume.text, resume.filename);
      session.results.push(analysis);
    }

    session.state = 'ANALYZED';
    await sendFinalResultsSummary(bot, chatId, session);
  } catch (error) {
    console.error('Error during Telegram analysis:', error.message);
    await telegram.sendMessage(
      bot,
      chatId,
      `⚠️ Error during AI analysis: ${error.message}. Send /analyze to try again.`
    );
  }
}

/**
 * Send final results summary message
 */
async function sendFinalResultsSummary(bot, chatId, session) {
  const total = session.results.length;
  const role = session.parsedJD ? session.parsedJD.jobTitle : 'Job Position';

  let candidateListText = '';
  session.results.forEach((c, index) => {
    const num = index + 1;
    const emoji = getStatusEmoji(c.status);
    const atsEmoji = c.atsAudit ? c.atsAudit.statusEmoji : '📝';
    const atsScore = c.atsAudit ? `${c.atsAudit.atsScore}/100` : 'Checked';

    candidateListText += `${num}️⃣ *${c.candidateName}*\n🎯 JD Match: ${c.overallScore}/100 (${emoji} ${c.status})\n📝 ATS Score: ${atsScore} (${atsEmoji} ${c.atsAudit ? c.atsAudit.status : 'OK'})\n\n`;
  });

  let menuText = '';
  session.results.forEach((c, index) => {
    menuText += `${index + 1} → ${c.candidateName} details\n`;
  });

  const message = `📊 JD MATCHING & ATS COMPLIANCE REPORT

🎯 Role:
*${role}*

📄 Resumes analyzed:
*${total}*

━━━━━━━━━━━━━━━━

${candidateListText.trim()}

━━━━━━━━━━━━━━━━

Reply with:

${menuText}5 → Skill comparison
6 → Resume suggestions
7 → Course recommendations & links
8 → ATS format audit report

/reset → New analysis`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Candidate Details handler
 */
async function handleCandidateDetails(bot, chatId, session, index) {
  const c = session.results[index];
  if (!c) return;

  const emoji = getStatusEmoji(c.status);

  const matchingSkillsStr = (c.matchingSkills || []).map((s) => `• ${s}`).join('\n') || 'None identified.';
  const missingSkillsStr = (c.missingSkills || []).map((s) => `• ${s}`).join('\n') || 'None.';
  const relatedSkillsStr = (c.relatedSkills || []).map((s) => `• ${s}`).join('\n') || 'None identified.';
  const suggestionsStr = (c.suggestions || []).map((s) => `• ${s}`).join('\n') || '• No specific suggestions.';

  let learningStr = '';
  const missing = c.missingSkills || [];
  const recs = c.courseRecommendations || [];

  if (missing.length === 0 && recs.length === 0) {
    learningStr = '• All required skills identified in resume!';
  } else {
    const combinedTopics = Array.from(new Set([...missing, ...recs.map((r) => r.replace(/ Fundamentals| Architecture| Course/i, ''))]));
    combinedTopics.forEach((skill) => {
      learningStr += `*${skill} Course*\n${generateCourseLinks(skill)}\n\n`;
    });
  }

  const atsSummary = c.atsAudit ? `${c.atsAudit.statusEmoji} ${c.atsAudit.status} (${c.atsAudit.atsScore}/100 ATS Score)` : 'Audited';

  const message = `👤 CANDIDATE DETAILS

Name:
*${c.candidateName}*

🎯 Match Score: *${c.overallScore}/100* (${emoji} *${c.status}*)
📝 ATS Compliance: *${atsSummary}*

━━━━━━━━━━━━━━

✅ MATCHING SKILLS

${matchingSkillsStr}

❌ MISSING SKILLS

${missingSkillsStr}

🟡 RELATED SKILLS

${relatedSkillsStr}

💼 EXPERIENCE

${c.experienceMatch || 'Evaluated against requirements.'}

📁 PROJECTS

${c.projectMatch || 'Evaluated against responsibilities.'}

🎓 EDUCATION

${c.educationMatch || 'Evaluated against requirements.'}

━━━━━━━━━━━━━━

💡 SUGGESTIONS & CORRECTIONS

${suggestionsStr}

━━━━━━━━━━━━━━

📚 RECOMMENDED COURSES & LINKS

${learningStr.trim()}`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Skill Comparison matrix handler
 */
async function handleSkillComparison(bot, chatId, session) {
  const results = session.results;
  if (!results || results.length === 0) return;

  const reqSkills = session.parsedJD?.requiredSkills || [];
  const prefSkills = session.parsedJD?.preferredSkills || [];
  const skillSet = new Set([...reqSkills, ...prefSkills]);

  results.forEach((c) => {
    (c.matchingSkills || []).forEach((s) => skillSet.add(s));
    (c.missingSkills || []).forEach((s) => skillSet.add(s));
  });

  const allSkills = Array.from(skillSet).slice(0, 12);
  const candidateNames = results.map((c) => c.candidateName.split(' ')[0].slice(0, 8));

  let header = 'Skill'.padEnd(14);
  candidateNames.forEach((name) => {
    header += name.padEnd(8);
  });

  let separator = '-'.repeat(Math.min(header.length + 4, 32));

  let rows = [];
  allSkills.forEach((skill) => {
    let row = skill.slice(0, 13).padEnd(14);
    results.forEach((c) => {
      const hasSkill = (c.matchingSkills || []).some(
        (s) => s.toLowerCase() === skill.toLowerCase()
      );
      const isMissing = (c.missingSkills || []).some(
        (s) => s.toLowerCase() === skill.toLowerCase()
      );
      const mark = hasSkill ? '✅' : isMissing ? '❌' : '⚪';
      row += mark.padEnd(6);
    });
    rows.push(row);
  });

  const message = `📊 SKILL COMPARISON

\`\`\`
${header}
${separator}
${rows.join('\n')}
\`\`\``;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Resume Suggestions handler
 */
async function handleResumeSuggestions(bot, chatId, session) {
  let suggestionsText = '';

  session.results.forEach((c) => {
    suggestionsText += `*${c.candidateName}:*\n\n`;
    const list = c.suggestions || [];
    if (list.length === 0) {
      suggestionsText += `No actionable suggestions.\n\n`;
    } else {
      list.forEach((sug, idx) => {
        const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
        const numEmoji = numEmojis[idx] || `${idx + 1}.`;
        suggestionsText += `${numEmoji} ${sug}\n\n`;
      });
    }
  });

  const message = `💡 RESUME SUGGESTIONS & CORRECTIONS

${suggestionsText.trim()}`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * Course Recommendations handler with direct course search links
 */
async function handleCourseRecommendations(bot, chatId, session) {
  const topicsSet = new Set();

  session.results.forEach((c) => {
    (c.missingSkills || []).forEach((s) => topicsSet.add(s));
    (c.courseRecommendations || []).forEach((r) => topicsSet.add(r.replace(/ Fundamentals| Architecture| Course/i, '')));
  });

  if (topicsSet.size === 0) {
    (session.parsedJD?.requiredSkills || []).forEach((s) => topicsSet.add(s));
  }

  let courseListText = '';
  let count = 1;
  const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

  topicsSet.forEach((topic) => {
    const numEmoji = numEmojis[count - 1] || `${count}.`;
    const courseTitle = `${topic} Mastery`;
    const reason = `Enhance your proficiency in ${topic} for higher match scores against target Job Descriptions.`;
    const links = generateCourseLinks(topic);

    courseListText += `${numEmoji} *${courseTitle}*\nWhy:\n${reason}\n\n${links}\n\n━━━━━━━━━━━━━━━━\n\n`;
    count++;
  });

  const message = `📚 RECOMMENDED LEARNING & COURSE LINKS

${courseListText.trim()}`;

  await telegram.sendMessage(bot, chatId, message);
}

/**
 * ATS Format Compliance Audit Report handler (Option 8)
 */
async function handleATSAuditReport(bot, chatId, session) {
  let atsText = '';

  session.results.forEach((c) => {
    const audit = c.atsAudit;
    if (!audit) return;

    const emoji = audit.statusEmoji;
    atsText += `👤 *Candidate: ${c.candidateName}*\n`;
    atsText += `📝 ATS Score: *${audit.atsScore}/100* (${emoji} *${audit.status}*)\n\n`;

    atsText += `📌 *Format Checks:*\n`;
    atsText += `• Section Headings: ${audit.checks.headings.pass ? '✅ Passed' : '⚠️ Missing'} (${audit.checks.headings.found.length}/5 standard headings found)\n`;
    atsText += `• Contact Info: ${audit.checks.contactInfo.email ? '✅ Email' : '❌ No Email'}, ${audit.checks.contactInfo.phone ? '✅ Phone' : '❌ No Phone'}, ${audit.checks.contactInfo.linkedin ? '✅ LinkedIn' : '⚪ No LinkedIn'}\n`;
    atsText += `• Action Verbs: ${audit.checks.actionVerbs.count} strong verbs identified\n`;
    atsText += `• Quantifiable Metrics: ${audit.checks.metrics.count} impact numbers found\n\n`;

    if (audit.recommendations.length > 0) {
      atsText += `💡 *ATS Formatting Fixes:*\n`;
      audit.recommendations.forEach((rec) => {
        atsText += `• ${rec}\n`;
      });
    }

    atsText += `\n━━━━━━━━━━━━━━━━\n\n`;
  });

  const message = `📝 ATS FORMAT & COMPLIANCE AUDIT REPORT

${atsText.trim()}`;

  await telegram.sendMessage(bot, chatId, message);
}

module.exports = {
  handleIncomingMessage,
  sessions,
};
