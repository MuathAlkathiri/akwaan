import { Injectable } from '@nestjs/common';

export const LIVE_SESSION_CLOCK = Symbol('LIVE_SESSION_CLOCK');

export interface LiveSessionClock {
  now(): Date;
}

@Injectable()
export class SystemLiveSessionClock implements LiveSessionClock {
  now(): Date {
    return new Date();
  }
}
