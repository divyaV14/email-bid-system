import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { google } from 'googleapis';
import { AuthService } from '../auth/auth.service';
import { Email } from '../entities/email.entity';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

interface EmailAttachment {
  name: string;
  driveFileId: string;
  mimeType: string;
  size: number;
}

interface EmailQueryParams {
  page: number;
  limit: number;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  hasAttachments?: boolean;
  sender?: string;
  threadId?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly gmail;
  private readonly drive;
  private readonly logger = new Logger(EmailService.name);
  private historyId: string;
  private processedCount: number = 0;
  private isInitialized = false;

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    const oauth2Client = this.authService.getOAuth2Client();
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    this.drive = google.drive({ version: 'v3', auth: oauth2Client });
  }

  async onModuleInit() {
    try {
      await this.initializeHistoryId();
      this.isInitialized = true;
      this.logger.log('Email service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize email service:', error);
      throw error;
    }
  }

  private async initializeHistoryId() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me',
      });
      this.historyId = response.data.historyId;
      this.logger.log(`Initialized history ID: ${this.historyId}`);
    } catch (error) {
      this.logger.error('Error initializing history ID:', error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkNewEmails() {
    if (!this.isInitialized) {
      await this.initializeHistoryId();
    }

    try {
      const response = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: this.historyId,
        historyTypes: ['messageAdded'],
      });

      if (!response.data.history) {
        this.logger.debug('No new changes found');
        return;
      }

      for (const history of response.data.history) {
        if (history.messagesAdded) {
          for (const message of history.messagesAdded) {
            await this.processEmail(message.message.id);
          }
        }
      }

      this.historyId = response.data.historyId;
      this.logger.log(`Updated history ID to: ${this.historyId}`);
    } catch (error) {
      this.logger.error('Error checking for new emails:', error);
      if (error.response?.status === 404) {
        await this.initializeHistoryId();
      }
      throw error;
    }
  }

  async getEmails({ 
    page, 
    limit, 
    search, 
    startDate, 
    endDate,
    hasAttachments,
    sender,
    threadId 
  }: EmailQueryParams) {
    const queryBuilder = this.emailRepository.createQueryBuilder('email');

    if (search) {
      queryBuilder.where(
        '(email.subject ILIKE :search OR email.sender ILIKE :search OR email.body ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('email.emailDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    if (hasAttachments !== undefined) {
      if (hasAttachments) {
        queryBuilder.andWhere("email.attachments != '[]'");
      } else {
        queryBuilder.andWhere("email.attachments = '[]'");
      }
    }

    if (sender) {
      queryBuilder.andWhere('email.sender ILIKE :sender', { sender: `%${sender}%` });
    }

    if (threadId) {
      queryBuilder.andWhere('email.threadId = :threadId', { threadId });
    }

    const [emails, total] = await queryBuilder
      .orderBy('email.emailDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      emails,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async archiveEmails(): Promise<number> {
    try {
      this.processedCount = 0;
      let pageToken = null;
      
      do {
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          maxResults: 100,
          pageToken: pageToken,
        });

        const messages = response.data.messages || [];
        this.historyId = response.data.historyId;
        
        for (const message of messages) {
          await this.processEmail(message.id);
          this.processedCount++;
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      return this.processedCount;
    } catch (error) {
      this.logger.error('Error archiving emails:', error);
      throw error;
    }
  }

  async getEmailById(messageId: string): Promise<Email> {
    const email = await this.emailRepository.findOne({
      where: { messageId },
    });

    if (!email) {
      throw new Error(`Email with ID ${messageId} not found`);
    }

    return email;
  }

  async getEmailsByThread(threadId: string) {
    return this.emailRepository.find({
      where: { threadId },
      order: { emailDate: 'ASC' },
    });
  }

  private async processEmail(messageId: string) {
    try {
      // Check for duplicates
      const existingEmail = await this.emailRepository.findOne({
        where: { messageId },
      });

      if (existingEmail) {
        this.logger.log(`Email ${messageId} already archived, skipping...`);
        return;
      }

      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const email = new Email();
      email.messageId = messageId;
      email.threadId = message.data.threadId;

      // Process headers
      const headers = {};
      message.data.payload.headers.forEach((header) => {
        headers[header.name.toLowerCase()] = header.value;
      });

      email.subject = headers['subject'] || '';
      email.sender = headers['from'] || '';
      email.recipients = (headers['to'] || '').split(',').map(e => e.trim());
      email.cc = headers['cc'] ? headers['cc'].split(',').map(e => e.trim()) : [];
      email.bcc = headers['bcc'] ? headers['bcc'].split(',').map(e => e.trim()) : [];
      
      // Threading information
      email.inReplyTo = headers['in-reply-to'] || null;
      email.references = headers['references'] ? 
        headers['references'].split(/\s+/).map(ref => ref.trim()) : 
        [];
      email.threadIndex = headers['thread-index'] || null;
      email.threadTopic = headers['thread-topic'] || null;
      email.emailDate = headers['date'] ? new Date(headers['date']) : null;
      
      email.headers = headers;

      // Process body
      const parts = message.data.payload.parts || [message.data.payload];
      const bodyParts = this.extractBodyParts(parts);

      if (bodyParts.length > 0) {
        email.body = this.decodeEmailBody(bodyParts[0]);
      }

      // Process attachments
      email.attachments = await this.processAttachments(messageId, parts);

      await this.emailRepository.save(email);
      this.logger.log(`Archived email: ${email.subject} (${messageId})`);
    } catch (error) {
      this.logger.error(`Error processing email ${messageId}:`, error);
      throw error;
    }
  }

  private extractBodyParts(parts: any[]) {
    return parts.filter(part => 
      part.mimeType === 'text/plain' || part.mimeType === 'text/html'
    );
  }

  private decodeEmailBody(bodyPart: any): string {
    if (!bodyPart.body.data) {
      return '';
    }
    return Buffer.from(bodyPart.body.data, 'base64').toString();
  }

  private async processAttachments(messageId: string, parts: any[]): Promise<EmailAttachment[]> {
    const attachments: EmailAttachment[] = [];
    
    for (const part of parts) {
      if (part.filename && part.body.attachmentId) {
        try {
          const attachment = await this.gmail.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: part.body.attachmentId,
          });

          const fileMetadata = {
            name: part.filename,
            parents: [this.configService.get('googleDrive.folderId')],
          };

          const media = {
            mimeType: part.mimeType,
            body: Buffer.from(attachment.data.data, 'base64'),
          };

          const file = await this.drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
          });

          attachments.push({
            name: part.filename,
            driveFileId: file.data.id,
            mimeType: part.mimeType,
            size: parseInt(part.body.size, 10),
          });
        } catch (error) {
          this.logger.error(`Error processing attachment ${part.filename}:`, error);
          // Continue processing other attachments even if one fails
        }
      }
    }
    
    return attachments;
  }

  async getEmailStatistics() {
    const totalEmails = await this.emailRepository.count();
    const emailsWithAttachments = await this.emailRepository
      .createQueryBuilder('email')
      .where("email.attachments != '[]'")
      .getCount();

    const topSenders = await this.emailRepository
      .createQueryBuilder('email')
      .select('email.sender', 'sender')
      .addSelect('COUNT(*)', 'count')
      .groupBy('email.sender')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalEmails,
      emailsWithAttachments,
      topSenders,
    };
  }
}