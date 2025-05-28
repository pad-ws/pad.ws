/**
 * Creates a debounced version of a function that delays its execution until after
 * the specified timeout has elapsed since the last time it was invoked.
 * 
 * @template T - The type of arguments the function accepts
 * @param {(...args: T) => void} fn - The function to debounce
 * @param {number} delayMs - The number of milliseconds to delay
 * @returns {DebouncedFunction<T>} A debounced version of the input function with additional methods
 * 
 * @example
 * // Basic usage
 * const debouncedSearch = debounce((query: string) => {
 *   searchAPI(query);
 * }, 300);
 * 
 * // Using the flush method to force execution
 * const debouncedSave = debounce(saveData, 500);
 * debouncedSave(formData);
 * // Later, if you need to force immediate execution:
 * debouncedSave.flush();
 */

// Define the interface for the debounced function
export interface DebouncedFunction<T extends any[]> {
  (...args: T): void;
  /**
   * Immediately executes the debounced function with the last provided arguments
   * and cancels any scheduled executions.
   */
  flush: () => void;
  /**
   * Cancels any scheduled executions without executing the function.
   */
  cancel: () => void;
}

export const debounce = <T extends any[]>(
  fn: (...args: T) => void,
  delayMs: number,
): DebouncedFunction<T> => {
  let timeoutId = 0;
  let pendingArgs: T | null = null;
  
  const debouncedFn = (...args: T): void => {
    pendingArgs = args;
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      pendingArgs = null;
      fn(...args);
    }, delayMs);
  };

  debouncedFn.flush = (): void => {
    clearTimeout(timeoutId);
    if (pendingArgs) {
      const currentArgs = pendingArgs;
      pendingArgs = null;
      fn(...currentArgs);
    }
  };

  debouncedFn.cancel = (): void => {
    pendingArgs = null;
    clearTimeout(timeoutId);
  };

  return debouncedFn;
};
