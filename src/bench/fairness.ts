/** 32-bit FNV-1a over bytes. Used to prove every renderer got identical input (invariant 9). */
export class Fnv1a {
  private h = 0x811c9dc5;

  update(bytes: Uint8Array): this {
    let h = this.h;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    this.h = h;
    return this;
  }

  updateArray(a: Float32Array | Float64Array): this {
    return this.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }

  updateString(s: string): this {
    return this.update(new TextEncoder().encode(s));
  }

  hex(): string {
    return this.h.toString(16).padStart(8, "0");
  }
}
