/**
 * The badges' pixel art: one character per pixel, "." is clear. Art, not interface chrome, so its
 * colours are fixed (they are the same in every theme).
 */
export interface PixelArt {
  palette: Record<string, string>;
  rows: string[];
}

const PALETTE: Record<string, string> = {
  o: "#1a1503",
  H: "#fff1b8",
  T: "#ffdd6e",
  K: "#f7c21b",
  k: "#c98f05",
  d: "#8a5f00",
  G: "#c9ccd0",
  g: "#8d9096",
  s: "#5a5d61",
  w: "#ffffff",
};

export const PIXEL_ART: Record<"founding" | "firstStone" | "keystone", PixelArt> = {
  founding: {
    palette: PALETTE,
    rows: [
      "..ooo.......",
      "..oGoooooooo",
      "..oGoHTTTKko",
      "..oGoTKKKko.",
      "..oGoKKKkkko",
      "..oGoooooooo",
      "..oGo.......",
      "..oGo.......",
      "ooooooooooo.",
      "oGGGGGGGggo.",
      "ogggggggsso.",
      "ooooooooooo.",
    ],
  },
  firstStone: {
    palette: PALETTE,
    rows: [
      ".............w..",
      "............www.",
      "......oooo...w..",
      "....ooHHTToo....",
      "..ooHHTTTTTToo..",
      "ooHHTTTTTTTTTToo",
      "ooTTTTTTTTTTTToo",
      "oKooTTTTTTTTooko",
      "oKKKooTTTTookkko",
      "oKKKKKooookkkkko",
      "oKKKdKKKkkkkkkko",
      "oKKddKKKkkkkkkko",
      "oKKKdKKKkkkkkkko",
      "oKKKdKKKkkkkkkko",
      "ooKddddKkkkkkkoo",
      "..ooKKKKkkkkoo..",
      "....ooKKkkoo....",
      "......oooo......",
    ],
  },
  keystone: {
    palette: PALETTE,
    rows: [
      "...oooooooooo...",
      "...oHTTTTTKko...",
      "oooooHTTTKkooooo",
      "oGGgoHTTTKkoGgso",
      "oGGggoHTKkoGgsso",
      "oGggsoHTKkoggsso",
      "oGggssoTkoggssso",
      "oGggsooooooggsso",
      "oGgso......ogsso",
      "oGgso......ogsso",
      "ooooo......ooooo",
      "oGgso......ogsso",
      "oGgso......ogsso",
      "ooooo......ooooo",
    ],
  },
};
