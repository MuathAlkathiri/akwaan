export type LiveSessionActor =
  | { kind: 'user'; actorId: string }
  | {
      kind: 'participant';
      actorId: string;
      sessionId: string;
      participantId: string;
      role: 'team-player' | 'observer';
      credentialVersion: number;
    };

export function actorSnapshotId(actor: LiveSessionActor): string {
  return actor.kind === 'user' ? actor.actorId : actor.participantId;
}
