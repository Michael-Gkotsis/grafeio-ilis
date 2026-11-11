// Deprecated path: the UI primitives moved to shared/ui/ (Phase 5.2). New code imports from './shared/ui' (and
// './shared/lib' for cx, missingOf, typing). This file stays until the screens are on TSX (Phase 7); `html` stays
// here because htm stays until then.
import React from 'react';
import htm from 'htm';

export const html = htm.bind(React.createElement) as (strings: TemplateStringsArray, ...values: any[]) => any;

export { cx } from './shared/lib/cx';
export { missingOf } from './shared/lib/missingOf';
export { typing, typingText } from './shared/lib/typing';
export {
  Alert, Badge, Button, Card, Dialog, DialogLeave, DiscardAsk, Icon, Kbd, Logo, PageHeader, Segmented, Sheet,
  SheetNav, Strip, Tabs, ToastProvider, VirtualList, Why, useDirty, useEscape, useMedia, useSheetNav, useToast,
  useToastPrune, useViewportHeight,
} from './shared/ui';
export type { Toast, ToastAction } from './shared/ui';
