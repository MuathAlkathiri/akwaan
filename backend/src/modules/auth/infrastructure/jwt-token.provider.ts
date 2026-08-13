import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../auth.types';

@Injectable()
export class JwtTokenProvider {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }
}
