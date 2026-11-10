import { useLayoutEffect, useRef } from "react";

export function useEditorDialog() {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }

    const trigger = document.activeElement;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.open = true;
    }
    dialog.querySelector("h2")?.focus();

    return () => {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.open = false;
      }
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
      }
    };
  }, []);

  return ref;
}
