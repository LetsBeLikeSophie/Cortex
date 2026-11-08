import { TextStyle, ViewStyle } from 'react-native';
import { MONO, OUTLINE, Theme, allEdges, bottomEdge, conceptOf, layerEdge, BODY_KR } from '../theme/themes';

// Per-concept styling for text fields and the small secondary buttons that
// sit inside sheets (앨범에서 선택 / 카메라로 촬영, inline confirm/cancel...),
// so a sheet's inner controls speak the same language as the sheet itself
// (see ModalSheet's SHEET table and Buttons.tsx).

// Box around a TextInput. Pair with the screen's own padding/size styles.
export function fieldStyle(theme: Theme): ViewStyle {
  switch (conceptOf(theme)) {
    case 'line':
      // Underline only -- writing straight onto the page.
      return { ...bottomEdge(OUTLINE, theme.line), borderRadius: 0, paddingHorizontal: 0, backgroundColor: 'transparent' };
    case 'border':
      return { ...allEdges(OUTLINE, theme.line), borderRadius: 14, backgroundColor: 'transparent' };
    case 'layer':
      // A slightly different paper tone instead of an outline.
      return { ...layerEdge(theme), borderRadius: 14, backgroundColor: theme.bg };
    case 'vintage':
      // Same underline as line: the card's ruling alone doesn't say where to type.
      return { ...bottomEdge(OUTLINE, theme.line), borderRadius: 0, paddingHorizontal: 0, backgroundColor: 'transparent' };
  }
}
