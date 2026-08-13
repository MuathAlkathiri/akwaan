# Lammah Game - Frontend

A modern Next.js frontend for the Seen Jeem-style quiz party game.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Forms**: React Hook Form + Zod
- **State Management**: TanStack Query (React Query)
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Internationalization**: RTL Support (Arabic-first)

## Features

- **Categories Management**: Create and manage question categories
- **Questions Management**: Add, edit, and manage questions with support for:
  - Multiple question types (text, image, audio, video)
  - Difficulty levels (easy, medium, hard)
  - Point values (200, 400, 600)
  - Status tracking (draft, approved, rejected)
- **Games**: Create and play quiz games with:
  - Team management
  - Score tracking
  - Interactive game board
  - Question reveal mechanism
- **AI Question Generator**: Automatically generate questions using AI
- **Dark Theme**: Clean, modern dark-themed UI
- **Arabic-Friendly**: Full RTL support and Arabic labels

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── globals.css             # Global styles
│   ├── page.tsx                # Home page
│   ├── categories/
│   │   └── page.tsx            # Categories management
│   ├── questions/
│   │   └── page.tsx            # Questions management
│   ├── games/
│   │   ├── page.tsx            # Games list
│   │   ├── new/page.tsx        # Create new game
│   │   └── [id]/page.tsx       # Game board
│   ├── admin/
│   │   └── ai-generator/page.tsx # AI question generator
│   └── providers.tsx           # React Query provider
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── layout/                 # Layout components (header)
│   ├── categories/             # Categories components
│   ├── questions/              # Questions components
│   ├── games/                  # Games components
│   └── ai-generator/           # AI generator components
├── lib/
│   ├── api/
│   │   ├── client.ts           # Axios client configuration
│   │   └── endpoints.ts        # API endpoints
│   ├── hooks/
│   │   └── index.ts            # Custom React Query hooks
│   └── utils.ts                # Utility functions
└── types/
    └── index.ts                # Global TypeScript types
```

## Setup Instructions

### Prerequisites

- Node.js 18+ or pnpm
- Git

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Environment Variables**:
   Create a `.env.local` file in the root directory (already created with default value):
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3000
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

4. **Open in browser**:
   Navigate to `http://localhost:3000`

## Available Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Dashboard and quick links |
| Categories | `/categories` | Manage question categories |
| Questions | `/questions` | Manage questions |
| Games | `/games` | List all games |
| New Game | `/games/new` | Create a new game |
| Game Board | `/games/[id]` | Play a game |
| AI Generator | `/admin/ai-generator` | Generate questions with AI |

## API Integration

The frontend communicates with a NestJS backend API at `http://localhost:3000`.

### Supported Endpoints

**Categories**:
- `GET /categories` - List all categories
- `POST /categories` - Create a new category

**Questions**:
- `GET /questions` - List all questions
- `POST /questions` - Create a new question
- `PATCH /questions/:id` - Update a question
- `DELETE /questions/:id` - Delete a question

**Games**:
- `GET /games` - List all games
- `POST /games` - Create a new game
- `GET /games/:id` - Get game details
- `POST /games/:id/reveal-answer` - Reveal question answer
- `POST /games/:id/award-points` - Award points to a team
- `POST /games/:id/skip-question` - Skip current question

**AI Agent**:
- `POST /ai-agent/generate-questions` - Generate questions using AI

## Build & Production

Build for production:
```bash
npm run build
npm start
```

## Environment Variables

- `NEXT_PUBLIC_API_URL`: Backend API base URL (default: `http://localhost:3000`)

## Notes

- No authentication is implemented yet
- WebSocket support is not yet implemented
- File uploads are not supported
- Media URLs are rendered directly (use public URLs for images, audio, video)
- The app uses REST API only

## Contributing

When making changes:
1. Follow the existing component structure
2. Use TypeScript for type safety
3. Keep components small and focused
4. Use the custom hooks for API calls
5. Maintain RTL/LTR support

## License

MIT
