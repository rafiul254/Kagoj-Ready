export const BUILDATHON_ASSET = "/buildathon-sticker.png";
export const BUILDATHON_CHIP = "/buildathon-chip.png";
export const BUILDATHON_ALT =
  "Built for Ostad presents YUNet AIgnite Buildathon 2026 — official sticker";

/** Official buildathon sticker, shown in the masthead strip near the top of every page. */
export function BuildathonSticker() {
  return (
    <span className="sticker-link">
      <img src={BUILDATHON_CHIP} alt={BUILDATHON_ALT} />
    </span>
  );
}

/** Full-size official sticker, shown in the footer of every page and on printed reports. */
export default function BuildathonWatermark() {
  return (
    <div className="watermark">
      <img
        src={BUILDATHON_ASSET}
        alt={BUILDATHON_ALT}
        width="430"
        height="152"
      />
    </div>
  );
}
