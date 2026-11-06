import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OddPieceFields } from "@/features/world-management/components/content-items/odd-piece-fields";
import type { OddPieceFormState } from "@/features/world-management/services/content-item-form.service";

const value: OddPieceFormState = {
  enabled: true,
  targetVehicleIdentity: "bmw-m4",
  targetVehicleLabel: "BMW M4",
  targetRevealImageUrl: "https://test/full.jpg",
  pieces: ["a", "b", "c", "d"].map((localId, index) => ({
    localId,
    vehicleIdentity: index < 3 ? "bmw-m4" : "amg-c63",
    vehicleLabel: index < 3 ? "BMW M4" : "Mercedes-AMG C63",
    imageUrl: `https://test/${localId}.jpg`,
  })),
};

describe("Odd Piece Admin fields", () => {
  it("shows four ordered visual editors and the mandatory full reveal", () => {
    render(<OddPieceFields value={value} onChange={vi.fn()} />);
    expect(screen.getAllByTestId(/^odd-piece-visual-/)).toHaveLength(4);
    expect(
      screen.getByDisplayValue("https://test/full.jpg"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("amg-c63")).toBeInTheDocument();
  });

  it("exposes the V2 difficulty, provenance and normalized hotspot editor", () => {
    render(
      <OddPieceFields
        value={{
          ...value,
          version: 2,
          v2: {
            difficulty: "medium",
            modifiedImage: {
              url: "https://media.test/modified.jpg",
              width: "1200",
              height: "800",
              orientation: "landscape",
              assetOrigin: "ai-edited",
              sourceUrl: "https://source.test/modified",
              licenceNote: "",
              editedRegion: "front lamp",
              editModel: "local-mask-v1",
            },
            originalImage: {
              url: "https://media.test/original.jpg",
              width: "1200",
              height: "800",
              orientation: "landscape",
              assetOrigin: "authentic",
              sourceUrl: "https://source.test/original",
              licenceNote: "",
              editedRegion: "",
              editModel: "",
            },
            intruderVehicleIdentity: "amg-c63",
            intruderVehicleLabel: "Mercedes-AMG C63",
            intruderPartIdentity: "front-lamp",
            intruderPartLabel: "المصباح الأمامي",
            polygon: [
              { x: 0.4, y: 0.4 },
              { x: 0.6, y: 0.4 },
              { x: 0.6, y: 0.6 },
            ],
            tolerance: "0.02",
          },
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("odd-piece-v2-fields")).toBeInTheDocument();
    expect(screen.getByTestId("odd-piece-v2-difficulty")).toHaveValue("medium");
    expect(screen.getByTestId("odd-piece-hotspot-editor")).toBeInTheDocument();
    expect(screen.getByTestId("odd-piece-hotspot-point-1")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://source.test/modified"),
    ).toBeInTheDocument();
  });
});
