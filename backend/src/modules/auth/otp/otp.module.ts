import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth.module';
import { UsersModule } from '../../users/users.module';
import { OtpConfig } from './application/otp-config';
import { OtpRateLimiter } from './application/otp-rate-limiter';
import { RequestOtp } from './application/request-otp.use-case';
import { VerifyOtp } from './application/verify-otp.use-case';
import { OtpCodeService } from './domain/otp-code';
import { OTP_CHALLENGE_REPOSITORY } from './domain/otp-challenge.repository';
import {
  EMAIL_OTP_DELIVERY,
  SMS_OTP_DELIVERY,
} from './domain/otp-delivery.provider';
import { MongooseOtpChallengeRepository } from './infrastructure/mongoose-otp-challenge.repository';
import {
  OtpChallengeDocument,
  OtpChallengeSchema,
} from './infrastructure/otp-challenge.schema';
import { ResendEmailOtpProvider } from './infrastructure/resend-email-otp.provider';
import { DisabledSmsOtpProvider } from './infrastructure/sms-otp.provider';
import { OtpController } from './presentation/otp.controller';

/**
 * Passwordless OTP login, one system for both channels.
 *
 * The delivery providers are the only vendor-aware classes in here. Everything
 * above them — normalization, challenge lifecycle, rate limits, user
 * resolution, token issuance — is channel-agnostic, which is what makes adding
 * SMS later an adapter rather than a redesign.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OtpChallengeDocument.name, schema: OtpChallengeSchema },
    ]),
    UsersModule,
    // Supplies JwtTokenProvider. AuthModule must not import OtpModule back —
    // the dependency runs one way so the graph stays acyclic.
    AuthModule,
  ],
  controllers: [OtpController],
  providers: [
    OtpConfig,
    OtpCodeService,
    OtpRateLimiter,
    RequestOtp,
    VerifyOtp,
    {
      provide: OTP_CHALLENGE_REPOSITORY,
      useClass: MongooseOtpChallengeRepository,
    },
    {
      provide: EMAIL_OTP_DELIVERY,
      useFactory: (config: ConfigService) => new ResendEmailOtpProvider(config),
      inject: [ConfigService],
    },
    {
      // Always the disabled provider. A real one is registered here in the
      // same commit that adds the adapter and its environment variables.
      provide: SMS_OTP_DELIVERY,
      useFactory: (config: ConfigService) => new DisabledSmsOtpProvider(config),
      inject: [ConfigService],
    },
  ],
  exports: [RequestOtp, VerifyOtp],
})
export class OtpModule {}
