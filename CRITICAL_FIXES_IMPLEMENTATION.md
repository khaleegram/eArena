# Critical Fixes - Implementation Guide

## 1. Firestore Security Rules (URGENT)

### Current (INSECURE):
```javascript
match /{document=**} {
  allow read, write: if true;
}
```

### Secure Implementation:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function isAdmin() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    function isOrganizer(tournamentId) {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/tournaments/$(tournamentId)).data.organizerId == request.auth.uid;
    }
    
    function isTeamMember(tournamentId, teamId) {
      let team = get(/databases/$(database)/documents/tournaments/$(tournamentId)/teams/$(teamId));
      return isAuthenticated() && 
             (request.auth.uid in team.data.playerIds || 
              request.auth.uid == team.data.captainId);
    }

    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId) || isAdmin();
      
      // Subcollections
      match /notifications/{notificationId} {
        allow read: if isOwner(userId);
        allow write: if false; // Only server can write
      }
      
      match /pushSubscriptions/{subscriptionId} {
        allow read, write: if isOwner(userId);
      }
    }

    // Tournaments collection
    match /tournaments/{tournamentId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update, delete: if isOrganizer(tournamentId) || isAdmin();
      
      // Teams subcollection
      match /teams/{teamId} {
        allow read: if isAuthenticated();
        allow create: if isAuthenticated();
        allow update: if isOrganizer(tournamentId) || 
                         isTeamMember(tournamentId, teamId) || 
                         isAdmin();
        allow delete: if isOrganizer(tournamentId) || isAdmin();
      }
      
      // Matches subcollection
      match /matches/{matchId} {
        allow read: if isAuthenticated();
        allow create: if isOrganizer(tournamentId) || isAdmin();
        allow update: if isOrganizer(tournamentId) || 
                         isTeamMember(tournamentId, resource.data.homeTeamId) ||
                         isTeamMember(tournamentId, resource.data.awayTeamId) ||
                         isAdmin();
        allow delete: if isAdmin();
      }
    }

    // Standings collection
    match /standings/{standingId} {
      allow read: if isAuthenticated();
      allow write: if false; // Only server can write
    }

    // Player stats
    match /playerStats/{userId} {
      allow read: if isAuthenticated();
      allow write: if false; // Only server can write
    }

    // Transactions (CRITICAL - Financial data)
    match /transactions/{transactionId} {
      allow read: if isOwner(resource.data.uid) || isAdmin();
      allow write: if false; // Only server can write
    }

    // Conversations
    match /conversations/{conversationId} {
      allow read: if isAuthenticated() && 
                     request.auth.uid in resource.data.participantIds;
      allow create: if isAuthenticated() && 
                        request.auth.uid in request.resource.data.participantIds;
      allow update: if isAuthenticated() && 
                       request.auth.uid in resource.data.participantIds;
    }

    // Highlights
    match /highlights/{highlightId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated(); // Can be restricted further
    }

    // Platform settings (Admin only)
    match /platformSettings/{document=**} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Articles
    match /articles/{articleId} {
      allow read: if true; // Public
      allow write: if isAdmin();
    }
  }
}
```

---

## 2. API Route Protection

### Cron Endpoints Protection:

```typescript
// src/app/api/cron/trigger-payouts/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Verify secret token
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  // Your existing logic...
}
```

### Rate Limiting Implementation:

```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const ratelimit = {
  // 10 requests per minute for general actions
  general: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
  }),
  
  // 5 requests per minute for match reporting
  matchReport: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
  }),
  
  // 3 requests per hour for tournament creation
  tournamentCreate: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
  }),
};

// Usage in server action:
export async function reportMatchScore(...) {
  const { success } = await ratelimit.matchReport.limit(userId);
  if (!success) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  // ... rest of logic
}
```

---

## 3. Input Validation with Zod

### Tournament Creation Validation:

```typescript
// src/lib/validations/tournament.ts
import { z } from 'zod';

export const tournamentSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Name contains invalid characters'),
  
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be less than 2000 characters'),
  
  game: z.string().min(1, 'Game is required'),
  platform: z.enum(['PS5', 'Xbox', 'PC', 'Mobile'], {
    errorMap: () => ({ message: 'Invalid platform' })
  }),
  
  format: z.enum(['league', 'cup', 'swiss']),
  
  maxTeams: z.number()
    .int('Must be a whole number')
    .min(4, 'Minimum 4 teams required')
    .max(128, 'Maximum 128 teams allowed'),
  
  prizePool: z.number()
    .nonnegative('Prize pool cannot be negative')
    .max(10000000, 'Prize pool too large')
    .optional(),
  
  // Date validations
  registrationStartDate: z.date(),
  registrationEndDate: z.date(),
  tournamentStartDate: z.date(),
  tournamentEndDate: z.date(),
}).refine(
  (data) => data.registrationEndDate < data.tournamentStartDate,
  {
    message: 'Registration must end before tournament starts',
    path: ['registrationEndDate'],
  }
).refine(
  (data) => data.tournamentStartDate < data.tournamentEndDate,
  {
    message: 'Tournament start must be before end date',
    path: ['tournamentEndDate'],
  }
);

export type TournamentInput = z.infer<typeof tournamentSchema>;
```

### File Upload Validation:

```typescript
// src/lib/validations/files.ts
import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

export const imageUploadSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: 'File size must be less than 5MB',
    })
    .refine((file) => ALLOWED_IMAGE_TYPES.includes(file.type), {
      message: 'Only JPEG, PNG, and WebP images are allowed',
    }),
});

export const videoUploadSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.size <= 100 * 1024 * 1024, { // 100MB
      message: 'File size must be less than 100MB',
    })
    .refine((file) => ALLOWED_VIDEO_TYPES.includes(file.type), {
      message: 'Only MP4 and WebM videos are allowed',
    }),
});
```

---

## 4. Error Handling Pattern

### Centralized Error Handler:

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTH_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// Error handler wrapper for server actions
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Log to error tracking service
      console.error('Server action error:', error);
      
      // Send to Sentry/LogRocket
      if (process.env.NODE_ENV === 'production') {
        // Sentry.captureException(error);
      }
      
      // Return user-friendly error
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'An unexpected error occurred. Please try again.',
        500,
        'INTERNAL_ERROR'
      );
    }
  }) as T;
}
```

---

## 5. Structured Logging

```typescript
// src/lib/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'earena' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;

// Usage:
// logger.info('User logged in', { userId, timestamp });
// logger.error('Payment failed', { error, transactionId });
```

---

## 6. Database Indexes

### Firestore Indexes Configuration:

```javascript
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "tournaments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "tournamentStartDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "matches",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tournamentId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "matchDay", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "standings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tournamentId", "order": "ASCENDING" },
        { "fieldPath": "ranking", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "username_lowercase", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

## 7. Environment Variables Security

### .env.example:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (Server only)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# API Keys
CRON_SECRET= # For protecting cron endpoints
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=

# Redis (Rate Limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=

# Push Notifications
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# Error Tracking
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# Admin
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com,admin2@example.com
```

---

## Implementation Checklist

- [ ] Deploy secure Firestore rules
- [ ] Add input validation to all server actions
- [ ] Protect all API routes
- [ ] Implement rate limiting
- [ ] Set up error tracking (Sentry)
- [ ] Add structured logging
- [ ] Create Firestore indexes
- [ ] Secure environment variables
- [ ] Add CSRF protection
- [ ] Implement file upload validation
- [ ] Add database backup strategy
- [ ] Set up monitoring and alerts

---

**Priority:** Complete these before any production deployment.
