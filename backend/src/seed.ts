import * as dotenv from 'dotenv';
import mongoose, { Model, Types } from 'mongoose';
import {
  Category,
  CategorySchema,
} from './modules/categories/schemas/category.schema';
import {
  DifficultyLevel,
  Question,
  QuestionPoints,
  QuestionSchema,
  QuestionSource,
  QuestionStatus,
  QuestionType,
} from './modules/questions/schemas/question.schema';

dotenv.config();

// LEGACY_PERSISTED_IDENTIFIER: the `lammah-quiz` database name predates the Akwaan
// rename and still holds the live content. Renaming it needs a verified data
// migration, not an edit here — this default must keep matching the real database.
const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/lammah-quiz';

const categorySeeds = [
  {
    name: 'General Knowledge',
    slug: 'general-knowledge',
    description:
      'Mixed questions across science, geography, history, and culture.',
  },
  {
    name: 'Sports',
    slug: 'sports',
    description: 'Questions about teams, athletes, tournaments, and records.',
  },
  {
    name: 'Movies',
    slug: 'movies',
    description:
      'Cinema questions covering classics, blockbusters, and awards.',
  },
  {
    name: 'Music',
    slug: 'music',
    description: 'Questions about songs, artists, albums, and music history.',
  },
  {
    name: 'Technology',
    slug: 'technology',
    description:
      'Questions about software, hardware, the web, and modern tech.',
  },
];

const questionSeeds: Record<
  string,
  Array<{
    question: string;
    answer: string;
    explanation: string;
    difficulty: DifficultyLevel;
    points: QuestionPoints;
  }>
> = {
  'general-knowledge': [
    {
      question: 'What is the capital city of Japan?',
      answer: 'Tokyo',
      explanation:
        'Tokyo is the capital and largest metropolitan area of Japan.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
    {
      question: 'Which planet is known as the Red Planet?',
      answer: 'Mars',
      explanation:
        'Iron oxide on the Martian surface gives Mars its reddish color.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
    {
      question: 'What is the largest ocean on Earth?',
      answer: 'Pacific Ocean',
      explanation: 'The Pacific Ocean is larger than all land areas combined.',
      difficulty: DifficultyLevel.MEDIUM,
      points: QuestionPoints.MEDIUM,
    },
  ],
  sports: [
    {
      question:
        'How many players are on the field for one football team in soccer?',
      answer: '11',
      explanation: 'A soccer team fields 11 players, including the goalkeeper.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
    {
      question: 'Which country hosted the 2016 Summer Olympics?',
      answer: 'Brazil',
      explanation:
        'The 2016 Summer Olympics were held in Rio de Janeiro, Brazil.',
      difficulty: DifficultyLevel.MEDIUM,
      points: QuestionPoints.MEDIUM,
    },
    {
      question: 'In tennis, what term is used for a score of zero?',
      answer: 'Love',
      explanation: 'In tennis scoring, zero is called love.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
  ],
  movies: [
    {
      question: 'Who directed the movie Jurassic Park?',
      answer: 'Steven Spielberg',
      explanation: 'Steven Spielberg directed Jurassic Park, released in 1993.',
      difficulty: DifficultyLevel.MEDIUM,
      points: QuestionPoints.MEDIUM,
    },
    {
      question: 'Which film features the quote "May the Force be with you"?',
      answer: 'Star Wars',
      explanation:
        'The quote is one of the most recognizable lines from Star Wars.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
    {
      question:
        'What is the name of the fictional African nation in Black Panther?',
      answer: 'Wakanda',
      explanation:
        'Wakanda is the technologically advanced nation ruled by Black Panther.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
  ],
  music: [
    {
      question: 'Which band released the album Abbey Road?',
      answer: 'The Beatles',
      explanation: 'Abbey Road was released by The Beatles in 1969.',
      difficulty: DifficultyLevel.MEDIUM,
      points: QuestionPoints.MEDIUM,
    },
    {
      question: 'What instrument has 88 keys in its standard modern form?',
      answer: 'Piano',
      explanation: 'A standard modern piano has 88 keys.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
    {
      question: 'Who is often called the King of Pop?',
      answer: 'Michael Jackson',
      explanation:
        'Michael Jackson is widely known by the nickname King of Pop.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
  ],
  technology: [
    {
      question: 'What does HTML stand for?',
      answer: 'HyperText Markup Language',
      explanation:
        'HTML is the standard markup language used to structure web pages.',
      difficulty: DifficultyLevel.EASY,
      points: QuestionPoints.LOW,
    },
    {
      question: 'Which company created the JavaScript runtime Node.js?',
      answer: 'Joyent',
      explanation:
        'Node.js was created by Ryan Dahl and initially sponsored by Joyent.',
      difficulty: DifficultyLevel.HARD,
      points: QuestionPoints.HIGH,
    },
    {
      question: 'What database type is MongoDB commonly classified as?',
      answer: 'NoSQL document database',
      explanation: 'MongoDB stores data as flexible JSON-like documents.',
      difficulty: DifficultyLevel.MEDIUM,
      points: QuestionPoints.MEDIUM,
    },
  ],
};

/**
 * Deliberately not an admin seeder.
 *
 * `ADMIN_EMAIL`/`ADMIN_PASSWORD` used to create a privileged account here and
 * on every application boot. The product decision is that nothing automated
 * grants admin: users register normally and the role is set by hand. Leaving a
 * script that could do it — pointed at whatever MONGODB_URI happens to be
 * exported — would put the same hole back.
 */
function explainAdminGrant(): void {
  console.log(
    [
      'Admin users are not seeded. Register normally, then grant the role:',
      '  db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })',
    ].join('\n'),
  );
}

async function seedCategories(
  categoryModel: Model<Category>,
): Promise<Map<string, Category>> {
  const categoriesBySlug = new Map<string, Category>();

  for (const categorySeed of categorySeeds) {
    const category = await categoryModel.findOneAndUpdate(
      { slug: categorySeed.slug },
      {
        $set: {
          name: categorySeed.name,
          description: categorySeed.description,
          isActive: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          slug: categorySeed.slug,
          createdAt: new Date(),
        },
      },
      { new: true, upsert: true, runValidators: true },
    );

    categoriesBySlug.set(category.slug, category);
  }

  console.log(`Seeded ${categoriesBySlug.size} categories`);
  return categoriesBySlug;
}

async function seedQuestions(
  questionModel: Model<Question>,
  categoriesBySlug: Map<string, Category>,
): Promise<void> {
  let createdCount = 0;
  let existingCount = 0;

  for (const [categorySlug, questions] of Object.entries(questionSeeds)) {
    const category = categoriesBySlug.get(categorySlug);

    if (!category) {
      throw new Error(`Missing seeded category for slug: ${categorySlug}`);
    }

    for (const questionSeed of questions) {
      const categoryId = category._id as Types.ObjectId;
      const existingQuestion = await questionModel.findOne({
        category: categoryId,
        question: questionSeed.question,
      });

      if (existingQuestion) {
        existingCount += 1;
        continue;
      }

      await questionModel.create({
        ...questionSeed,
        category: categoryId,
        type: QuestionType.TEXT,
        status: QuestionStatus.APPROVED,
        source: QuestionSource.MANUAL,
        isFreeGameQuestion: true,
      });

      createdCount += 1;
    }
  }

  console.log(
    `Seeded questions: ${createdCount} created, ${existingCount} already existed`,
  );
}

async function bootstrap(): Promise<void> {
  const mongodbUri = process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI;

  await mongoose.connect(mongodbUri);

  const categoryModel = mongoose.model(Category.name, CategorySchema);
  const questionModel = mongoose.model(Question.name, QuestionSchema);

  explainAdminGrant();
  const categoriesBySlug = await seedCategories(categoryModel);
  await seedQuestions(questionModel, categoriesBySlug);

  console.log('Database seed completed');
}

bootstrap()
  .catch((error) => {
    console.error('Database seed failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
