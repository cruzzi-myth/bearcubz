// The 4 asset types the Visual Concept Gallery treats as "visual
// content" (see VisualGalleryPage.tsx). Shared here so every place
// that needs to answer "does this collaboration have visual content"
// — the Gallery itself, the Dashboard card's Visuals quick-link —
// uses the exact same definition and can never drift apart again
// (Stage I2G: the Dashboard card previously checked only
// 'visual_image', so a collaboration with just a track_cover showed
// Visuals as permanently unavailable even though the Gallery would
// have shown it).
export const VISUAL_ASSET_TYPES = new Set(['track_cover', 'alternate_cover', 'visual_image', 'visual_concept']);
