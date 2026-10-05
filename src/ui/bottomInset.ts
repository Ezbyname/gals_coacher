import { createContext } from 'react';

/**
 * True when something below the screens (the main navigation bar) already
 * keeps clear of the device's bottom safe area. Screens then add no bottom
 * inset of their own — otherwise the gap would be doubled.
 */
export const BottomInsetHandledContext = createContext(false);
