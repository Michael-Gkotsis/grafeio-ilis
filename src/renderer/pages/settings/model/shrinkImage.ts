// Shrinks an uploaded picture to a 128×128 PNG for the «Τίτλος και λογότυπο» card.
// Purpose: `shrinkImage`, so a custom logo stays small in the settings (it is saved as a data URL).
// Does NOT: validate the size of the file or save anything.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6); needs the DOM canvas.
// Covering test: none (canvas and FileReader are not in the test DOM); the error texts are shown as a toast.

/** Side of the square PNG, in pixels. */
const LOGO_SIDE = 128;

/**
 * User picture → square PNG 128×128 (the picture is centred, not stretched).
 * @param file - PNG, JPG, GIF, BMP or SVG picked in the file box
 * @returns a `data:image/png` URL; rejects with an `Error` whose Greek message is shown to the user
 */
export function shrinkImage(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const rd = new FileReader();
    rd.onerror = () => fail(new Error('Δεν διαβάστηκε το αρχείο'));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => fail(new Error('Το αρχείο δεν είναι εικόνα που ανοίγει (PNG, JPG, GIF, BMP)'));
      img.onload = () => {
        const S = LOGO_SIDE;
        const c = document.createElement('canvas');
        c.width = S;
        c.height = S;
        const k = Math.min(S / img.width, S / img.height);
        const w = img.width * k;
        const h = img.height * k;
        c.getContext('2d')!.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        ok(c.toDataURL('image/png'));
      };
      img.src = String(rd.result);
    };
    rd.readAsDataURL(file);
  });
}
