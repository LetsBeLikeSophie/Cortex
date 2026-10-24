import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { ItemSource } from '../api/client';
import type { LayoutKey } from '../theme/themes';

interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

// Hand-drawn-feeling line icons, ported 1:1 from the design's inline SVGs.

export function ArchiveIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={1.5} y={1.5} width={15} height={15} rx={3} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M1.5 6.5h15" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={8} cy={8} r={5.2} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M11.8 11.8 16.5 16.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M9 3v12M3 9h12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// Three sliders -- "settings for this list" (the home tag tabs).
export function TuneIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M3 5h12M3 9h12M3 13h12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M11.5 3v4M6 7v4M12.5 11v4" stroke={color} strokeWidth={strokeWidth * 1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function CloseIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M4 4l10 10M14 4 4 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function StatsIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M3 15V9M9 15V3M15 15v-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ size = 18, color, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M11 3.5 5 9l6 5.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ProfileIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={9} cy={6.2} r={3.2} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M2.8 15.5c0-3.2 2.8-5.3 6.2-5.3s6.2 2.1 6.2 5.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M3.5 5h11M7 5V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4.5 5v9a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 13.5 14V5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7.3 8v4M10.7 8v4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// A padlock -- memo lock. Closed shackle when locked, open when not.
export function LockIcon({ size = 18, color, strokeWidth = 1.3, open = false }: IconProps & { open?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M4.5 8.5h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d={open ? "M6 8.5V5.8a3 3 0 0 1 5.8-1.1" : "M6 8.5V5.8a3 3 0 0 1 6 0v2.7"} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// A warning triangle with "!" -- "report this" (AI output that's wrong or
// offensive). A flag read as "bookmark".
export function ReportIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M9 2.8 16 15H2L9 2.8Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M9 7.3v3.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 12.9v.1" stroke={color} strokeWidth={strokeWidth + 0.4} strokeLinecap="round" />
    </Svg>
  );
}

// Box with an arrow out of the top -- "send this elsewhere" (share sheet).
export function ShareIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M9 2.5v9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M5.8 5.5 9 2.5l3.2 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function RestoreIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M3 9a6 6 0 1 0 1.8-4.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M3 3v4h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function YoutubeIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={1.5} y={4} width={15} height={10} rx={3} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M7.4 6.9v4.2l3.8-2.1z" fill={color} />
    </Svg>
  );
}

export function InstagramIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={1.8} y={1.8} width={14.4} height={14.4} rx={4} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={9} cy={9} r={3.4} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12.5} cy={5.5} r={0.9} fill={color} />
    </Svg>
  );
}

export function KakaotalkIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M9 2.3c-4.14 0-7.5 2.7-7.5 6s3.36 6 7.5 6c.42 0 .84-.03 1.24-.08l2.9 1.75-.72-2.9C11.8 12.03 13.5 10.3 13.5 8c0-3.3-2.02-5.7-4.5-5.7z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LinkIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={9} cy={9} r={6.4} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M11.4 6.4 9.7 9.7 6.4 11.4 8.1 8.1z" fill={color} />
    </Svg>
  );
}

export function MemoIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={3} y={2} width={12} height={14} rx={2} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M6 6.3h6M6 9.3h6M6 12.3h3.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function OtherIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={9} cy={9} r={6.2} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={9} cy={9} r={1.3} fill={color} />
    </Svg>
  );
}

// Dispatches on the item's source -- 'safari' covers generic web links
// (anything that isn't specifically instagram/youtube, see
// guessSourceFromUrl in SaveSheetScreen), so it gets the plain link/compass
// mark rather than a browser-specific logo.
export function SourceIcon({ source, size = 18, color, strokeWidth = 1.3 }: IconProps & { source: ItemSource }) {
  switch (source) {
    case 'youtube':
      return <YoutubeIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'instagram':
      return <InstagramIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'kakaotalk':
      return <KakaotalkIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'safari':
      return <LinkIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'memo':
      return <MemoIcon size={size} color={color} strokeWidth={strokeWidth} />;
    default:
      return <OtherIcon size={size} color={color} strokeWidth={strokeWidth} />;
  }
}

// Each layout icon draws the one visual trait that actually tells that
// layout apart from the rest, ported 1:1 from the design-preview artifact
// (cortex-style-preview.html) rather than invented fresh here -- a bare
// line, a line plus a color tick, a bordered box, two stacked boxes, two
// stacked boxes with a speck + grid pattern.
interface LayoutIconProps extends IconProps {
  accent?: string;
  surface?: string;
}

export function LayoutLineIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={5} y1={12} x2={19} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function LayoutThinBorderIcon({ size = 20, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={6} width={16} height={12} rx={3.5} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function LayoutLayeredIcon({ size = 20, color, accent, surface, strokeWidth = 1.4 }: LayoutIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={8} width={13} height={10} rx={3} fill={accent ?? color} opacity={0.55} />
      <Rect x={4} y={5} width={13} height={10} rx={3} fill={surface ?? 'none'} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function LayoutLayeredVintageIcon({ size = 20, color, accent, surface, strokeWidth = 1.4 }: LayoutIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={1} y1={21} x2={4.5} y2={17.5} stroke={color} strokeWidth={1} opacity={0.35} />
      <Line x1={1} y1={24} x2={6.5} y2={18.5} stroke={color} strokeWidth={1} opacity={0.35} />
      <Line x1={4} y1={24} x2={8.5} y2={19.5} stroke={color} strokeWidth={1} opacity={0.35} />
      <Rect x={7} y={8} width={13} height={10} rx={3} fill={accent ?? color} opacity={0.55} />
      <Circle cx={12} cy={13} r={0.9} fill={color} opacity={0.55} />
      <Circle cx={16} cy={13} r={0.9} fill={color} opacity={0.55} />
      <Rect x={4} y={5} width={13} height={10} rx={3} fill={surface ?? 'none'} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function LayoutIcon({ layoutKey, ...props }: LayoutIconProps & { layoutKey: LayoutKey }) {
  switch (layoutKey) {
    case 'line':
      return <LayoutLineIcon {...props} />;
    case 'thinBorder':
      return <LayoutThinBorderIcon {...props} />;
    case 'layered':
      return <LayoutLayeredIcon {...props} />;
    case 'layeredVintage':
      return <LayoutLayeredVintageIcon {...props} />;
  }
}

export function MicIcon({ size = 18, color, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={6.5} y={1.5} width={5} height={9} rx={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3.5 8.5a5.5 5.5 0 0 0 11 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 14v2.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 24, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 12.6 10 16.6 18 7.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Sentence-search mode marker -- a four-point sparkle, the usual shorthand
// for "AI reads what you typed" without spelling out "AI".
export function SparkleIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M9 1.8c.5 3.6 2.2 5.4 7.2 7.2-5 1.8-6.7 3.6-7.2 7.2-.5-3.6-2.2-5.4-7.2-7.2 5-1.8 6.7-3.6 7.2-7.2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Tag-search mode marker.
export function HashIcon({ size = 18, color, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M7 2.5 5.5 15.5M12.5 2.5 11 15.5M2.8 6.5h13M2.2 11.5h13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function DownloadIcon({ size = 18, color, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M9 2.5v9M5.2 7.8 9 11.6l3.8-3.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 12.5v1.8c0 .7.5 1.2 1.2 1.2h9.6c.7 0 1.2-.5 1.2-1.2v-1.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// Google's four-color "G" -- brand artwork for the sign-in button, so its
// colors are Google's own and never follow the theme.
export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}
