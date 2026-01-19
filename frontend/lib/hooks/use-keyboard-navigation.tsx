"use client";

import React, { useEffect, useCallback } from 'react';

export interface KeyboardNavigationOptions {
  onEscape?: () => void;
  onEnter?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onTab?: (event: KeyboardEvent) => void;
  onShiftTab?: (event: KeyboardEvent) => void;
  enabled?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    onShiftTab,
    enabled = true,
    preventDefault = true
  } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const { key, shiftKey } = event;

    switch (key) {
      case 'Escape':
        if (onEscape) {
          if (preventDefault) event.preventDefault();
          onEscape();
        }
        break;

      case 'Enter':
        if (onEnter) {
          if (preventDefault) event.preventDefault();
          onEnter();
        }
        break;

      case 'ArrowUp':
        if (onArrowUp) {
          if (preventDefault) event.preventDefault();
          onArrowUp();
        }
        break;

      case 'ArrowDown':
        if (onArrowDown) {
          if (preventDefault) event.preventDefault();
          onArrowDown();
        }
        break;

      case 'ArrowLeft':
        if (onArrowLeft) {
          if (preventDefault) event.preventDefault();
          onArrowLeft();
        }
        break;

      case 'ArrowRight':
        if (onArrowRight) {
          if (preventDefault) event.preventDefault();
          onArrowRight();
        }
        break;

      case 'Tab':
        if (shiftKey && onShiftTab) {
          if (preventDefault) event.preventDefault();
          onShiftTab(event);
        } else if (!shiftKey && onTab) {
          if (preventDefault) event.preventDefault();
          onTab(event);
        }
        break;
    }
  }, [
    enabled,
    preventDefault,
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    onShiftTab
  ]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);
}

// Focus management utilities
export function focusFirstFocusableElement(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0] as HTMLElement;
  if (firstElement) {
    firstElement.focus();
  }
}

export function focusLastFocusableElement(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
  if (lastElement) {
    lastElement.focus();
  }
}

export function trapFocus(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

  function handleTabKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  container.addEventListener('keydown', handleTabKey);
  return () => container.removeEventListener('keydown', handleTabKey);
}

// Skip link component for accessibility
export function SkipLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-md"
    >
      {children}
    </a>
  );
}