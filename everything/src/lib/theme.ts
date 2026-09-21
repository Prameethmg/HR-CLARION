// Shared design tokens for the app shell pass.
// Elevation: one raised-card treatment used by every card in the app.
export const CARD_CLASS =
  "rounded-xl border border-[#E9E2D6] bg-[#F7F5EF] shadow-[0_6px_20px_rgba(107,107,107,0.12)]";

// Avatar palette: 6 hues (reusing the pastel accent/status range), assigned
// deterministically by name so the same person always keeps the same color.
export const AVATAR_COLORS = [
  "bg-[#C8F169]",
  "bg-[#0F3D2C]",
  "bg-[#F7F5EF]",
  "bg-[#8FA88A]",
  "bg-[#E8B84B]",
  "bg-[#B8E0D0]",
];

// Tag palette for non-status labels (department, role). Deliberately muted
// warm grays so a department/role tag can never be confused with a
// green/amber/red status pill.
export const TAG_PALETTE = [
  "bg-[#EFE9DD] text-[#6B6B6B]",
  "bg-[#E9E2D4] text-[#6B6B6B]",
  "bg-[#ECE5D8] text-[#6B6B6B]",
  "bg-[#E5E0D6] text-[#6B6B6B]",
];
