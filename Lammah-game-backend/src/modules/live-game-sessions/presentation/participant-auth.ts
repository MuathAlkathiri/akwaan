import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { LiveSessionActor } from '../application/live-session-actor';
import { ParticipantCredentialService } from '../application/participant-credential.service';
import { LiveSessionForbiddenError } from '../domain/live-session.errors';

export interface ParticipantRequest extends Request {
  liveParticipant?: {
    actor: LiveSessionActor;
    credential: string;
  };
}

@Injectable()
export class ParticipantCredentialGuard implements CanActivate {
  constructor(private readonly credentials: ParticipantCredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ParticipantRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new LiveSessionForbiddenError();
    }
    const credential = authorization.slice(7);
    const actor = await this.credentials.authenticate(credential);
    request.liveParticipant = { actor, credential };
    return true;
  }
}

export const CurrentLiveParticipant = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<ParticipantRequest>();
    if (!request.liveParticipant) throw new LiveSessionForbiddenError();
    return request.liveParticipant;
  },
);
