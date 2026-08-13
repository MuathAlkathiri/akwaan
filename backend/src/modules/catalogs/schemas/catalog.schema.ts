import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { StoredLocalImage } from '../../../common/uploads/local-image-storage.service';

export class LocalizedText {
  ar: string;
  en: string;
}

export class CatalogBanner implements StoredLocalImage {
  filename: string;
  path: string;
  url: string;
  mimetype: string;
  size: number;
}

@Schema({ timestamps: true })
export class Catalog extends Document {
  @Prop({
    type: {
      ar: { type: String, required: true, trim: true },
      en: { type: String, required: true, trim: true },
    },
    required: true,
    _id: false,
  })
  name: LocalizedText;

  @Prop({
    type: {
      ar: { type: String, trim: true },
      en: { type: String, trim: true },
    },
    required: false,
    _id: false,
  })
  description?: LocalizedText;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string;

  @Prop({
    type: {
      filename: { type: String, required: true },
      path: { type: String, required: true },
      url: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
    },
    required: false,
    _id: false,
  })
  banner?: CatalogBanner;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

export const CatalogSchema = SchemaFactory.createForClass(Catalog);
