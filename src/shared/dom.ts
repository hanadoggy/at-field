/**
 * Retrieves an element by ID or throws an Error if not found.
 */
export function getRequiredElement<T extends HTMLElement = HTMLElement>(
  id: string
): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`[ATF] Required element #${id} not found`);
  }
  return el as T;
}
