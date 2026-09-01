import { Input } from "@/components/ui/input";
import type { OddPieceFormState } from "../../services/content-item-form.service";

export function OddPieceFields({
  value,
  onChange,
}: {
  value: OddPieceFormState;
  onChange: (next: OddPieceFormState) => void;
}) {
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

  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      data-testid="odd-piece-fields"
      dir="rtl"
    >
      <div>
        <h3 className="font-bold">القطعة الدخيلة</h3>
        <p className="text-xs text-muted-foreground">
          ثلاث صور من السيارة الأساسية وصورة واحدة من سيارة مختلفة، مع صورة
          كاملة تظهر بعد الحل.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span>هوية السيارة الأساسية</span>
          <Input
            value={value.targetVehicleIdentity}
            onChange={(event) =>
              onChange({ ...value, targetVehicleIdentity: event.target.value })
            }
            data-testid="odd-piece-target-identity"
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
        <label className="space-y-1 text-sm">
          <span>صورة السيارة الكاملة</span>
          <Input
            value={value.targetRevealImageUrl}
            onChange={(event) =>
              onChange({
                ...value,
                targetRevealImageUrl: event.target.value,
              })
            }
            dir="ltr"
          />
        </label>
      </div>
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
    </section>
  );
}
