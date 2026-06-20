/**
 * Standardized Modal Size System
 * 
 * This file defines consistent modal sizing classes for use across the application.
 * All modals should use these standardized sizes for consistency and responsiveness.
 * 
 * Usage:
 *   <DialogContent className={MODAL_SIZES.sm}>
 *   <DialogContent className={MODAL_SIZES.md}>
 *   <DialogContent className={MODAL_SIZES.lg}>
 *   <DialogContent className={MODAL_SIZES.xl}>
 *   <DialogContent className={MODAL_SIZES.full}>
 */

export const MODAL_SIZES = {
  /**
   * Extra Small Modal (480px)
   * Use for: Compact confirmations, small alerts, minimal forms
   * Mobile: Full width with padding
   */
  xs: "w-[95vw] sm:max-w-[480px] max-h-[90vh] overflow-y-auto",

  /**
   * Small Modal (400px)
   * Use for: Simple confirmations, alerts, small forms
   * Mobile: Full width with padding
   */
  sm: "w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto",

  /**
   * Small Medium Modal (500px)
   * Use for: Slightly larger small forms, compact dialogs
   * Mobile: Full width with padding
   */
  sm2: "w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto",

  /**
   * Medium Modal (600px)
   * Use for: Standard forms, detail views, single-item displays
   * Mobile: Full width with padding
   */
  md: "w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto",

  /**
   * Medium-Large Modal (700px)
   * Use for: Slightly larger forms, reports, order modals
   * Mobile: Full width with padding
   */
  ml: "w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto",

  /**
   * Large Modal (800px)
   * Use for: Complex forms, multi-section views, tables with data
   * Mobile: Full width with padding
   */
  lg: "w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto",

  /**
   * Extra Large Modal (1000px)
   * Use for: Very complex forms, large data tables, multi-column layouts
   * Mobile: Full width with padding
   */
  xl: "w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto",

  /**
   * Full Width Modal (95vw)
   * Use for: Patient overview, visit details, comprehensive dashboards
   * Mobile: Full width
   */
  full: "w-[95vw] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col",
} as const;

/** Right-side sheets — width aligned with dialog scale. */
export const SHEET_SIZES = {
  md: "w-full sm:max-w-[600px] overflow-y-auto",
  lg: "w-full sm:max-w-[800px] overflow-y-auto",
} as const;

/**
 * Modal with custom max-height
 * Use when content needs specific height constraints
 */
export const modalWithHeight = (size: keyof typeof MODAL_SIZES, maxHeight: string = "90vh") => {
  const base = MODAL_SIZES[size];
  return base.replace(/max-h-\[90vh\]/, `max-h-[${maxHeight}]`);
};

/**
 * Modal with no overflow (for flex layouts)
 * Use when modal content uses flex layout and needs overflow-hidden
 */
export const modalNoOverflow = (size: keyof typeof MODAL_SIZES) => {
  return MODAL_SIZES[size].replace(/overflow-y-auto/, "overflow-hidden");
};

