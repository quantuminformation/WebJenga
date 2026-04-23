import {
  loadFloatingWindowPositions,
  saveFloatingWindowPositions,
  type FloatingWindowPositions,
  type FloatingWindowPosition,
} from "./storage";

export interface FloatingWindowManager {
  bringToFront(windowElement: HTMLDivElement): void;
  clampOpen(): void;
  close(windowElement: HTMLDivElement): void;
  closeOpen(options?: { preserveIds?: string[] }): void;
  installDrag(windowElement: HTMLDivElement): void;
  open(windowElement: HTMLDivElement, onOpen: () => void): void;
}

export interface FloatingWindowManagerOptions {
  diagramShell: HTMLElement;
  onClose?(windowElement: HTMLDivElement): void;
  windows: HTMLDivElement[];
}

export function createFloatingWindowManager(
  options: FloatingWindowManagerOptions
): FloatingWindowManager {
  const floatingWindowPositions: FloatingWindowPositions = loadFloatingWindowPositions();
  let floatingWindowZ = 12;

  function getDefaultWindowPosition(windowId: string): FloatingWindowPosition {
    switch (windowId) {
      case "section":
        return { x: Math.max(272, options.diagramShell.clientWidth - 420), y: 92 };
      case "report":
        return { x: 420, y: 88 };
      case "info":
        return { x: 280, y: 120 };
      default:
        return { x: 32, y: 96 };
    }
  }

  function clampFloatingWindowPosition(windowElement: HTMLDivElement, x: number, y: number) {
    const margin = 12;
    const maxX = Math.max(margin, options.diagramShell.clientWidth - windowElement.offsetWidth - margin);
    const maxY = Math.max(margin, options.diagramShell.clientHeight - windowElement.offsetHeight - margin);

    return {
      x: Math.max(margin, Math.min(maxX, x)),
      y: Math.max(margin, Math.min(maxY, y)),
    };
  }

  function saveFloatingWindowPosition(windowElement: HTMLDivElement, x: number, y: number) {
    const windowId = windowElement.dataset.windowId;

    if (!windowId) {
      return;
    }

    floatingWindowPositions[windowId] = { x, y };
    saveFloatingWindowPositions(floatingWindowPositions);
  }

  function applyFloatingWindowPosition(windowElement: HTMLDivElement, x: number, y: number) {
    const clamped = clampFloatingWindowPosition(windowElement, x, y);
    const shellRect = options.diagramShell.getBoundingClientRect();
    windowElement.style.left = shellRect.left + clamped.x + "px";
    windowElement.style.top = shellRect.top + clamped.y + "px";
    windowElement.dataset.localX = String(clamped.x);
    windowElement.dataset.localY = String(clamped.y);
    saveFloatingWindowPosition(windowElement, clamped.x, clamped.y);
  }

  function bringToFront(windowElement: HTMLDivElement) {
    floatingWindowZ += 1;
    windowElement.style.zIndex = String(floatingWindowZ);
  }

  function close(windowElement: HTMLDivElement) {
    windowElement.classList.add("is-hidden");
    options.onClose?.(windowElement);
  }

  return {
    bringToFront,
    clampOpen() {
      options.windows.forEach(function (windowElement) {
        if (windowElement.classList.contains("is-hidden")) {
          return;
        }

        const currentX = Number.parseFloat(windowElement.dataset.localX || "0");
        const currentY = Number.parseFloat(windowElement.dataset.localY || "0");
        applyFloatingWindowPosition(windowElement, currentX, currentY);
      });
    },
    close,
    closeOpen(optionsArg) {
      const preserve = new Set(optionsArg?.preserveIds || []);

      options.windows.forEach(function (windowElement) {
        if (preserve.has(windowElement.id) || windowElement.classList.contains("is-hidden")) {
          return;
        }

        close(windowElement);
      });
    },
    installDrag(windowElement) {
      const dragHandle = windowElement.querySelector("[data-window-drag]") as HTMLElement | null;

      if (!dragHandle) {
        return;
      }

      dragHandle.addEventListener("pointerdown", function (event: PointerEvent) {
        const target = event.target as HTMLElement | null;

        if (target?.closest("button")) {
          return;
        }

        bringToFront(windowElement);
        const originX = Number.parseFloat(windowElement.dataset.localX || "0");
        const originY = Number.parseFloat(windowElement.dataset.localY || "0");
        const startX = event.clientX;
        const startY = event.clientY;

        dragHandle.setPointerCapture(event.pointerId);

        function handleMove(moveEvent: PointerEvent) {
          applyFloatingWindowPosition(
            windowElement,
            originX + moveEvent.clientX - startX,
            originY + moveEvent.clientY - startY
          );
        }

        function handleEnd(endEvent: PointerEvent) {
          dragHandle.releasePointerCapture(endEvent.pointerId);
          dragHandle.removeEventListener("pointermove", handleMove);
          dragHandle.removeEventListener("pointerup", handleEnd);
          dragHandle.removeEventListener("pointercancel", handleEnd);
        }

        dragHandle.addEventListener("pointermove", handleMove);
        dragHandle.addEventListener("pointerup", handleEnd);
        dragHandle.addEventListener("pointercancel", handleEnd);
      });
    },
    open(windowElement, onOpen) {
      windowElement.classList.remove("is-hidden");
      bringToFront(windowElement);

      window.requestAnimationFrame(function () {
        const windowId = windowElement.dataset.windowId || "";
        const savedPosition = floatingWindowPositions[windowId] || getDefaultWindowPosition(windowId);
        applyFloatingWindowPosition(windowElement, savedPosition.x, savedPosition.y);
        onOpen();
      });
    },
  };
}
