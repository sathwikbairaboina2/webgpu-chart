interface Destroyable {
  destroy(): void;
}

/**
 * Builds something on a device the caller acquired and takes ownership of that device: it is destroyed when the
 * build throws and when `release` runs. Kept structural so the public declarations never name GPU types.
 */
export async function buildOwned<T extends Destroyable>(
  device: Destroyable,
  build: () => Promise<T>,
): Promise<{ value: T; release: () => void }> {
  let value: T;
  try {
    value = await build();
  } catch (e) {
    device.destroy();
    throw e;
  }
  let released = false;
  return {
    value,
    release: () => {
      if (released) return;
      released = true;
      try {
        value.destroy();
      } finally {
        device.destroy();
      }
    },
  };
}
