import { Connection, Model, Schema, Types } from 'mongoose';
import { PasswordHasherService } from '../../src/modules/auth/infrastructure/password-hasher.service';
import {
  Catalog,
  CatalogSchema,
} from '../../src/modules/catalogs/schemas/catalog.schema';
import {
  Category,
  CategorySchema,
} from '../../src/modules/categories/schemas/category.schema';
import {
  DifficultyLevel,
  Question,
  QuestionPoints,
  QuestionSchema,
  QuestionSource,
  QuestionStatus,
  QuestionType,
} from '../../src/modules/questions/schemas/question.schema';
import {
  SubscriptionStatus,
  User,
  UserRole,
  UserSchema,
} from '../../src/modules/users/schemas/user.schema';

export const fixtureCredentials = Object.freeze({
  admin: { email: 'admin@integration.invalid', password: 'TestAdmin!42' },
  user: { email: 'user@integration.invalid', password: 'TestUser!42' },
  expired: { email: 'expired@integration.invalid', password: 'TestUser!42' },
});

const ids = {
  catalog: new Types.ObjectId('700000000000000000000001'),
  admin: new Types.ObjectId('700000000000000000000002'),
  user: new Types.ObjectId('700000000000000000000003'),
  expired: new Types.ObjectId('700000000000000000000004'),
};

const categoryNames = ['علوم', 'رياضة', 'تاريخ', 'أفلام', 'ألعاب', 'جغرافيا'];

function model<T>(
  connection: Connection,
  name: string,
  schema: Schema,
): Model<T> {
  return (
    (connection.models[name] as Model<T> | undefined) ??
    connection.model<T>(name, schema)
  );
}

export async function seedIntegrationFixtures(connection: Connection) {
  const users = model<User>(connection, User.name, UserSchema);
  const catalogs = model<Catalog>(connection, Catalog.name, CatalogSchema);
  const categories = model<Category>(connection, Category.name, CategorySchema);
  const questions = model<Question>(connection, Question.name, QuestionSchema);
  const hasher = new PasswordHasherService();

  await catalogs.updateOne(
    { _id: ids.catalog },
    {
      $set: {
        name: { ar: 'اختبارات التكامل', en: 'Integration tests' },
        slug: 'integration-tests',
        isActive: true,
        sortOrder: 1,
      },
    },
    { upsert: true },
  );

  const userFixtures = [
    {
      _id: ids.admin,
      ...fixtureCredentials.admin,
      fullName: 'Integration Admin',
      role: UserRole.ADMIN,
      subscriptionStatus: SubscriptionStatus.NONE,
    },
    {
      _id: ids.user,
      ...fixtureCredentials.user,
      fullName: 'Integration User',
      role: UserRole.USER,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
    {
      _id: ids.expired,
      ...fixtureCredentials.expired,
      fullName: 'Expired Integration User',
      role: UserRole.USER,
      subscriptionStatus: SubscriptionStatus.EXPIRED,
      subscriptionExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  ];
  for (const fixture of userFixtures) {
    const { password, ...safe } = fixture;
    await users.updateOne(
      { _id: fixture._id },
      {
        $set: {
          ...safe,
          password: await hasher.hash(password),
          freeGamesUsed: 0,
        },
      },
      { upsert: true },
    );
  }

  const categoryIds: Types.ObjectId[] = [];
  for (const [index, name] of categoryNames.entries()) {
    const categoryId = new Types.ObjectId(
      `71000000000000000000000${index + 1}`,
    );
    categoryIds.push(categoryId);
    await categories.updateOne(
      { _id: categoryId },
      {
        $set: {
          name,
          slug: `integration-category-${index + 1}`,
          catalogId: ids.catalog,
          isActive: true,
          sortOrder: index,
          gameplayConfig: {
            gameModes: { trivia: 100 },
            questionTypes: { text: 100 },
            supportedAssetTypes: ['text'],
          },
        },
      },
      { upsert: true },
    );

    for (const [tierIndex, points] of [200, 400, 600].entries()) {
      for (let copy = 0; copy < 2; copy += 1) {
        const questionId = new Types.ObjectId(
          `72${index}${tierIndex}${copy}0000000000000000000`.slice(0, 24),
        );
        await questions.updateOne(
          { _id: questionId },
          {
            $set: {
              category: categoryId,
              question: `سؤال اختبار ${index + 1}-${points}-${copy + 1}`,
              answer: `إجابة ${index + 1}-${points}-${copy + 1}`,
              correctAnswer: `إجابة ${index + 1}-${points}-${copy + 1}`,
              explanation: 'بيانات اختبار تكامل حتمية',
              difficulty: [
                DifficultyLevel.EASY,
                DifficultyLevel.MEDIUM,
                DifficultyLevel.HARD,
              ][tierIndex],
              points: points as QuestionPoints,
              score: points,
              type: QuestionType.TEXT,
              status: QuestionStatus.APPROVED,
              source: QuestionSource.MANUAL,
              isFreeGameQuestion: true,
            },
          },
          { upsert: true },
        );
      }
    }
  }

  return { ids, categoryIds };
}
