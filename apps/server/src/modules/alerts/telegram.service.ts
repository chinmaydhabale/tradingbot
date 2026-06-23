import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

@Injectable()
export class TelegramService {
  private botToken: string;
  private chatId: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID') || '';
  }

  /**
   * Dispatches warning, decay, or execution alerts to a Telegram chat
   */
  async sendAlert(message: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      // Telegram not configured, skip silently
      return false;
    }

    const payload = JSON.stringify({
      chat_id: this.chatId,
      text: `🔔 *TRADINGGURU ALERT*\n\n${message}`,
      parse_mode: 'Markdown',
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${this.botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            console.error('Telegram API response error:', body);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.error('Telegram request connection error:', error);
        resolve(false);
      });

      req.write(payload);
      req.end();
    });
  }
}
