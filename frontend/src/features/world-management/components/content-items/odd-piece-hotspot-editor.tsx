"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  HelpCircle,
  MousePointer2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  normalizedPointFromClient,
  pointWithinHotspot,
  validateNormalizedHotspotPolygon,
  validateHotspotTolerance,
  type NormalizedHotspotPoint,
} from "../../services/odd-piece-hotspot.geometry";

export interface OddPieceHotspotEditorProps {
  imageUrl: string;
  width: number;
  height: number;
  polygon: NormalizedHotspotPoint[];
  tolerance: number;
  onPolygonChange: (polygon: NormalizedHotspotPoint[]) => void;
  onImageDimensionsChange: (dimensions: {
    width: number;
    height: number;
    orientation: "landscape" | "portrait" | "square";
  }) => void;
}

const orientationOf = (width: number, height: number) =>
  width === height ? "square" : width > height ? "landscape" : "portrait";

export function OddPieceHotspotEditor({
  imageUrl,
  width,
  height,
  polygon,
  tolerance,
  onPolygonChange,
  onImageDimensionsChange,
}: OddPieceHotspotEditorProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [testPoint, setTestPoint] = useState<NormalizedHotspotPoint | null>(
    null,
  );
  const [imageError, setImageError] = useState(false);
  const polygonProblems = validateNormalizedHotspotPolygon(polygon);
  const toleranceProblems = validateHotspotTolerance(tolerance);
  const testAccepted = testPoint
    ? pointWithinHotspot(testPoint, polygon, tolerance)
    : undefined;

  useEffect(() => {
    if (draggingIndex === null) return undefined;
    const move = (event: PointerEvent) => {
      if (!frameRef.current || !width || !height) return;
      const point = normalizedPointFromClient(
        event,
        frameRef.current,
        width,
        height,
      );
      onPolygonChange(
        polygon.map((candidate, index) =>
          index === draggingIndex ? point : candidate,
        ),
      );
    };
    const stop = () => setDraggingIndex(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [draggingIndex, height, onPolygonChange, polygon, width]);

  const pointFromEvent = (event: { clientX: number; clientY: number }) => {
    if (!frameRef.current || !width || !height) return null;
    return normalizedPointFromClient(event, frameRef.current, width, height);
  };

  return (
    <div className="space-y-3" data-testid="odd-piece-hotspot-editor" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={drawing ? "default" : "outline"}
          disabled={!imageUrl || imageError}
          onClick={() => {
            setDrawing((current) => !current);
            setTesting(false);
          }}
          data-testid="odd-piece-hotspot-draw"
        >
          <Plus className="me-1.5 size-4" aria-hidden />
          {drawing ? "إيقاف الرسم" : "رسم نقطة"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!polygon.length}
          onClick={() => onPolygonChange([])}
          data-testid="odd-piece-hotspot-reset"
        >
          <RotateCcw className="me-1.5 size-4" aria-hidden />
          إعادة ضبط
        </Button>
        <Button
          type="button"
          size="sm"
          variant={testing ? "default" : "outline"}
          disabled={!imageUrl || imageError || drawing}
          onClick={() => {
            setTesting((current) => !current);
            setTestPoint(null);
          }}
          data-testid="odd-piece-hotspot-test"
        >
          <MousePointer2 className="me-1.5 size-4" aria-hidden />
          اختبار النقر
        </Button>
      </div>

      {!imageUrl ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          ارفع الصورة المعدّلة قبل رسم منطقة الإجابة.
        </div>
      ) : (
        <div
          ref={frameRef}
          className={`relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl border bg-muted ${
            imageError ? "border-destructive" : ""
          }`}
          data-testid="odd-piece-hotspot-frame"
          style={{
            aspectRatio: `${Math.max(width, 1)} / ${Math.max(height, 1)}`,
          }}
          onClick={(event) => {
            if (!testing || drawing || !imageUrl || imageError) return;
            const point = pointFromEvent(event);
            if (point) setTestPoint(point);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="معاينة الصورة المعدّلة"
            className="absolute inset-0 h-full w-full object-fill"
            onError={() => setImageError(true)}
            onLoad={(event) => {
              setImageError(false);
              const naturalWidth = event.currentTarget.naturalWidth;
              const naturalHeight = event.currentTarget.naturalHeight;
              if (naturalWidth && naturalHeight) {
                onImageDimensionsChange({
                  width: naturalWidth,
                  height: naturalHeight,
                  orientation: orientationOf(naturalWidth, naturalHeight),
                });
              }
            }}
          />
          {!imageError && (
            <svg
              className={`absolute inset-0 h-full w-full ${
                drawing ? "cursor-crosshair" : "cursor-pointer"
              }`}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-label="محرر منطقة الإجابة"
              onPointerDown={(event) => {
                if (!drawing || event.target !== event.currentTarget) return;
                const point = pointFromEvent(event);
                if (point) onPolygonChange([...polygon, point]);
              }}
            >
              {polygon.length >= 3 && (
                <>
                  <polygon
                    points={polygon
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                    fill="rgb(16 185 129 / 0.18)"
                    stroke="rgb(16 185 129)"
                    strokeWidth={0.003}
                  />
                  {tolerance > 0 && (
                    <polygon
                      points={polygon
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      fill="none"
                      stroke="rgb(245 158 11 / 0.75)"
                      strokeWidth={Math.max(tolerance * 2, 0.004)}
                      strokeDasharray="0.01 0.01"
                    />
                  )}
                </>
              )}
              {polygon.map((point, index) => (
                <circle
                  key={`${index}-${point.x}-${point.y}`}
                  cx={point.x}
                  cy={point.y}
                  r={0.014}
                  fill="white"
                  stroke="rgb(5 150 105)"
                  strokeWidth={0.004}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDraggingIndex(index);
                  }}
                />
              ))}
              {testPoint && (
                <circle
                  cx={testPoint.x}
                  cy={testPoint.y}
                  r={0.012}
                  fill={testAccepted ? "rgb(16 185 129)" : "rgb(239 68 68)"}
                  stroke="white"
                  strokeWidth={0.004}
                />
              )}
            </svg>
          )}
          {imageError && (
            <div className="absolute inset-0 grid place-items-center bg-background/90 p-4 text-center text-sm text-destructive">
              تعذر تحميل الصورة؛ لم يتم إنشاء أي نقطة.
            </div>
          )}
        </div>
      )}

      {testPoint && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
            testAccepted
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-destructive/40 bg-destructive/10"
          }`}
          data-testid="odd-piece-hotspot-test-result"
        >
          {testAccepted ? (
            <Check className="size-4 text-emerald-600" aria-hidden />
          ) : (
            <X className="size-4 text-destructive" aria-hidden />
          )}
          {testAccepted
            ? "النقرة مقبولة داخل منطقة الإجابة."
            : "النقرة مرفوضة."}
          <span className="ms-auto font-mono text-xs" dir="ltr">
            {testPoint.x.toFixed(3)}, {testPoint.y.toFixed(3)}
          </span>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {polygon.map((point, index) => (
          <div
            key={`point-${index}`}
            className="flex items-end gap-2 rounded-lg border p-2"
            data-testid={`odd-piece-hotspot-point-${index + 1}`}
          >
            <label className="flex-1 space-y-1 text-xs">
              <span>س{index + 1} — X</span>
              <Input
                type="number"
                min={0}
                max={1}
                step="0.001"
                value={point.x}
                dir="ltr"
                onChange={(event) => {
                  const x = Number(event.target.value);
                  if (!Number.isFinite(x)) return;
                  onPolygonChange(
                    polygon.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, x }
                        : candidate,
                    ),
                  );
                }}
              />
            </label>
            <label className="flex-1 space-y-1 text-xs">
              <span>Y</span>
              <Input
                type="number"
                min={0}
                max={1}
                step="0.001"
                value={point.y}
                dir="ltr"
                onChange={(event) => {
                  const y = Number(event.target.value);
                  if (!Number.isFinite(y)) return;
                  onPolygonChange(
                    polygon.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, y }
                        : candidate,
                    ),
                  );
                }}
              />
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`حذف النقطة ${index + 1}`}
              onClick={() =>
                onPolygonChange(
                  polygon.filter(
                    (_, candidateIndex) => candidateIndex !== index,
                  ),
                )
              }
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
      </div>

      {!!polygonProblems.length && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-1 font-semibold">
            <HelpCircle className="size-3.5" aria-hidden />
            المنطقة غير صالحة للحفظ
          </div>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {polygonProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      {!!toleranceProblems.length && (
        <p className="text-xs text-destructive">{toleranceProblems[0]}</p>
      )}
      <p className="text-xs text-muted-foreground">
        الإحداثيات تُحفظ كنسب من الصورة (0 إلى 1)، لذلك تبقى صحيحة مع التكبير
        والهواتف المختلفة. الأخضر هو المنطقة، والحد البرتقالي يوضح التسامح
        الفعلي.
      </p>
    </div>
  );
}
