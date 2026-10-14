export type OutfitId = "cowl" | "grin" | "skull" | "visor" | "wrap" | "beak" | "horns";

export type Outfit = {
  id: OutfitId;
  name: string;
  price: string;
  action: "buyCowl" | "buyGrin" | "buySkull" | "buyVisor" | "buyWrap" | "buyBeak" | "buyHorns";
  cut: OutfitId;
};

export const OUTFITS: readonly Outfit[] = [
  { id: "cowl", name: "Night Cowl", price: "1", action: "buyCowl", cut: "cowl" },
  { id: "grin", name: "Red Grin", price: "1", action: "buyGrin", cut: "grin" },
  { id: "skull", name: "Skull", price: "1", action: "buySkull", cut: "skull" },
  { id: "visor", name: "Visor", price: "1", action: "buyVisor", cut: "visor" },
  { id: "wrap", name: "Wraps", price: "1", action: "buyWrap", cut: "wrap" },
  { id: "beak", name: "Beak", price: "1", action: "buyBeak", cut: "beak" },
  { id: "horns", name: "Horns", price: "1", action: "buyHorns", cut: "horns" },
];

export function outfitById(id: string) {
  return OUTFITS.find((item) => item.id === id);
}
