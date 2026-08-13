import { BadRequestException } from '@nestjs/common';
import { LocalImageStorageService } from './local-image-storage.service';

describe('LocalImageStorageService validation', () => {
  const service = new LocalImageStorageService({} as never);
  const validFile = {
    originalname: 'question.webp',
    mimetype: 'image/webp',
    size: 1024,
    buffer: Buffer.from('image'),
  };

  it.each([
    ['question.jpg', 'image/jpeg'],
    ['question.jpeg', 'image/jpeg'],
    ['question.png', 'image/png'],
    ['question.webp', 'image/webp'],
  ])('accepts supported image %s', (originalname, mimetype) => {
    expect(() =>
      service.validate({ ...validFile, originalname, mimetype }),
    ).not.toThrow();
  });

  it('rejects an unsupported image format', () => {
    expect(() =>
      service.validate({
        ...validFile,
        originalname: 'question.gif',
        mimetype: 'image/gif',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an image larger than 5MB', () => {
    expect(() =>
      service.validate({
        ...validFile,
        size: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow(BadRequestException);
  });
});
