import { Connection, Model, Schema, Types } from 'mongoose';
import { PasswordHasherService } from '../../src/modules/auth/infrastructure/password-hasher.service';
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
  admin: new Types.ObjectId('700000000000000000000002'),
  user: new Types.ObjectId('700000000000000000000003'),
  expired: new Types.ObjectId('700000000000000000000004'),
};

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
  const hasher = new PasswordHasherService();

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

  return { ids };
}
