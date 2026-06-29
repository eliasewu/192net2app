// ============================================================
// react-dom/client ambient module declaration
// ============================================================
// In a clean npm install, @types/react-dom provides these typings.
// In this sandbox the package isn't resolvable, so we ship the minimal
// surface main.tsx actually uses. Add fields here if you need more
// react-dom APIs in main.tsx or testing utilities.
declare module 'react-dom/client' {
  import { ReactNode } from 'react';

  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(
    container: Element | DocumentFragment
  ): Root;
}
