// ============================================================
// vitest setup — React 19 act polyfill for @testing-library/react
// ============================================================
// In React 19, Vitest's ESM module resolution doesn't auto-attach
// named exports like `act` to the default `React` namespace import.
// @testing-library/react accesses it via `React.act`, so we force it.
// ============================================================
import * as React from 'react';
import { act } from 'react';

// Explicitly attach act to the React namespace object
(React as unknown as Record<string, unknown>).act = act;

// Flag for libraries that check IS_REACT_ACT_ENVIRONMENT
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
