export const ids = {
  user: '66b8f5f2c9d7a8b1e3f00111',
  admin: '66b8f5f2c9d7a8b1e3f00112',
  catalog: '66b8f5f2c9d7a8b1e3f00210',
  category: '66b8f5f2c9d7a8b1e3f00222',
  categoryTwo: '66b8f5f2c9d7a8b1e3f00223',
  question: '66b8f5f2c9d7a8b1e3f00333',
  questionTwo: '66b8f5f2c9d7a8b1e3f00334',
  game: '66b8f5f2c9d7a8b1e3f00444',
};

export const userExample = {
  id: ids.user,
  fullName: 'Muath',
  email: 'user@example.com',
  role: 'user',
  subscriptionStatus: 'none',
  freeGamesUsed: 0,
};

export const catalogExample = {
  _id: ids.catalog,
  name: {
    ar: 'رياضة',
    en: 'Sports',
  },
  description: {
    ar: 'أسئلة رياضية متنوعة',
    en: 'Various sports questions',
  },
  slug: 'sports',
  banner: {
    filename: 'catalog-banner-1783260000000-a1b2c3d4e5f6.webp',
    path: 'uploads/catalogs/banners/catalog-banner-1783260000000-a1b2c3d4e5f6.webp',
    url: '/uploads/catalogs/banners/catalog-banner-1783260000000-a1b2c3d4e5f6.webp',
    mimetype: 'image/webp',
    size: 120000,
  },
  icon: 'trophy',
  isActive: true,
  sortOrder: 1,
  createdAt: '2026-06-20T15:00:00.000Z',
  updatedAt: '2026-06-20T15:00:00.000Z',
};

export const categoryExample = {
  _id: ids.category,
  name: 'Science',
  gameplayMode: 'STANDARD',
  slug: 'science',
  description: 'Science and discovery questions',
  catalogId: ids.catalog,
  catalog: {
    _id: ids.catalog,
    name: catalogExample.name,
    slug: catalogExample.slug,
  },
  banner: {
    filename: 'category-banner-1783260000000-a1b2c3d4e5f6.webp',
    path: 'uploads/categories/banners/category-banner-1783260000000-a1b2c3d4e5f6.webp',
    url: '/uploads/categories/banners/category-banner-1783260000000-a1b2c3d4e5f6.webp',
    mimetype: 'image/webp',
    size: 120000,
  },
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-06-20T15:00:00.000Z',
  updatedAt: '2026-06-20T15:00:00.000Z',
};

export const questionExample = {
  _id: ids.question,
  category: categoryExample,
  question: 'What planet is known as the Red Planet?',
  answer: 'Mars',
  explanation: 'Mars appears red because of iron oxide on its surface.',
  difficulty: 'easy',
  points: 200,
  type: 'text',
  status: 'approved',
  source: 'manual',
  isFreeGameQuestion: true,
  createdAt: '2026-06-20T15:00:00.000Z',
  updatedAt: '2026-06-20T15:00:00.000Z',
};

export const publicQuestionExample: Omit<typeof questionExample, 'answer'> =
  (() => {
    const copy: Partial<typeof questionExample> = { ...questionExample };
    delete copy.answer;
    return copy as Omit<typeof questionExample, 'answer'>;
  })();

export const gameExample = {
  _id: ids.game,
  name: 'Friday Family Game',
  owner: userExample,
  isFreeGame: true,
  questionSelectionMode: 'fixed',
  status: 'active',
  teams: [
    { name: 'Team Falcons', members: ['Muath', 'Sara'], score: 0 },
    { name: 'Team Stars', members: ['Noura', 'Fahad'], score: 0 },
  ],
  selectedCategories: [categoryExample],
  board: [
    {
      category: categoryExample,
      questions: [
        {
          question: publicQuestionExample,
          points: 200,
          isAnswered: false,
          isAnswerRevealed: false,
        },
      ],
    },
  ],
  currentTurnTeamIndex: 0,
  createdAt: '2026-06-20T15:00:00.000Z',
  updatedAt: '2026-06-20T15:00:00.000Z',
};

export const revealedGameExample = {
  ...gameExample,
  board: [
    {
      category: categoryExample,
      questions: [
        {
          question: questionExample,
          points: 200,
          isAnswered: false,
          isAnswerRevealed: true,
        },
      ],
    },
  ],
};
