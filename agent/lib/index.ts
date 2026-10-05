/**
 * Extension Utilities Library
 *
 * Reusable utilities extracted from the extensions for common patterns:
 * - Config file management (reading, writing, watching)
 * - Command execution wrappers (git, gh, bash)
 * - Theme-aware text rendering (colors, truncation, layout)
 * - Text input component (wrapping, cursor tracking)
 * - Credential/host management (discovery, cycling)
 * - Async utilities (debounce, retry, pooling)
 */

// Config Management
export * from "./config-manager";

// Command Execution
export * from "./exec-utils";

// Theme-aware Text
export * from "./theme-text-utils";

// Text Input Component
export * from "./text-input-component";

// Credential Management
export * from "./credential-manager";

// Async Utilities
export * from "./async-utils";
