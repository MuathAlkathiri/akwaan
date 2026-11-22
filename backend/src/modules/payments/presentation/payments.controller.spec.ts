import { ValidationPipe } from '@nestjs/common';
import { StartPurchaseDto } from './payments.controller';
import { TOKEN_PACKS } from '../domain/token-pack';

/**
 * The HTTP edge of the shop.
 *
 * The use-case tests call the application directly and so say nothing about
 * what the wire accepts. That gap shipped a checkout endpoint that answered
 * `400 property packId should not exist` to every request: the body carried no
 * validators, and this app validates with `forbidNonWhitelisted`, which rejects
 * exactly that. These run the real pipe with the real settings.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const asBody = { type: 'body' as const, metatype: StartPurchaseDto };

describe('what the checkout endpoint accepts', () => {
  it.each(TOKEN_PACKS.map((pack) => pack.id))(
    'accepts %s, because the catalogue sells it',
    async (id) => {
      await expect(pipe.transform({ packId: id }, asBody)).resolves.toEqual({
        packId: id,
      });
    },
  );

  it('refuses a pack the catalogue does not sell', async () => {
    await expect(
      pipe.transform({ packId: 'hundred-free' }, asBody),
    ).rejects.toThrow();
  });

  it('refuses a body with no pack at all', async () => {
    await expect(pipe.transform({}, asBody)).rejects.toThrow();
  });

  it('refuses a body that names an account', async () => {
    // The account comes from the token. A body that could name one would let
    // a player buy as somebody else — this is the check that keeps it out.
    await expect(
      pipe.transform(
        { packId: TOKEN_PACKS[0].id, accountId: 'someone-else' },
        asBody,
      ),
    ).rejects.toThrow();
  });
});
