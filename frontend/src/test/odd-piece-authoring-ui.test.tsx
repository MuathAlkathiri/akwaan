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
});
