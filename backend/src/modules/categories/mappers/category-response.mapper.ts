import {
  CategoryAudioPolicy,
  CategoryGameplayMode,
} from '../schemas/category.schema';

export class CategoryResponseMapper {
  static toResponse(value: unknown): Record<string, unknown> {
    const source = this.toPlain(value);
    const { __v: _version, ...safe } = source;
    void _version;
    const banner =
      safe.banner && typeof safe.banner === 'object'
        ? this.safeBanner(safe.banner as Record<string, unknown>)
        : safe.banner;
    return {
      ...safe,
      _id: String(safe._id ?? ''),
      audioPolicy: safe.audioPolicy ?? CategoryAudioPolicy.OPTIONAL,
      // Deployment compatibility only. Remove after the gameplay-mode backfill
      // has been applied in every environment.
      gameplayMode: safe.gameplayMode ?? CategoryGameplayMode.STANDARD,
      ...(banner ? { banner } : {}),
    };
  }
  static toResponseList(values: unknown[]) {
    return values.map((value) => this.toResponse(value));
  }
  private static safeBanner(banner: Record<string, unknown>) {
    const { path: _path, ...safe } = banner;
    void _path;
    return safe;
  }
  private static toPlain(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && 'toObject' in value)
      return (
        value as {
          toObject(options?: { virtuals?: boolean }): Record<string, unknown>;
        }
      ).toObject({ virtuals: true });
    return (value ?? {}) as Record<string, unknown>;
  }
}
