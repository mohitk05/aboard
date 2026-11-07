/**
 * Resolve a CSS custom property to a concrete colour MapLibre understands. Our tokens are
 * often expressions (light-dark(), var() chains, color-mix()), so let the browser compute them.
 */
export function cssColor(name: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${name}, ${fallback})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}
