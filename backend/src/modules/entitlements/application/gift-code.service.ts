import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CampaignRepository } from '../persistence/campaign.repository';
import { TokenLedgerService } from './token-ledger.service';

export const GIFT_CODE_ERRORS = {
  UNKNOWN: 'GIFT_CODE_UNKNOWN',
  ALREADY_USED: 'GIFT_CODE_ALREADY_USED',
  USED_UP: 'GIFT_CODE_USED_UP',
  TAKEN: 'GIFT_CODE_TAKEN',
} as const;

/** One spelling of a code, however it was typed. */
export const normaliseGiftCode = (raw: string): string =>
  raw.trim().toUpperCase();

const refuse = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ statusCode: status, code, message }, status);

/**
 * Codes that put Matches on a balance.
 *
 * What a player needs from one is an answer on the spot: it worked, or it has
 * run out. So every refusal here is a sentence they can read, and the order
 * of the steps is chosen so that a code can never be over-used or used twice
 * by one account, whatever arrives at the same moment.
 */
@Injectable()
export class GiftCodeService {
  private readonly logger = new Logger(GiftCodeService.name);

  constructor(
    private readonly campaign: CampaignRepository,
    private readonly tokens: TokenLedgerService,
  ) {}

  list() {
    return this.campaign.listCodes();
  }

  async create(input: {
    code: string;
    tokens: number;
    maxRedemptions: number;
    note?: string;
  }) {
    const code = normaliseGiftCode(input.code);
    const created = await this.campaign.createCode({ ...input, code });
    if (!created) {
      throw refuse(
        HttpStatus.CONFLICT,
        GIFT_CODE_ERRORS.TAKEN,
        'فيه كود بنفس الاسم.',
      );
    }
    return this.campaign.findCode(code);
  }

  async setActive(rawCode: string, active: boolean): Promise<void> {
    const found = await this.campaign.setCodeActive(
      normaliseGiftCode(rawCode),
      active,
    );
    if (!found) {
      throw refuse(
        HttpStatus.NOT_FOUND,
        GIFT_CODE_ERRORS.UNKNOWN,
        'ما لقينا هالكود.',
      );
    }
  }

  async redeem(
    accountId: string,
    rawCode: string,
  ): Promise<{ tokens: number; balance: number }> {
    const code = normaliseGiftCode(rawCode);
    const gift = await this.campaign.findCode(code);
    if (!gift || !gift.active) {
      throw refuse(
        HttpStatus.NOT_FOUND,
        GIFT_CODE_ERRORS.UNKNOWN,
        'الكود مو صحيح. تأكد منه وجرّب مرة ثانية.',
      );
    }

    // The account's own row first: it is what stops one person using a code
    // twice, and it costs the code nothing if they already have.
    if (!(await this.campaign.recordRedemption(code, accountId))) {
      throw refuse(
        HttpStatus.CONFLICT,
        GIFT_CODE_ERRORS.ALREADY_USED,
        'استخدمت هالكود من قبل.',
      );
    }
    if (!(await this.campaign.takeUse(code))) {
      await this.campaign.forgetRedemption(code, accountId);
      throw refuse(HttpStatus.CONFLICT, GIFT_CODE_ERRORS.USED_UP, 'الكود خلص.');
    }

    const movement = await this.tokens.grant({
      accountId,
      amount: gift.tokens,
      reason: 'gift-code',
      reference: code,
      // Keyed on the pair, so a retry after a dropped reply adds nothing more.
      idempotencyKey: `gift:${code}:${accountId}`,
    });
    this.logger.log({
      event: 'gift_code_redeemed',
      code,
      accountId,
      tokens: gift.tokens,
    });
    return { tokens: gift.tokens, balance: movement.balanceAfter };
  }
}
