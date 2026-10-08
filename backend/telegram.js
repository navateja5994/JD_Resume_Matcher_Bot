const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

let botInstance = null;

/**
 * Initializes Telegram bot instance.
 * Supports both long polling and webhooks.
 * @returns {TelegramBot|null}
 */
function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.includes('your_')) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN is missing or dummy. Bot polling disabled.');
    return null;
  }

  if (!botInstance) {
    botInstance = new TelegramBot(token, { polling: true });
    console.log('🤖 Telegram Bot polling started successfully!');
  }

  return botInstance;
}

/**
 * Send text message to a Telegram chat ID.
 * @param {TelegramBot} bot 
 * @param {number|string} chatId 
 * @param {string} text 
 * @param {Object} options 
 */
async function sendMessage(bot, chatId, text, options = {}) {
  if (!bot) {
    console.log(`[TELEGRAM OUT -> Chat ${chatId}]:\n${text}`);
    return;
  }

  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    // Fallback without Markdown if parsing fails due to special characters
    return await bot.sendMessage(chatId, text, options);
  }
}

/**
 * Downloads document file buffer from Telegram servers using fileId.
 * @param {TelegramBot} bot 
 * @param {string} fileId 
 * @returns {Promise<Buffer>}
 */
async function downloadTelegramFile(bot, fileId) {
  if (!bot) {
    throw new Error('Telegram bot instance is not initialized.');
  }

  try {
    const fileLink = await bot.getFileLink(fileId);
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Error downloading Telegram file:', error.message);
    throw new Error(`Failed to download Telegram attachment: ${error.message}`);
  }
}

module.exports = {
  initBot,
  sendMessage,
  downloadTelegramFile,
};
