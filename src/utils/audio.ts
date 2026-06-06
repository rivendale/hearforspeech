let sharedAudioContext: AudioContext | null = null;

/**
 * Gets the shared, lazy-loaded AudioContext instance.
 * Reuses the existing context if active, or initializes a new one if needed.
 */
export function getSharedAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext is only available in the browser.');
  }

  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContextClass();
  }

  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch((err) => {
      console.warn('Failed to resume shared AudioContext:', err);
    });
  }

  return sharedAudioContext;
}

/**
 * Closes the shared AudioContext if it exists and is running.
 */
export async function closeSharedAudioContext(): Promise<void> {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    await sharedAudioContext.close();
    sharedAudioContext = null;
  }
}
