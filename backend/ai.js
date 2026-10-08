const { OpenAI } = require('openai');
const { checkATSCompliance } = require('./atsChecker');

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes('your_')) {
    return null;
  }
  return new OpenAI({ apiKey });
}

// Comprehensive technology & domain keyword database
const TECH_KEYWORDS = [
  'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Node', 'Express', 'MERN', 'MEAN',
  'MongoDB', 'SQL', 'MySQL', 'PostgreSQL', 'Postgres', 'HTML', 'CSS', 'Git', 'GitHub', 'REST API', 'RESTful APIs',
  'Automation', 'QA', 'Selenium', 'Testing', 'Jest', 'Cypress', 'Spring', 'Spring Boot', 'AWS', 'Docker',
  'Kubernetes', 'CI/CD', 'Jenkins', 'Jira', 'Postman', 'Redux', 'Tailwind', 'Bootstrap', 'Next.js', 'Vue',
  'Angular', 'PHP', 'Laravel', 'C#', '.NET', 'Django', 'Flask', 'FastAPI', 'GraphQL', 'Linux', 'Agile',
  'Kafka', 'Redis', 'Elasticsearch', 'Problem Solving', 'Data Structures', 'Algorithms', 'Microservices'
];

/**
 * Fallback parser when OpenAI API key is missing or encounters errors.
 */
function fallbackParseJD(jdText) {
  const lines = jdText.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || 'Software Developer';

  const foundSkills = TECH_KEYWORDS.filter((s) => new RegExp(`\\b${s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'i').test(jdText));

  if (foundSkills.length === 0) {
    const wordMatches = jdText.match(/\b[A-Z][a-zA-B0-9+#.]{2,}\b/g) || [];
    const uniqueWords = Array.from(new Set(wordMatches)).filter((w) => !['Role', 'Type', 'Skills', 'We', 'Looking', 'The', 'Candidate', 'Work', 'Job', 'Description'].includes(w));
    foundSkills.push(...uniqueWords.slice(0, 8));
  }

  const reqSkills = foundSkills.slice(0, Math.max(2, Math.ceil(foundSkills.length * 0.7)));
  const prefSkills = foundSkills.slice(reqSkills.length);

  let jobTitle = firstLine.length < 60 ? firstLine : 'Software Developer / Engineer';
  const roleMatch = jdText.match(/Role:\s*([^\n]+)/i) || jdText.match(/Title:\s*([^\n]+)/i) || jdText.match(/Looking for a?\s*([^\n.]+)/i);
  if (roleMatch && roleMatch[1]) {
    jobTitle = roleMatch[1].trim();
  }

  return {
    jobTitle,
    requiredSkills: reqSkills.length > 0 ? reqSkills : ['Software Development', 'Problem Solving', 'Git'],
    preferredSkills: prefSkills.length > 0 ? prefSkills : ['Cloud Services', 'Docker'],
    experience: '1-3 years',
    responsibilities: lines.slice(1, 4),
    education: "Bachelor's degree in CS or equivalent",
    certifications: [],
  };
}

/**
 * Fallback candidate evaluation when OpenAI API key is missing.
 */
function fallbackAnalyzeCandidate(parsedJD, resumeText, filename) {
  const nameMatch = resumeText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
  let candidateName = nameMatch ? nameMatch[1] : filename.replace(/\.[^/.]+$/, '');
  if (['Resume', 'CV', 'Document'].includes(candidateName.trim())) {
    candidateName = filename.replace(/\.[^/.]+$/, '');
  }

  const reqSkills = parsedJD.requiredSkills || [];
  const prefSkills = parsedJD.preferredSkills || [];

  const matchingReq = reqSkills.filter((s) => new RegExp(`\\b${s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'i').test(resumeText));
  const missingReq = reqSkills.filter((s) => !matchingReq.includes(s));

  const matchingPref = prefSkills.filter((s) => new RegExp(`\\b${s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'i').test(resumeText));
  const missingPref = prefSkills.filter((s) => !matchingPref.includes(s));

  const techScore = reqSkills.length > 0 ? Math.round((matchingReq.length / reqSkills.length) * 100) : 75;
  const prefScore = prefSkills.length > 0 ? Math.round((matchingPref.length / prefSkills.length) * 100) : 50;

  const expScore = /year|yrs|experience|engineer|developer|intern/i.test(resumeText) ? 85 : 60;
  const projScore = /project|developed|built|managed|created|implemented/i.test(resumeText) ? 85 : 65;
  const eduScore = /bachelor|degree|b\.tech|b\.e|master|university|college|b\.sc|mca/i.test(resumeText) ? 100 : 70;

  const overallScore = Math.round(techScore * 0.50 + expScore * 0.20 + projScore * 0.15 + eduScore * 0.10 + prefScore * 0.05);

  let status = 'LOW MATCH';
  if (overallScore >= 90) status = 'HIGH MATCH';
  else if (overallScore >= 75) status = 'GOOD MATCH';
  else if (overallScore >= 60) status = 'PARTIAL MATCH';

  const allMissing = [...missingReq, ...missingPref];

  const suggestions = [];
  if (missingReq.length > 0) {
    missingReq.forEach((skill) => {
      suggestions.push(`Highlight practical experience or projects related to ${skill} to meet core JD requirements.`);
    });
  }
  if (matchingReq.length > 0) {
    suggestions.push(`Add measurable metrics (e.g. performance speed, latency, user counts) to your ${matchingReq.slice(0, 2).join(' & ')} project descriptions.`);
  }
  suggestions.push(`Ensure core technical keywords (${reqSkills.slice(0, 4).join(', ')}) appear prominently near top of resume for ATS filters.`);
  suggestions.push(`Align job titles and summary directly with "${parsedJD.jobTitle}".`);

  const courseRecommendations = [];
  if (allMissing.length > 0) {
    allMissing.forEach((skill) => courseRecommendations.push(`${skill} Fundamentals`));
  } else {
    (matchingReq.length > 0 ? matchingReq : reqSkills).forEach((skill) => {
      courseRecommendations.push(`Advanced ${skill} Architecture`);
    });
  }

  // ATS Format Compliance Audit
  const atsAudit = checkATSCompliance(resumeText, filename);

  return {
    candidateName,
    overallScore,
    status,
    technicalScore: techScore,
    experienceScore: expScore,
    projectScore: projScore,
    educationScore: eduScore,
    preferredSkillScore: prefScore,
    matchingSkills: [...matchingReq, ...matchingPref],
    missingSkills: allMissing,
    relatedSkills: [],
    experienceMatch: expScore >= 80 ? 'Strong experience alignment identified.' : 'Moderate experience identified in resume.',
    projectMatch: projScore >= 80 ? 'Projects align well with JD responsibilities.' : 'Basic project alignment identified.',
    educationMatch: eduScore === 100 ? 'Matches identified education requirement.' : 'Education details were not explicitly identified.',
    suggestions,
    courseRecommendations,
    atsAudit,
  };
}

/**
 * Parses raw Job Description text into structured JSON format.
 */
async function parseJobDescription(jdText) {
  const openai = getOpenAIClient();
  if (!openai) {
    console.log('ℹ️ OpenAI API key missing. Using smart fallback JD parser.');
    return fallbackParseJD(jdText);
  }

  const systemPrompt = `You are an expert HR AI assistant specializing in parsing Job Descriptions.
Extract structured information from the provided Job Description text.
Return ONLY a valid JSON object with the following fields:
{
  "jobTitle": "Extracted Job Title",
  "requiredSkills": ["Skill 1", "Skill 2"],
  "preferredSkills": ["Preferred Skill 1"],
  "experience": "Extracted required experience e.g. 1-3 years",
  "responsibilities": ["Responsibility 1", "Responsibility 2"],
  "education": "Extracted required education if any, else 'Not specified'",
  "certifications": ["Certification 1"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: jdText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.warn('⚠️ OpenAI API call failed, falling back to smart parser:', error.message);
    return fallbackParseJD(jdText);
  }
}

/**
 * Analyzes a candidate's resume text against a parsed Job Description.
 */
async function analyzeCandidateVsJD(parsedJD, resumeText, filename = 'Resume') {
  const openai = getOpenAIClient();
  const atsAudit = checkATSCompliance(resumeText, filename);

  if (!openai) {
    console.log(`ℹ️ OpenAI API key missing. Using smart resume matcher for ${filename}.`);
    return fallbackAnalyzeCandidate(parsedJD, resumeText, filename);
  }

  const systemPrompt = `You are a strict, objective, AI-powered Resume Matcher evaluating a candidate's resume strictly against a Job Description.

CRITICAL RULES:
1. Never invent skills, experience, projects, or certifications.
2. Base candidate information ONLY on the provided resume content.
3. Extract candidate's real name from the resume. If not found, use filename "${filename.replace(/\.[^/.]+$/, '')}".
4. ALWAYS provide 3-5 specific, actionable suggestions/corrections for improving the resume.
5. ALWAYS provide 2-5 course recommendations for missing skills or advanced skill gaps.

Calculate overallScore:
overallScore = Math.round(technicalScore * 0.50 + experienceScore * 0.20 + projectScore * 0.15 + educationScore * 0.10 + preferredSkillScore * 0.05)

STATUS:
- 90–100 → "HIGH MATCH"
- 75–89  → "GOOD MATCH"
- 60–74  → "PARTIAL MATCH"
- 0–59   → "LOW MATCH"

Return ONLY a valid JSON object matching the required schema.`;

  const userPrompt = `JOB DESCRIPTION REQUIREMENTS:
${JSON.stringify(parsedJD, null, 2)}

CANDIDATE RESUME TEXT:
${resumeText}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const tech = typeof result.technicalScore === 'number' ? result.technicalScore : 50;
    const exp = typeof result.experienceScore === 'number' ? result.experienceScore : 50;
    const proj = typeof result.projectScore === 'number' ? result.projectScore : 50;
    const edu = typeof result.educationScore === 'number' ? result.educationScore : 50;
    const pref = typeof result.preferredSkillScore === 'number' ? result.preferredSkillScore : 50;

    const computedOverall = Math.round(tech * 0.50 + exp * 0.20 + proj * 0.15 + edu * 0.10 + pref * 0.05);
    result.overallScore = computedOverall;

    if (computedOverall >= 90) result.status = 'HIGH MATCH';
    else if (computedOverall >= 75) result.status = 'GOOD MATCH';
    else if (computedOverall >= 60) result.status = 'PARTIAL MATCH';
    else result.status = 'LOW MATCH';

    result.atsAudit = atsAudit;
    return result;
  } catch (error) {
    console.warn('⚠️ OpenAI API call failed, falling back to smart matcher:', error.message);
    return fallbackAnalyzeCandidate(parsedJD, resumeText, filename);
  }
}

module.exports = {
  parseJobDescription,
  analyzeCandidateVsJD,
};
