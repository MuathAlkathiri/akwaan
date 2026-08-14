import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthResponseDto } from '../../dto/auth-response.dto';
import { RequestOtp } from '../application/request-otp.use-case';
import { VerifyOtp } from '../application/verify-otp.use-case';
import { RequestOtpDto, RequestOtpResponseDto, VerifyOtpDto } from './otp.dto';

@ApiTags('Auth')
@Controller('auth/otp')
export class OtpController {
  constructor(
    private readonly requestOtp: RequestOtp,
    private readonly verifyOtp: VerifyOtp,
  ) {}

  @Post('request')
  @ApiOperation({
    operationId: 'authOtpRequest',
    summary: 'Request a one-time login code by email or phone',
    description:
      'Accepts an email address or Saudi mobile number. The response is identical whether or not an account exists. Phone requests currently return SMS_OTP_NOT_AVAILABLE because no SMS provider is integrated.',
  })
  @ApiResponse({ status: 201, type: RequestOtpResponseDto })
  @ApiResponse({ status: 429, description: 'Cooldown or rate limit' })
  @ApiResponse({
    status: 503,
    description: 'SMS_OTP_NOT_AVAILABLE or EMAIL_OTP_NOT_CONFIGURED',
  })
  request(@Body() body: RequestOtpDto, @Req() request: Request) {
    return this.requestOtp.execute({
      identifier: body.identifier,
      ip: clientIp(request),
    });
  }

  @Post('verify')
  @ApiOperation({
    operationId: 'authOtpVerify',
    summary: 'Exchange a one-time code for an access token',
    description:
      'Creates the account on first successful verification. Returns the same token payload as password login, so existing authenticated flows are unchanged.',
  })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'OTP_INVALID / OTP_EXPIRED' })
  @ApiResponse({
    status: 429,
    description:
      'OTP_RATE_LIMITED. A throttle, not a lockout — the code stays valid.',
  })
  verify(@Body() body: VerifyOtpDto, @Req() request: Request) {
    return this.verifyOtp.execute({
      identifier: body.identifier,
      code: body.code,
      ip: clientIp(request),
    });
  }
}

/**
 * The caller's IP, as far as it can be trusted.
 *
 * Render terminates TLS and proxies, so the socket address is the proxy's.
 * `request.ip` is the value Express derives, which respects `trust proxy` when
 * it is configured; the left-most `x-forwarded-for` entry is the fallback. This
 * is best-effort by nature — IP limiting is a speed bump here, and the
 * per-identifier limit is the control that actually holds.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(',')[0]?.trim();
  return first || request.ip || null;
}
