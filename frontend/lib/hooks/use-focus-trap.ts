"use client";

import { useEffect, useRef } from 'react';

interface FocusTrapOptions {
  active?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  options: FocusTrapOptions = {}
) {
  const { active = true, restoreFocus = true, initialFocusRef } = options;
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;

    // Store the currently focused element
    if (restoreFocus) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    }

    // Focus the initial element if provided, otherwise focus the first focusable element
    const initialFocusElement = initialFocusRef?.current;
    if (initialFocusElement) {
      initialFocusElement.focus();
    } else {
      focusFirstFocusableElement(container);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(container);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    function handleClickOutside(event: MouseEvent) {
      if (!container.contains(event.target as Node)) {
        // Focus back to container
        focusFirstFocusableElement(container);
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);

      // Restore focus to previously focused element
      if (restoreFocus && previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [active, containerRef, restoreFocus, initialFocusRef]);
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ];

  const elements = container.querySelectorAll(focusableSelectors.join(', '));
  return Array.from(elements) as HTMLElement[];
}

function focusFirstFocusableElement(container: HTMLElement) {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  if (firstElement) {
    firstElement.focus();
  }
}