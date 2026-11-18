import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { DeletionActor } from '../application/permanent-deletion/world-content-deletion.service';

/**
 * Confirming a reviewed deletion. The server never trusts a client-side plan:
 * it recomputes the impact inside the transaction and refuses if it no longer
 * matches `previewFingerprint`.
 */
export class ExecutePermanentDeletionDto {
  /** `fingerprint` from the preview the operator confirmed. */
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  previewFingerprint!: string;

  /**
   * Generated once per confirmation dialog and reused on retry, so a double
   * click or a network retry returns the first result instead of acting twice.
   */
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,100}$/)
  requestId!: string;

  /** Also remove disposable test history (abandoned/finished Matches). */
  @IsOptional()
  @IsBoolean()
  purgeDisposableHistory?: boolean;
}

export function deletionActor(user: AuthenticatedUser): DeletionActor {
  return { id: user.id, email: user.email, role: String(user.role) };
}
