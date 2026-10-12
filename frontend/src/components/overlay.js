import React, { useEffect } from "react";

// A card floating over a faded page. Closes on a backdrop click, Escape, or the × button.
export default function Overlay({ title, onClose, children }) {
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // Clicks inside the card don't reach the backdrop, so only the faded area closes it
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-8 font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
        className="relative my-auto w-full max-w-sm bg-white rounded-md shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-grader-navy text-white px-5 py-3 flex items-center justify-between">
          <h2 id="overlay-title" className="text-[1.2em] font-bold m-0">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-white/80 hover:text-white">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Shared form styles for the overlay forms
export const overlayInput = "w-full px-3 py-2 rounded-[3px] border border-grader-border text-grader-text focus:outline-none focus:border-grader-navy";
export const overlayLabel = "block text-sm font-bold text-grader-muted mb-1";
export const overlaySubmit = "w-full py-2 rounded-[3px] bg-grader-green hover:brightness-110 text-white font-bold";
