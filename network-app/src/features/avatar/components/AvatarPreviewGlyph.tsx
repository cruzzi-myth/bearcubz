import type { AvatarPreviewParams } from '../../../services/avatarPreview';
import type { AvatarSpeciesId } from '../../../types/player';

interface AvatarPreviewGlyphProps {
  params: AvatarPreviewParams;
  /** True while a species/foundation switch is "loading" — see
   * AvatarReferencePanel's brief scan delay. Renders a scan line
   * instead of the glyph; respects prefers-reduced-motion via CSS. */
  scanning?: boolean;
}

/**
 * A reactive SCHEMATIC avatar preview — not a rendered character.
 * There is no per-option artwork (only 9 species/foundation reference
 * portraits total), so this draws a simple per-species silhouette from
 * a handful of visual channels (computeAvatarPreviewParams) that
 * genuinely change as the player changes selections: color, build
 * scale, detail density, and — for Hybrid/Glitch — a real blend/
 * fragmentation read driven by their identity composition. Framed
 * explicitly as a schematic display everywhere it's used; never
 * implied to be the player's finished portrait.
 */
export function AvatarPreviewGlyph({ params, scanning = false }: AvatarPreviewGlyphProps) {
  if (scanning) {
    return (
      <svg viewBox="0 0 160 200" className="mr-avatar-glyph mr-avatar-glyph--scanning" role="img" aria-label="Loading species preview">
        <rect x="10" y="10" width="140" height="180" rx="8" fill="none" stroke="var(--cyan)" strokeOpacity="0.25" />
        <line x1="10" y1="100" x2="150" y2="100" className="mr-avatar-glyph__scanline" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 160 200" className="mr-avatar-glyph" role="img" aria-label={`${params.species} avatar schematic preview`}>
      <SpeciesShoulders params={params} />
      <SpeciesHead params={params} />
      {params.blendShape && <SpeciesAccents shape={params.blendShape} color={params.secondaryColor} opacity={params.blendAmount} />}
      <SpeciesAccents shape={params.baseShape} color={params.accentColor} opacity={params.blendShape ? 1 - params.blendAmount * 0.4 : 1} />
      <DetailMarks params={params} />
    </svg>
  );
}

function SpeciesShoulders({ params }: { params: AvatarPreviewParams }) {
  const halfWidth = 46 * params.scale;
  const cx = 80;
  return (
    <path
      d={`M ${cx - halfWidth} 185 Q ${cx} 150 ${cx + halfWidth} 185 L ${cx + halfWidth} 195 L ${cx - halfWidth} 195 Z`}
      fill="rgba(255,255,255,0.06)"
      stroke={params.primaryColor}
      strokeWidth="1.5"
    />
  );
}

function SpeciesHead({ params }: { params: AvatarPreviewParams }) {
  const shape = params.baseShape;
  const stroke = params.primaryColor;
  const fragmented = shape === 'glitch';
  const dashArray = fragmented ? `${Math.max(1, 6 - params.fragmentation * 1.5)} ${params.fragmentation * 3 + 2}` : undefined;

  switch (shape) {
    case 'alien':
      return (
        <ellipse cx="80" cy="95" rx="26" ry="34" fill="rgba(255,255,255,0.05)" stroke={stroke} strokeWidth="1.5" />
      );
    case 'ai':
      return (
        <polygon
          points="80,58 104,75 104,115 80,132 56,115 56,75"
          fill="rgba(255,255,255,0.05)"
          stroke={stroke}
          strokeWidth="1.5"
        />
      );
    case 'mythraxian':
      return <polygon points="80,58 106,95 80,134 54,95" fill="rgba(255,255,255,0.05)" stroke={stroke} strokeWidth="1.5" />;
    case 'glitch':
      return (
        <circle cx="80" cy="96" r="30" fill="rgba(255,255,255,0.05)" stroke={stroke} strokeWidth="1.5" strokeDasharray={dashArray} />
      );
    case 'human':
    case 'hybrid':
    default:
      return <circle cx="80" cy="96" r="30" fill="rgba(255,255,255,0.05)" stroke={stroke} strokeWidth="1.5" />;
  }
}

/** Small per-species distinguishing marks, drawn at a given opacity so
 * Hybrid can layer a secondary species' accent faintly on top of the
 * primary silhouette instead of needing real shape morphing. */
function SpeciesAccents({ shape, color, opacity }: { shape: AvatarSpeciesId; color: string; opacity: number }) {
  switch (shape) {
    case 'alien':
      return (
        <g opacity={opacity}>
          <polygon points="54,88 44,80 54,96" fill={color} />
          <polygon points="106,88 116,80 106,96" fill={color} />
          <circle cx="70" cy="92" r="3" fill={color} />
          <circle cx="90" cy="92" r="3" fill={color} />
        </g>
      );
    case 'ai':
      return (
        <g opacity={opacity}>
          <circle cx="70" cy="90" r="3.5" fill={color} />
          <circle cx="90" cy="90" r="3.5" fill={color} />
          <line x1="80" y1="58" x2="80" y2="48" stroke={color} strokeWidth="2" />
        </g>
      );
    case 'mythraxian':
      return (
        <g opacity={opacity} stroke={color} strokeWidth="1">
          <line x1="66" y1="80" x2="66" y2="110" />
          <line x1="94" y1="80" x2="94" y2="110" />
          <circle cx="74" cy="92" r="2.5" fill={color} stroke="none" />
          <circle cx="86" cy="92" r="2.5" fill={color} stroke="none" />
        </g>
      );
    case 'glitch':
      return (
        <g opacity={opacity} fill={color}>
          <rect x="48" y="72" width="5" height="5" />
          <rect x="108" y="110" width="4" height="4" />
          <rect x="60" y="120" width="3" height="3" />
        </g>
      );
    case 'human':
    default:
      return (
        <g opacity={opacity}>
          <circle cx="70" cy="92" r="3" fill={color} />
          <circle cx="90" cy="92" r="3" fill={color} />
        </g>
      );
  }
}

function DetailMarks({ params }: { params: AvatarPreviewParams }) {
  const count = params.detailIntensity * 2;
  if (count === 0) return null;
  const marks = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const r = 40 * params.scale;
    const x = 80 + Math.cos(angle) * r;
    const y = 170 + Math.sin(angle) * 10;
    marks.push(<circle key={i} cx={x} cy={y} r="1.6" fill={params.accentColor} opacity={0.7} />);
  }
  return <g>{marks}</g>;
}
