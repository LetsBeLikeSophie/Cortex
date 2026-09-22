import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ItemSource } from '../api/client';

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

// Home's 즐겨찾기 (favorites) toggle -- `filled` switches between an outline
// star (not pinned) and a solid one (pinned), same on/off pattern as
// TagChip's active state elsewhere.
export function StarIcon({ size = 18, color, strokeWidth = 1.3, filled = false }: IconProps & { filled?: boolean }) {
  const path =
    'M9 2.2l2.02 4.31 4.68.58-3.42 3.28.9 4.66L9 12.7l-4.18 2.33.9-4.66-3.42-3.28 4.68-.58z';
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d={path} fill={filled ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
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
