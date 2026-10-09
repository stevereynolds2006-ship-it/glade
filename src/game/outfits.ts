export type OutfitId = "cowl" | "grin" | "skull" | "visor";

export type Outfit = {
  id: OutfitId;
  name: string;
  price: string;
  action: "buyCowl" | "buyGrin" | "buySkull" | "buyVisor";
  cut: OutfitId;
};

export const OUTFITS: readonly Outfit[] = [
  { id: "cowl", name: "Night Cowl", price: "4", action: "buyCowl", cut: "cowl" },
  { id: "grin", name: "Red Grin", price: "6", action: "buyGrin", cut: "grin" },
  { id: "skull", name: "Skull", price: "8", action: "buySkull", cut: "skull" },
  { id: "visor", name: "Visor", price: "10", action: "buyVisor", cut: "visor" },
];

export function outfitById(id: string) {
  return OUTFITS.find((item) => item.id === id);
}
