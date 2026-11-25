import { windowPaneMask } from "./window-panes";

export interface PaneJob {
  image: ImageBitmap;
  left: number;
  top: number;
  step: number;
}

self.onmessage = ({ data }: MessageEvent<PaneJob>) => {
  const { image, left, top, step } = data;
  let mask: ImageBitmap | null = null;
  try {
    const { width, height } = image;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, width, height);
      const lights = windowPaneMask(pixels.data, width, height, left, top, step);
      if (lights) {
        ctx.putImageData(new ImageData(lights, width, height), 0, 0);
        mask = canvas.transferToImageBitmap();
      }
    }
  } finally {
    image.close(); // this worker's clone
    self.postMessage(mask, { transfer: mask ? [mask] : [] });
  }
};
