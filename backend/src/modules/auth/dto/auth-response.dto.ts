import { UserResponseDto } from '../../users/dto/user-response.dto';
import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT bearer access token' })
  accessToken: string;
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
