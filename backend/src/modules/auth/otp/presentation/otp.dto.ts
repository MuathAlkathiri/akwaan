import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    description:
      'Email address or Saudi mobile number. Normalized server-side; 05xxxxxxxx, 5xxxxxxxx and +9665xxxxxxxx all resolve to the same account.',
    example: 'user@example.com',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  identifier: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  identifier: string;

  @ApiProperty({ description: 'The six-digit code.', example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class RequestOtpResponseDto {
  @ApiProperty({
    description:
      'Always "sent" for an accepted request. Deliberately identical whether or not the identifier has an account, so the endpoint cannot be used to discover who is registered.',
    example: 'sent',
  })
  status: 'sent';

  @ApiProperty({ enum: ['email', 'phone'], example: 'email' })
  channel: 'email' | 'phone';

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;

  @ApiProperty({ example: 60 })
  resendAvailableInSeconds: number;
}
