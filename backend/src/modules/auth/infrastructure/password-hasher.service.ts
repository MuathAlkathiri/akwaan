import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordHasherService {
  private static readonly ROUNDS = 10;

  hash(password: string) {
    return bcrypt.hash(password, PasswordHasherService.ROUNDS);
  }

  compare(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }
}
