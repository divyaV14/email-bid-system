import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { Email } from '../entities/email.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]),
    AuthModule,
  ],
  providers: [EmailService],
  controllers: [EmailController],
})
export class EmailModule {} 