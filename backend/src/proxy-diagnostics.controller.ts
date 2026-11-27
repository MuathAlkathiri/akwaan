import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from './common/decorators/roles.decorator';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserRole } from './modules/users/schemas/user.schema';

/**
 * What this process believes the caller's address is, and what it was told.
 *
 * Every per-IP limit — OTP verification, joining, reconnecting — is keyed on
 * `request.ip`, and `request.ip` is only the player's address if TRUST_PROXY
 * counts the hops in front of the app correctly. Count one too few and the
 * "client" is the edge proxy, which is the same address for a whole city of
 * players; one too many and a caller can name their own address in
 * `X-Forwarded-For`. The hop count is a property of the host, not of this
 * code, so it cannot be asserted in a test — it has to be measured where the
 * app actually runs.
 *
 * Open this as an admin and compare `ip` with what https://api.ipify.org says
 * you are. If they match, TRUST_PROXY is right. If `ip` is some other address
 * that also appears in `forwardedFor`, the count is too low.
 *
 * Admin-only: the forwarding chain names the host's internal proxies, which is
 * nobody else's business.
 */
@ApiExcludeController()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/diagnostics')
export class ProxyDiagnosticsController {
  @Get('client-ip')
  clientIp(@Req() request: Request) {
    const header = (name: string): string | null => {
      const value = request.headers[name];
      return (Array.isArray(value) ? value.join(', ') : value) ?? null;
    };
    return {
      ip: request.ip ?? null,
      ips: request.ips,
      trustProxy: (request.app.get('trust proxy') as unknown) ?? false,
      socket: request.socket.remoteAddress ?? null,
      forwardedFor: header('x-forwarded-for'),
      cfConnectingIp: header('cf-connecting-ip'),
      trueClientIp: header('true-client-ip'),
    };
  }
}
