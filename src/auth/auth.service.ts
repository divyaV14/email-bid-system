import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';

interface GoogleTokens {
  accessToken: string;
  refreshToken?: string | null | undefined;
  expiryDate?: Date;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private oauth2Client: OAuth2Client;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
  ) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const callbackUrl = this.configService.get<string>('google.callbackUrl');

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new Error('Google OAuth configuration is missing');
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      callbackUrl,
    );
  }

  async onModuleInit() {
    // Validate configuration on module init
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    // Load stored tokens
    await this.loadStoredTokens();
  }

 private async loadStoredTokens() {
  const token = await this.tokenRepository.findOne({
    where: {}, 
    order: { createdAt: 'DESC' },
  });

  if (token) {
    this.setCredentials({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiryDate: token.expiryDate,
    });
  }


  }

  getOAuth2Client(): OAuth2Client {
    return this.oauth2Client;
  }

  setCredentials(tokens: GoogleTokens) {
    if (!tokens.accessToken) {
      throw new Error('Access token is required');
    }
    
    const credentials: Credentials = {
      access_token: tokens.accessToken,
      expiry_date: tokens.expiryDate ? tokens.expiryDate.getTime() : undefined,
    };

    if (tokens.refreshToken) {
      credentials.refresh_token = tokens.refreshToken;
    }
    
    this.oauth2Client.setCredentials(credentials);
    
    // Set up token refresh callback
    this.oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        // Store new tokens
        await this.saveTokens({
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        });
      }
    });
  }

  private async saveTokens(tokens: GoogleTokens) {
    const token = new Token();
    token.accessToken = tokens.accessToken;
    token.refreshToken = tokens.refreshToken!;
    token.expiryDate = tokens.expiryDate || new Date(Date.now() + 3600 * 1000); // Default 1 hour expiry
    await this.tokenRepository.save(token);
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'profile',
        'email',
      ],
      prompt: 'consent',
    });
  }

  async getTokens(code: string): Promise<GoogleTokens> {
    const { tokens } = await this.oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    const tokenData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    };

    await this.saveTokens(tokenData);
    this.setCredentials(tokenData);
    
    return tokenData;
  }
}