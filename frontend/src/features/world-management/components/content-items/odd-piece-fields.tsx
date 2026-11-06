"use client";

import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { UploadField } from "../shared/upload-field";
import {
  emptyOddPieceV2State,
  ODD_PIECE_DIFFICULTIES,
  type OddPieceFormState,
  type OddPieceHotspotImageFormState,
} from "../../services/content-item-form.service";
import { OddPieceHotspotEditor } from "./odd-piece-hotspot-editor";

export function OddPieceFields({
  value,
  onChange,
  onUploadImage,
}: {
  value: OddPieceFormState;
  onChange: (next: OddPieceFormState) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const v2 = value.v2 ?? emptyOddPieceV2State();
  const version = value.version ?? 1;

  const setPiece = (
    index: number,
    patch: Partial<OddPieceFormState["pieces"][number]>,
  ) =>
    onChange({
      ...value,
      pieces: value.pieces.map((piece, pieceIndex) =>
        pieceIndex === index ? { ...piece, ...patch } : piece,
      ),
    });

  const setV2 = (patch: Partial<typeof v2>) =>
    onChange({ ...value, version: 2, v2: { ...v2, ...patch } });

  const setV2Image = (
    key: "modifiedImage" | "originalImage",
    patch: Partial<OddPieceHotspotImageFormState>,
  ) => setV2({ [key]: { ...v2[key], ...patch } });

  const renderImageSource = (
    key: "modifiedImage" | "originalImage",
    label: string,
  ) => {
    const image = v2[key];
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <h4 className="font-semibold">{label}</h4>
        {onUploadImage && (
          <UploadField
            label="رفع صورة"
            existingUrl={image.url}
            value={null}
            shape="wide"
            onChange={async (file) => {
              if (!file) return;
              const url = await onUploadImage(file);
              setV2Image(key, { url });
            }}
          />
        )}
        <label className="block space-y-1 text-sm">
          <span>رابط الصورة</span>
          <Input
            value={image.url}
            onChange={(event) => setV2Image(key, { url: event.target.value })}
            dir="ltr"
            data-testid={`odd-piece-v2-${key}-url`}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span>العرض</span>
            <Input
              type="number"
              min={1}
              value={image.width}
              onChange={(event) =>
                setV2Image(key, { width: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span>الارتفاع</span>
            <Input
              type="number"
              min={1}
              value={image.height}
              onChange={(event) =>
                setV2Image(key, { height: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span>الاتجاه</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={image.orientation}
              onChange={(event) =>
                setV2Image(key, {
                  orientation: event.target
                    .value as OddPieceHotspotImageFormState["orientation"],
                })
              }
            >
              <option value="landscape">أفقي</option>
              <option value="portrait">عمودي</option>
              <option value="square">مربع</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span>أصل الأصل</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={image.assetOrigin}
              onChange={(event) =>
                setV2Image(key, {
                  assetOrigin: event.target
                    .value as OddPieceHotspotImageFormState["assetOrigin"],
                })
              }
            >
              <option value="authentic">صورة أصلية حقيقية</option>
              <option value="ai-edited">تعديل موضعي بمساعدة AI</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span>رابط المصدر</span>
            <Input
              value={image.sourceUrl}
              onChange={(event) =>
                setV2Image(key, { sourceUrl: event.target.value })
              }
              dir="ltr"
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs">
          <span>ملاحظة الحقوق (اختيارية)</span>
          <Input
            value={image.licenceNote}
            onChange={(event) =>
              setV2Image(key, { licenceNote: event.target.value })
            }
          />
        </label>
        {image.assetOrigin === "ai-edited" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span>منطقة التعديل</span>
              <Input
                value={image.editedRegion}
                onChange={(event) =>
                  setV2Image(key, { editedRegion: event.target.value })
                }
                placeholder="x=0.4,y=0.2,w=0.2,h=0.2"
                dir="ltr"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span>نموذج التعديل</span>
              <Input
                value={image.editModel}
                onChange={(event) =>
                  setV2Image(key, { editModel: event.target.value })
                }
                dir="ltr"
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  const editorDimensions = useMemo(() => {
    const width = Number(v2.modifiedImage.width);
    const height = Number(v2.modifiedImage.height);
    return {
      width: Number.isFinite(width) && width > 0 ? width : 16,
      height: Number.isFinite(height) && height > 0 ? height : 9,
    };
  }, [v2.modifiedImage.height, v2.modifiedImage.width]);

  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      data-testid="odd-piece-fields"
      dir="rtl"
    >
      <div>
        <h3 className="font-bold">القطعة الدخيلة</h3>
        <p className="text-xs text-muted-foreground">
          اختر عقد V1 القديم أو عقد V2 الجديد. لا تتحول السجلات القديمة
          تلقائياً.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span>إصدار العقد</span>
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={version}
          onChange={(event) => {
            const next = Number(event.target.value) as 1 | 2;
            onChange({
              ...value,
              version: next,
              v2: value.v2 ?? emptyOddPieceV2State(),
            });
          }}
          data-testid="odd-piece-version"
        >
          <option value={1}>V1 — أربع صور</option>
          <option value={2}>V2 — صورة واحدة ونقطة ساخنة</option>
        </select>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>هوية السيارة الأساسية</span>
          <Input
            value={value.targetVehicleIdentity}
            onChange={(event) =>
              onChange({ ...value, targetVehicleIdentity: event.target.value })
            }
            data-testid="odd-piece-target-identity"
            dir="ltr"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>اسم السيارة في الكشف</span>
          <Input
            value={value.targetVehicleLabel}
            onChange={(event) =>
              onChange({ ...value, targetVehicleLabel: event.target.value })
            }
          />
        </label>
      </div>

      {version === 2 ? (
        <div className="space-y-4" data-testid="odd-piece-v2-fields">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>الصعوبة</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={v2.difficulty}
                onChange={(event) =>
                  setV2({
                    difficulty: event.target.value as typeof v2.difficulty,
                  })
                }
                data-testid="odd-piece-v2-difficulty"
              >
                <option value="">اختر الصعوبة</option>
                {ODD_PIECE_DIFFICULTIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>تسامح النقر (منسوب للصورة)</span>
              <Input
                type="number"
                min={0}
                max={0.25}
                step="0.001"
                value={v2.tolerance}
                onChange={(event) => setV2({ tolerance: event.target.value })}
                dir="ltr"
                data-testid="odd-piece-v2-tolerance"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>هوية السيارة الدخيلة</span>
              <Input
                value={v2.intruderVehicleIdentity}
                onChange={(event) =>
                  setV2({ intruderVehicleIdentity: event.target.value })
                }
                dir="ltr"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>اسم السيارة الدخيلة</span>
              <Input
                value={v2.intruderVehicleLabel}
                onChange={(event) =>
                  setV2({ intruderVehicleLabel: event.target.value })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>هوية القطعة الدخيلة</span>
              <Input
                value={v2.intruderPartIdentity}
                onChange={(event) =>
                  setV2({ intruderPartIdentity: event.target.value })
                }
                dir="ltr"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>اسم القطعة الدخيلة</span>
              <Input
                value={v2.intruderPartLabel}
                onChange={(event) =>
                  setV2({ intruderPartLabel: event.target.value })
                }
              />
            </label>
          </div>
          {renderImageSource("modifiedImage", "الصورة المعدّلة")}
          <OddPieceHotspotEditor
            imageUrl={v2.modifiedImage.url}
            width={editorDimensions.width}
            height={editorDimensions.height}
            polygon={v2.polygon}
            tolerance={Number(v2.tolerance)}
            onPolygonChange={(polygon) => setV2({ polygon })}
            onImageDimensionsChange={(dimensions) =>
              setV2Image("modifiedImage", {
                width: String(dimensions.width),
                height: String(dimensions.height),
                orientation: dimensions.orientation,
              })
            }
          />
          {renderImageSource("originalImage", "الصورة الأصلية للكشف")}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            ثلاث صور من السيارة الأساسية وصورة واحدة من سيارة مختلفة، مع صورة
            كاملة تظهر بعد الحل.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {value.pieces.map((piece, index) => (
              <fieldset
                key={index}
                className="grid gap-2 rounded-lg border p-3"
                data-testid={`odd-piece-visual-${index + 1}`}
              >
                <legend className="px-1 text-sm font-bold">
                  القطعة {index + 1}
                </legend>
                <Input
                  aria-label={`معرف القطعة ${index + 1}`}
                  value={piece.localId}
                  onChange={(event) =>
                    setPiece(index, { localId: event.target.value })
                  }
                  placeholder="piece-1"
                  dir="ltr"
                />
                <Input
                  aria-label={`هوية سيارة القطعة ${index + 1}`}
                  value={piece.vehicleIdentity}
                  onChange={(event) =>
                    setPiece(index, { vehicleIdentity: event.target.value })
                  }
                  placeholder="bmw-m4"
                  dir="ltr"
                />
                <Input
                  aria-label={`اسم سيارة القطعة ${index + 1}`}
                  value={piece.vehicleLabel}
                  onChange={(event) =>
                    setPiece(index, { vehicleLabel: event.target.value })
                  }
                  placeholder="BMW M4"
                />
                <Input
                  aria-label={`صورة القطعة ${index + 1}`}
                  value={piece.imageUrl}
                  onChange={(event) =>
                    setPiece(index, { imageUrl: event.target.value })
                  }
                  placeholder="https://…"
                  dir="ltr"
                />
              </fieldset>
            ))}
          </div>
          <label className="space-y-1 text-sm">
            <span>صورة السيارة الكاملة</span>
            <Input
              value={value.targetRevealImageUrl}
              onChange={(event) =>
                onChange({ ...value, targetRevealImageUrl: event.target.value })
              }
              dir="ltr"
            />
          </label>
        </>
      )}
    </section>
  );
}
