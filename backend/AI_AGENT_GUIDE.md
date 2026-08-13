# AI Question Generator Implementation Guide

## Overview
Implemented full AI question generation using OpenRouter. The AI Agent now generates 6 open-answer questions per category (2 easy @ 200pts, 2 medium @ 400pts, 2 hard @ 600pts) and saves them as draft questions for admin review.

## Files Created/Updated

### Files Created (1)
- `src/modules/ai-agent/schemas/generated-question.schema.ts` - Zod schemas for AI response validation

### Files Updated (4)
- `src/modules/ai-agent/ai-agent.service.ts` - Full AI generation implementation with OpenRouter
- `src/modules/ai-agent/ai-agent.controller.ts` - Updated endpoint with comprehensive Swagger docs
- `src/modules/ai-agent/ai-agent.module.ts` - Added Question model and categories module
- `src/modules/ai-agent/dto/generate-questions.dto.ts` - Simplified DTO to categoryId only

### Dependencies Installed
- OpenRouter chat completions API
- `zod` - (already installed) Schema validation

## Environment Setup

### 1. Get OpenRouter API Key
```bash
# Go to: https://aistudio.google.com/app/apikeys
# Create a new API key and copy it
```

### 2. Update .env file
```bash
# Edit /Users/muath/Lammah-game-backend/.env
OPENROUTER_API_KEY=your_actual_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash
```

**Example:**
```env
MONGODB_URI=mongodb://localhost:27017/lammah-quiz
PORT=3000
OPENROUTER_API_KEY=sk-or-v1-example-key
OPENROUTER_MODEL=google/gemini-2.5-flash
NODE_ENV=development
```

## How It Works

### Request Flow
1. User sends `POST /ai-agent/generate-questions` with `categoryId`
2. Service verifies category exists
3. Builds a clever prompt for party-game style questions
4. Calls OpenRouter API with the prompt
5. Parses JSON response
6. Validates questions with Zod schema
7. Checks for duplicates (in batch and in MongoDB)
8. Saves valid questions as `draft` status with `source: ai`
9. Returns generated questions

### Generated Question Structure
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "category": "507f1f77bcf86cd799439012",
  "question": "What is the largest planet in our solar system?",
  "answer": "Jupiter",
  "explanation": "Jupiter is the largest planet...",
  "difficulty": "easy",
  "points": 200,
  "type": "text",
  "status": "draft",
  "source": "ai",
  "createdAt": "2024-06-19T10:00:00Z",
  "updatedAt": "2024-06-19T10:00:00Z"
}
```

## Endpoint Documentation

### Generate Questions
**POST /ai-agent/generate-questions**

**Request Body:**
```json
{
  "categoryId": "507f1f77bcf86cd799439012"
}
```

**Success Response (200):**
```json
{
  "statusCode": 200,
  "message": "Questions generated successfully",
  "count": 6,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "category": "507f1f77bcf86cd799439012",
      "question": "What is the largest planet in our solar system?",
      "answer": "Jupiter",
      "explanation": "Jupiter is the largest planet with a mass more than twice...",
      "difficulty": "easy",
      "points": 200,
      "type": "text",
      "status": "draft",
      "source": "ai",
      "createdAt": "2024-06-19T10:00:00Z",
      "updatedAt": "2024-06-19T10:00:00Z"
    },
    // ... 5 more questions
  ]
}
```

**Error Responses:**

1. **Category Not Found (404)**
```json
{
  "statusCode": 404,
  "message": "Category with ID \"invalid_id\" not found",
  "timestamp": "2024-06-19T10:00:00Z",
  "path": "/ai-agent/generate-questions"
}
```

2. **Invalid JSON from AI (400)**
```json
{
  "statusCode": 400,
  "message": "Invalid JSON response from AI",
  "timestamp": "2024-06-19T10:00:00Z",
  "path": "/ai-agent/generate-questions"
}
```

3. **Validation Failed (400)**
```json
{
  "statusCode": 400,
  "message": "Question validation failed: Question is too short",
  "timestamp": "2024-06-19T10:00:00Z",
  "path": "/ai-agent/generate-questions"
}
```

4. **OpenRouter API Error (500)**
```json
{
  "statusCode": 500,
  "message": "Failed to generate questions: OpenRouter API call failed: API key invalid",
  "timestamp": "2024-06-19T10:00:00Z",
  "path": "/ai-agent/generate-questions"
}
```

## Testing in Swagger UI

### Step 1: Start the Server
```bash
npm run start:dev
```

### Step 2: Open Swagger UI
```
http://localhost:3000/api
```

### Step 3: Create a Category First (if needed)
1. Navigate to **Categories** section
2. Click **POST /categories**
3. Click **Try it out**
4. Enter request body:
```json
{
  "name": "Movies",
  "slug": "movies",
  "description": "Movie trivia questions",
  "isActive": true
}
```
5. Click **Execute**
6. Copy the returned `_id` value

### Step 4: Generate Questions
1. Navigate to **AI Agent** section
2. Click **POST /ai-agent/generate-questions**
3. Click **Try it out**
4. Enter request body (use the category ID from Step 3):
```json
{
  "categoryId": "PASTE_THE_ID_HERE"
}
```
5. Click **Execute**
6. Wait 10-20 seconds for OpenRouter API response
7. View the generated questions in the response

### Step 5: Verify Questions Were Saved
1. Navigate to **Questions** section
2. Click **GET /questions**
3. Click **Try it out** → **Execute**
4. You should see the generated questions with:
   - `status: "draft"`
   - `source: "ai"`
   - Various points (200, 400, 600)

## Question Distribution

Generated questions follow this pattern:

| Difficulty | Points | Count | Distribution |
|-----------|--------|-------|--------------|
| Easy      | 200    | 2     | Questions 1-2 |
| Medium    | 400    | 2     | Questions 3-4 |
| Hard      | 600    | 2     | Questions 5-6 |

## Quality Checks Implemented

✅ **Prompt Validation**
- Questions must be 10-500 characters
- Answers must not be empty
- Explanations must be 5-500 characters

✅ **Duplicate Detection**
- Removes duplicates within generated batch
- Checks against existing questions in MongoDB
- Case-insensitive comparison

✅ **JSON Validation**
- Handles markdown code blocks (```json ... ```)
- Validates against Zod schema
- Ensures all required fields present

✅ **Type Safety**
- Converts string points to numbers
- Defaults type to "text"
- Validates enums (difficulty, points, type)

## AI Prompt Features

The generated prompt:
- ✅ Requests exactly 6 questions with specific distribution
- ✅ Emphasizes open-answer questions (NOT multiple-choice)
- ✅ Requires fun, party-game style questions
- ✅ Includes explanation requirement
- ✅ Specifies JSON-only response format
- ✅ Allows media types for entertainment categories
- ✅ Avoids yes/no questions

## Workflow: From Generation to Game

```
1. Admin calls POST /ai-agent/generate-questions
   ↓
2. AI generates 6 draft questions
   ↓
3. Questions saved with status: "draft", source: "ai"
   ↓
4. Admin reviews questions via GET /questions
   ↓
5. Admin approves by PATCH /questions/:id with status: "approved"
   ↓
6. Now questions are eligible for games
   ↓
7. POST /games can use these approved questions
```

## Error Handling

The service includes comprehensive error handling:

1. **Missing OPENROUTER_API_KEY**
   - Throws error at service initialization
   - Check .env file is configured

2. **Invalid Category ID**
   - Returns 404 NotFoundException
   - Verify category exists first

3. **OpenRouter API Failures**
   - Returns 500 InternalServerErrorException
   - Check API key validity
   - Check rate limits
   - Check internet connection

4. **Invalid AI Response**
   - Returns 400 BadRequestException
   - Check prompt format
   - May be OpenRouter model or provider issue

5. **Validation Failures**
   - Returns 400 BadRequestException with specific field error
   - Check question quality requirements

## Helper Methods in Service

```typescript
// Build the AI prompt
private buildPrompt(categoryName: string): string

// Call OpenRouter API
private async callOpenRouter(prompt: string): Promise<string>

// Extract JSON from response
private parseAiResponse(response: string): any[]

// Validate with Zod schema
private validateGeneratedQuestions(questions: any[]): GeneratedQuestion[]

// Remove duplicates
private async removeDuplicates(
  questions: GeneratedQuestion[], 
  categoryId: string
): Promise<GeneratedQuestion[]>

// Save as drafts
private async saveDraftQuestions(
  questions: GeneratedQuestion[],
  categoryId: string
): Promise<any[]>
```

## Notes

- Questions are saved as **draft**, not approved
- Admin must review and approve before using in games
- Each generation costs API quota (check OpenRouter dashboard)
- Generation takes 10-20 seconds (depends on API response time)
- Same category can generate multiple batches (will detect new duplicates)

## Next Steps

After setting up:
1. Create a category
2. Generate questions for it
3. Review via Swagger
4. Approve questions via PATCH endpoint
5. Create a game and use the questions
6. Play the game!

## Troubleshooting

**Problem**: "OPENROUTER_API_KEY environment variable is not set"
- **Solution**: Check .env file has `OPENROUTER_API_KEY=your_key`

**Problem**: "Category with ID not found"
- **Solution**: Create a category first, copy its ID, use that ID

**Problem**: "Invalid JSON response from AI"
- **Solution**: May be API issue, wait and try again

**Problem**: "Not enough valid questions generated"
- **Solution**: Check question quality (too short, empty answer, etc.)

**Problem**: API timeout after 30 seconds
- **Solution**: OpenRouter/provider response is slow, wait and try again in 5 minutes
