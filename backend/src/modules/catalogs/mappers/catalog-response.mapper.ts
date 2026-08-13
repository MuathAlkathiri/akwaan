export class CatalogResponseMapper {
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
      ...(banner ? { banner } : {}),
    };
  }
  static toResponseList(values: unknown[]) {
    return values.map((value) => this.toResponse(value));
  }
  private static toPlain(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && 'toObject' in value)
      return (value as { toObject(): Record<string, unknown> }).toObject();
    return (value ?? {}) as Record<string, unknown>;
  }
  private static safeBanner(banner: Record<string, unknown>) {
    const { path: _path, ...safe } = banner;
    void _path;
    return safe;
  }
}
