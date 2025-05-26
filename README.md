# Email Archiving System

This is a NestJS application that automatically archives emails from a G-Suite inbox into a PostgreSQL database, with attachments stored in Google Drive.

## Features

- Google OAuth integration for secure authentication
- Automatic email archiving from Gmail
- Attachment handling with Google Drive storage
- Complete email metadata storage
- Thread tracking and duplicate prevention
- PostgreSQL database for reliable storage

## Prerequisites

- Node.js (v14 or later)
- PostgreSQL (v12 or later)
- Google Cloud Platform account with Gmail API and Drive API enabled
- Google OAuth 2.0 credentials

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd email-bid-system
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Google Cloud Platform:
   - Go to Google Cloud Console
   - Create a new project
   - Enable Gmail API and Drive API
   - Create OAuth 2.0 credentials
   - Create a folder in Google Drive for attachments

4. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your database credentials
   - Add your Google OAuth credentials
   - Add your Google Drive folder ID

5. Create the database:
   ```bash
   createdb email_archive
   ```

6. Start the application:
   ```bash
   npm run start:dev
   ```

## Usage

1. Visit `http://localhost:3000/auth/google` to authenticate with your Google account
2. The system will request necessary permissions for Gmail and Drive access
3. Once authenticated, use the following endpoints:
   - POST `/emails/archive` - Start the email archiving process
   - GET `/emails/status` - Check the archiving status

## Architecture

- `src/auth` - Google OAuth authentication
- `src/email` - Email processing and archiving
- `src/entities` - Database entities
- `src/config` - Configuration management

## Security Considerations

- OAuth tokens are handled securely
- No password storage required
- Environment variables for sensitive data
- HTTPS recommended for production

## Production Deployment

1. Set up a production PostgreSQL database
2. Configure production environment variables
3. Set `synchronize: false` in TypeORM config
4. Use a process manager like PM2
5. Enable HTTPS
6. Set up proper logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
