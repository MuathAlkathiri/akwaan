import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export { AuthenticatedUser } from '../../modules/auth/auth.types';
import { AuthenticatedUser } from '../../modules/auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
