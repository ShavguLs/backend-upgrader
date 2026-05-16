# CS2Gambl Backend

This is the NestJS backend project.

## Requirements
- Node.js (v18+)
- PostgreSQL database running locally

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Environment Variables:
   Copy `.env.example` to `.env` and fill in your database details.
   ```bash
   cp .env.example .env
   ```

3. Setup Database:
   Generate the Prisma client:
   ```bash
   npm run prisma:generate
   ```
   Apply migrations:
   ```bash
   npm run prisma:migrate
   ```

## Steam Authentication

This API uses Steam OpenID for authentication and stores sessions in PostgreSQL.

1. Obtain a Steam API key from https://steamcommunity.com/dev/apikey
2. Add your Steam API key to your `.env` file:
   ```env
   STEAM_API_KEY=your_key_here
   STEAM_REALM=http://localhost:3000/
   STEAM_RETURN_URL=http://localhost:3000/auth/steam/return
   SESSION_SECRET=a_long_random_secret_string
   ```
3. To test login locally, visit `http://localhost:3000/auth/steam` in your browser.
4. Subsequent requests to `http://localhost:3000/auth/me` will return your authenticated profile.

## Running the Application

- **Development:**
  ```bash
  npm run start:dev
  ```
- **Production:**
  ```bash
  npm run start:prod
  ```

## Health Check
You can verify the API is running by checking the health endpoint:
```
GET http://localhost:3000/health
```
