import { Injectable } from '@nestjs/common';

export const MATCH_CLOCK = Symbol('MATCH_CLOCK');

export interface MatchClock {
  now(): Date;
}

@Injectable()
export class SystemMatchClock implements MatchClock {
  now(): Date {
    return new Date();
  }
}
