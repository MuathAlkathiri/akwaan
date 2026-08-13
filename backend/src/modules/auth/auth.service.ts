import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtTokenProvider } from './infrastructure/jwt-token.provider';
import { PasswordHasherService } from './infrastructure/password-hasher.service';
import { mapUserResponse } from '../users/mappers/user-response.mapper';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: JwtTokenProvider,
    private readonly passwords: PasswordHasherService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedAdmin();
  }

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
    if (!user || !(await this.passwords.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    return mapUserResponse(await this.users.findById(userId));
  }

  private async seedAdmin(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;
    if (await this.users.findByEmailForAuthentication(email)) return;
    await this.users.create({
      fullName: this.config.get<string>('ADMIN_FULL_NAME') ?? 'Admin',
      email,
      password: await this.passwords.hash(password),
      role: UserRole.ADMIN,
    });
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
