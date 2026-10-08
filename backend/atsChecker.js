/**
 * ATS (Applicant Tracking System) Resume Compliance Checker
 * Analyzes resume text for ATS readability, standard headings, contact info,
 * action verbs, quantifiable metrics, and formatting risks.
 */

function checkATSCompliance(resumeText = '', filename = '') {
  const text = resumeText.trim();
  const lowerText = text.toLowerCase();

  const checks = {
    contactInfo: { pass: false, email: false, phone: false, linkedin: false, github: false, score: 0 },
    headings: { pass: false, found: [], missing: [], score: 0 },
    readability: { pass: false, wordCount: 0, isScannedPdf: false, score: 0 },
    actionVerbs: { pass: false, count: 0, verbsFound: [], score: 0 },
    metrics: { pass: false, count: 0, score: 0 },
  };

  const recommendations = [];

  // 1. Readability & Length Check
  const words = text.split(/\s+/).filter(Boolean);
  checks.readability.wordCount = words.length;

  if (words.length < 80) {
    checks.readability.isScannedPdf = true;
    checks.readability.score = 20;
    recommendations.push('⚠️ High Risk: Resume appears to be a scanned image PDF or has very low word count. ATS parsers cannot read images. Convert to text-based PDF or DOCX.');
  } else if (words.length > 1200) {
    checks.readability.score = 70;
    recommendations.push('💡 Resume length exceeds 1200 words (3+ pages). Trim to 1-2 pages for better ATS parsing and recruiter readability.');
  } else {
    checks.readability.pass = true;
    checks.readability.score = 100;
  }

  // 2. Contact Information Check
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) || text.match(/\b\d{10}\b/);
  const linkedinMatch = /linkedin/i.test(text);
  const githubMatch = /github/i.test(text);

  checks.contactInfo.email = !!emailMatch;
  checks.contactInfo.phone = !!phoneMatch;
  checks.contactInfo.linkedin = linkedinMatch;
  checks.contactInfo.github = githubMatch;

  let contactScore = 0;
  if (checks.contactInfo.email) contactScore += 40;
  if (checks.contactInfo.phone) contactScore += 30;
  if (checks.contactInfo.linkedin) contactScore += 15;
  if (checks.contactInfo.github) contactScore += 15;
  checks.contactInfo.score = contactScore;
  checks.contactInfo.pass = contactScore >= 70;

  if (!checks.contactInfo.email) recommendations.push('❌ Critical: Email address not detected. Add a clear, professional email address at top.');
  if (!checks.contactInfo.phone) recommendations.push('❌ Critical: Phone number not detected. Add contact phone number.');
  if (!checks.contactInfo.linkedin) recommendations.push('💡 Recommendation: Add your LinkedIn profile URL (e.g. linkedin.com/in/username).');

  // 3. Standard Headings Check
  const standardHeadings = [
    { name: 'Summary / Objective', regex: /summary|objective|profile|about me/i },
    { name: 'Skills / Technical Proficiencies', regex: /skills|technical skills|proficiencies|technologies|core competencies/i },
    { name: 'Experience / Employment', regex: /experience|employment|work history|career|internships/i },
    { name: 'Education', regex: /education|academic|qualification|degrees/i },
    { name: 'Projects', regex: /projects|academic projects|key projects/i },
  ];

  standardHeadings.forEach((h) => {
    if (h.regex.test(text)) {
      checks.headings.found.push(h.name);
    } else {
      checks.headings.missing.push(h.name);
    }
  });

  const headingScore = Math.round((checks.headings.found.length / standardHeadings.length) * 100);
  checks.headings.score = headingScore;
  checks.headings.pass = headingScore >= 80;

  if (checks.headings.missing.length > 0) {
    recommendations.push(`📌 Missing Standard ATS Headings: Use clear section headers like ${checks.headings.missing.slice(0, 2).map((m) => `"${m.split('/')[0].trim()}"`).join(', ')}.`);
  }

  // 4. Action Verbs Check
  const commonVerbs = [
    'developed', 'engineered', 'implemented', 'designed', 'built', 'optimized',
    'managed', 'led', 'created', 'automated', 'collaborated', 'delivered',
    'architected', 'tested', 'improved', 'spearheaded', 'reduced', 'increased',
    'launched', 'integrated', 'debugged', 'maintained', 'configured', 'resolved'
  ];

  const foundVerbs = Array.from(new Set(commonVerbs.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(text))));
  checks.actionVerbs.count = foundVerbs.length;
  checks.actionVerbs.verbsFound = foundVerbs;

  if (foundVerbs.length >= 8) {
    checks.actionVerbs.score = 100;
    checks.actionVerbs.pass = true;
  } else if (foundVerbs.length >= 4) {
    checks.actionVerbs.score = 75;
    checks.actionVerbs.pass = true;
  } else {
    checks.actionVerbs.score = 40;
    recommendations.push('⚡ Weak Action Verbs: Begin bullet points with strong action verbs (e.g. "Spearheaded", "Engineered", "Optimized", "Automated").');
  }

  // 5. Quantifiable Metrics & Numbers Check
  const metricMatches = text.match(/\b\d+%\b|\b\d+\+\s*years?|\$\d+|\b\d+\s*(users|clients|requests|ms|sec|kb|mb|gb|tb|team members|projects)\b|\b(increased|reduced|improved|saved)\s+by\s+\d+/gi) || [];
  checks.metrics.count = metricMatches.length;

  if (metricMatches.length >= 5) {
    checks.metrics.score = 100;
    checks.metrics.pass = true;
  } else if (metricMatches.length >= 2) {
    checks.metrics.score = 75;
    checks.metrics.pass = true;
  } else {
    checks.metrics.score = 35;
    recommendations.push('📊 Missing Quantifiable Impact: Include numbers and metrics in bullet points (e.g. "Improved query performance by 40%", "Built API handling 10k+ requests/day").');
  }

  // Overall ATS Compliance Score Calculation
  const overallAtsScore = Math.round(
    checks.headings.score * 0.25 +
    checks.contactInfo.score * 0.20 +
    checks.readability.score * 0.25 +
    checks.actionVerbs.score * 0.15 +
    checks.metrics.score * 0.15
  );

  let status = 'FAIL (High ATS Risk)';
  let statusEmoji = '🔴';
  if (overallAtsScore >= 80) {
    status = 'PASS (ATS Friendly)';
    statusEmoji = '🟢';
  } else if (overallAtsScore >= 65) {
    status = 'NEEDS IMPROVEMENT';
    statusEmoji = '🟡';
  }

  return {
    filename,
    atsScore: overallAtsScore,
    status,
    statusEmoji,
    checks,
    recommendations,
    summary: `${statusEmoji} ${status} (${overallAtsScore}/100 ATS Compliance Score)`,
  };
}

module.exports = {
  checkATSCompliance,
};
