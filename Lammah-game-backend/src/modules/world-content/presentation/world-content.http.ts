import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export interface UploadedWorldContentAsset {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Shared image upload rules for every World Content admin endpoint. */
export const worldContentAssetInterceptor = FileInterceptor('asset', {
  limits: { fileSize: MAX_ASSET_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
      callback(
        new BadRequestException(
          'Asset must be a jpg, jpeg, png, or webp image',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
});

/** The response envelope the admin client already expects. */
export async function envelope<T>(value: T | Promise<T>) {
  return { statusCode: 200, data: await value };
}
