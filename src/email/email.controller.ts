import { Controller, Get, Post, UseGuards, Logger, Query } from '@nestjs/common';
import { EmailService } from './email.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('emails')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);
  
  constructor(private readonly emailService: EmailService) {}

  @Get('/archive')
  @UseGuards(AuthGuard('google'))
  async archiveEmails() {
    this.logger.log('Archive endpoint called');
    try {
      const count = await this.emailService.archiveEmails();
      this.logger.log(`Successfully archived ${count} emails`);
      return { message: `Successfully processed ${count} emails` };
    } catch (error) {
      this.logger.error('Error in archiveEmails:', error);
      throw error;
    }
  }

  @Get()
  @UseGuards(AuthGuard('google'))
  async getEmails(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log('Fetching archived emails');
    try {
      const emails = await this.emailService.getEmails({
        page: +page,
        limit: +limit,
        search,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });
      return emails;
    } catch (error) {
      this.logger.error('Error fetching emails:', error);
      throw error;
    }
  }

  @Get('status')
  async getStatus() {
    return { status: 'operational' };
  }
}