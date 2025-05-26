import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

interface EmailAttachment {
  name: string;
  driveFileId: string;
  mimeType: string;
  size: number;
}

@Entity('emails')
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subject: string;

  @Column('text')
  body: string;

  @Column()
  sender: string;

  @Column('simple-array')
  recipients: string[];

  @Column('simple-array', { nullable: true })
  cc: string[];

  @Column('simple-array', { nullable: true })
  bcc: string[];

  @Index()
  @Column({ unique: true })
  messageId: string;

  @Index()
  @Column({ nullable: true })
  threadId: string;

  @Column({ nullable: true })
  inReplyTo: string;

  @Column('simple-array', { nullable: true })
  references: string[];

  @Column({ nullable: true })
  threadIndex: string;

  @Column({ nullable: true })
  threadTopic: string;

  @Column('jsonb', { nullable: true })
  attachments: EmailAttachment[];

  @Column('jsonb', { nullable: true })
  headers: Record<string, string>;

  @Column({ type: 'timestamp', nullable: true })
  emailDate: Date | null;

  @CreateDateColumn()
  receivedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}