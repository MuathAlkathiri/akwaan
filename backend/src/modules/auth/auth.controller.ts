import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { userExample } from '../../common/swagger/examples';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    operationId: 'authRegister',
    summary: 'Register a new normal user',
  })
  @ApiBody({
    type: RegisterDto,
    examples: {
      default: {
        summary: 'Register user',
        value: {
          fullName: 'Muath',
          email: 'user@example.com',
          password: '123456',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseDto,
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: userExample,
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email is already registered',
    schema: {
      example: {
        statusCode: 409,
        message: 'Email is already registered',
        error: 'Conflict',
      },
    },
  })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({
    operationId: 'authLogin',
    summary: 'Login and receive a JWT access token',
  })
  @ApiBody({
    type: LoginDto,
    examples: {
      default: {
        summary: 'Login user',
        value: {
          email: 'user@example.com',
          password: '123456',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Login successful',
    type: AuthResponseDto,
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: userExample,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid email or password',
        error: 'Unauthorized',
      },
    },
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'authGetCurrentUser',
    summary: 'Get the current authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user returned successfully',
    type: UserResponseDto,
    schema: {
      example: userExample,
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }
}
