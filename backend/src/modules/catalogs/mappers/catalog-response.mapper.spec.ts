import { CatalogResponseMapper } from './catalog-response.mapper';

describe('CatalogResponseMapper', () => {
  it('removes persistence metadata and local banner paths', () => {
    expect(
      CatalogResponseMapper.toResponse({
        _id: 'catalog-id',
        name: { ar: 'رياضة', en: 'Sports' },
        slug: 'sports',
        banner: { path: '/internal/file', url: '/uploads/banner.webp' },
        __v: 1,
      }),
    ).toEqual({
      _id: 'catalog-id',
      name: { ar: 'رياضة', en: 'Sports' },
      slug: 'sports',
      banner: { url: '/uploads/banner.webp' },
    });
  });
});
