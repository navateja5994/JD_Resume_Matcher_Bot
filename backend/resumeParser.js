const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract plain text content from PDF or DOCX binary buffer.
 * @param {Buffer} buffer - File content buffer
 * @param {string} mimeType - MIME type if available
 * @param {string} filename - Original filename if available
 * @returns {Promise<string>} Extracted text string
 */
async function extractTextFromBuffer(buffer, mimeType = '', filename = '') {
  const isPdf = mimeType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
  const isDocx =
    mimeType.includes('officedocument') ||
    mimeType.includes('word') ||
    filename.toLowerCase().endsWith('.docx');

  if (isPdf) {
    try {
      const data = await pdfParse(buffer);
      const extractedText = (data.text || '').trim();
      if (!extractedText) {
        throw new Error('Extracted text is empty. PDF may be scanned or image-based.');
      }
      return extractedText;
    } catch (err) {
      console.error('Error in pdf-parse:', err.message);
      throw new Error(`Failed to parse PDF file: ${err.message}`);
    }
  } else if (isDocx) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = (result.value || '').trim();
      if (!extractedText) {
        throw new Error('Extracted text is empty.');
      }
      return extractedText;
    } catch (err) {
      console.error('Error in mammoth:', err.message);
      throw new Error(`Failed to parse DOCX file: ${err.message}`);
    }
  } else {
    // Fallback: try reading string if simple text
    const utf8Text = buffer.toString('utf-8').trim();
    if (utf8Text && utf8Text.length > 20 && /^[\x00-\x7F\s]+$/.test(utf8Text.slice(0, 100))) {
      return utf8Text;
    }
    throw new Error('Unsupported document format. Please upload a PDF or DOCX file.');
  }
}

module.exports = {
  extractTextFromBuffer,
};
