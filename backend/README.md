# Lammah Quiz Backend

Backend for Lammah, a quiz-party game built with NestJS, MongoDB, and TypeScript.

## Project Structure

```
src/
├── common/              # Shared utilities and filters
│   └── filters/        # Global exception filters
├── config/             # Configuration files
├── database/           # Database setup and connection
├── modules/
│   ├── categories/     # Category management
│   │   ├── dto/       # Data transfer objects
│   │   ├── schemas/   # MongoDB schemas
│   │   ├── categories.controller.ts
│   │   ├── categories.service.ts
│   │   └── categories.module.ts
│   ├── questions/      # Question management
│   │   ├── dto/       # Data transfer objects
│   │   ├── schemas/   # MongoDB schemas
│   │   ├── questions.controller.ts
│   │   ├── questions.service.ts
│   │   └── questions.module.ts
│   └── ai-agent/       # AI question generation (skeleton)
│       ├── dto/       # Data transfer objects
│       ├── ai-agent.controller.ts
│       ├── ai-agent.service.ts
│       └── ai-agent.module.ts
├── app.module.ts       # Root module
└── main.ts            # Application entry point
```

## Prerequisites

- Node.js 18+
- npm or yarn
- MongoDB (local or cloud instance)

## Installation

1. Clone the repository and navigate to the project:
```bash
cd /Users/muath/Lammah-game-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the template:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/lammah-quiz
PORT=3000
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_MODEL=google/gemini-2.5-flash
NODE_ENV=development
```

## Running the Application

### Development Mode
```bash
npm run start:dev
```
The API will be available at `http://localhost:3000`

### Production Mode
```bash
npm run build
npm run start:prod
```

### Debug Mode
```bash
npm run start:debug
```

## Available Endpoints

### Categories
- **POST** `/categories` - Create a new category
  ```json
  {
    "name": "Science",
    "slug": "science",
    "description": "Science related questions",
    "isActive": true
  }
  ```

- **GET** `/categories` - Get all categories

- **GET** `/categories/:id` - Get a specific category

- **PATCH** `/categories/:id` - Update a category
  ```json
  {
    "name": "Updated Name",
    "description": "Updated description"
  }
  ```

- **DELETE** `/categories/:id` - Delete a category

### Questions
- **POST** `/questions` - Create a new question
  ```json
  {
    "category": "65a1b2c3d4e5f6g7h8i9j0k1",
    "question": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "answer": "4",
    "explanation": "2 plus 2 equals 4",
    "difficulty": "easy",
    "type": "trivia",
    "status": "approved",
    "source": "manual"
  }
  ```

- **GET** `/questions` - Get all questions

- **GET** `/questions/:id` - Get a specific question

- **PATCH** `/questions/:id` - Update a question
  ```json
  {
    "question": "Updated question",
    "status": "approved"
  }
  ```

- **DELETE** `/questions/:id` - Delete a question

### AI Agent (Placeholder)
- **POST** `/ai-agent/generate-questions` - Generate questions using AI
  ```json
  {
    "categoryId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "difficulty": "medium",
    "type": "trivia",
    "count": 5
  }
  ```

## Validation Rules

### Category
- `name` - Required, non-empty string
- `slug` - Required, unique, non-empty string
- `description` - Optional string
- `isActive` - Optional boolean, defaults to `true`

### Question
- `category` - Required, valid MongoDB ObjectId
- `question` - Required, non-empty string
- `options` - Required, array with at least 1 item
- `answer` - Required, non-empty string
- `explanation` - Optional string
- `difficulty` - Required, one of: `easy`, `medium`, `hard`
- `type` - Required, one of: `trivia`, `discussion`
- `status` - Optional, one of: `draft`, `approved`, `rejected` (defaults to `draft`)
- `source` - Optional, one of: `manual`, `ai` (defaults to `manual`)

**Special Rules:**
- Trivia questions (`type: trivia`) must have exactly 4 options

## Testing

```bash
npm run test
npm run test:watch
npm run test:cov
```

## Code Quality

### Format Code
```bash
npm run format
```

### Lint Code
```bash
npm run lint
```

## Technologies

- **Framework**: NestJS 10.3.0
- **Language**: TypeScript 5.3.3
- **Database**: MongoDB with Mongoose 8.0.0
- **Validation**: class-validator 0.14.0, Zod 3.22.4
- **Testing**: Jest 29.7.0

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/lammah-quiz

# Server
PORT=3000

# API Keys
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_MODEL=google/gemini-2.5-flash

# Environment
NODE_ENV=development
```

## Future Implementation

### AI Agent Module
The AI Agent module is currently a skeleton with placeholder endpoints. Future implementation will include:
- OpenRouter API integration for question generation
- Prompt engineering for consistent question quality
- Question validation and filtering
- Batch processing for multiple questions

### Additional Features
- Authentication & Authorization
- Game sessions and player management
- Team support
- Scoring and leaderboards
- Real-time updates with WebSockets
- Advanced filtering and search
- Question analytics

## Error Handling

All endpoints return consistent error responses:

```json
{
  "statusCode": 400,
  "message": "Error message",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "path": "/endpoint",
  "errors": {}
}
```

## License

MIT

## Author

Muath
# Lammah-game
