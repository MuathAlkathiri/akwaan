import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtTokenProvider } from './infrastructure/jwt-token.provider';
import { PasswordHasherService } from './infrastructure/password-hasher.service';
import { mapUserResponse } from '../users/mappers/user-response.mapper';

/**
 * Registration and password login.
 *
 * Notably absent: any way to become an administrator. The service used to seed
 * one from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on every boot, which meant a
 * privileged account could be created — with a known password — by whoever
 * could set an environment variable. The role is now granted by hand in
 * MongoDB, so there is no automated path to admin at all.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: JwtTokenProvider,
    private readonly passwords: PasswordHasherService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.users.create({
      fullName: dto.fullName,
      email: dto.email,
      password: await this.passwords.hash(dto.password),
      role: UserRole.USER,
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmailForAuthentication(dto.email);
    // An account created by OTP has no password hash. It must fail exactly like
    // a wrong password — a distinguishable error would reveal which accounts
    // are passwordless.
    if (
      !user ||
      !user.password ||
      !(await this.passwords.compare(dto.password, user.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    return mapUserResponse(await this.users.findById(userId));
  }

  private buildAuthResponse(
    user: Awaited<ReturnType<UsersService['create']>>,
  ): AuthResponseDto {
    return {
      accessToken: this.tokens.sign({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
      }),
      user: mapUserResponse(user),
    };
  }
}
