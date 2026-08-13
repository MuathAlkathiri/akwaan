import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { seedIntegrationFixtures } from './integration.fixture';

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action !== 'seed' && action !== 'reset') {
    throw new Error('Expected fixture action: seed or reset');
  }
  const connection = await connectTestDatabase();
  try {
    await resetTestDatabase(connection);
    if (action === 'seed') await seedIntegrationFixtures(connection);
    process.stdout.write(
      `Integration fixtures ${action === 'seed' ? 'seeded' : 'reset'}\n`,
    );
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
