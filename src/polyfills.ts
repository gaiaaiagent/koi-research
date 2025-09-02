/**
 * Polyfills needed for the knowledge plugin to work in Node.js environment
 * This file MUST be imported before any other imports that might need these polyfills
 */

// Polyfill for DOMMatrix needed by pdfjs-dist
if (typeof globalThis.DOMMatrix === 'undefined') {
  console.log('[KNOWLEDGE PLUGIN] Installing DOMMatrix polyfill');
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a: number = 1;
    b: number = 0;
    c: number = 0;
    d: number = 1;
    e: number = 0;
    f: number = 0;
    
    constructor(init?: number[] | Float32Array | Float64Array | DOMMatrixInit) {
      if (init) {
        if (Array.isArray(init) || init instanceof Float32Array || init instanceof Float64Array) {
          if (init.length >= 6) {
            this.a = init[0];
            this.b = init[1];
            this.c = init[2];
            this.d = init[3];
            this.e = init[4];
            this.f = init[5];
          }
        } else if (typeof init === 'object') {
          this.a = (init as any).a ?? 1;
          this.b = (init as any).b ?? 0;
          this.c = (init as any).c ?? 0;
          this.d = (init as any).d ?? 1;
          this.e = (init as any).e ?? 0;
          this.f = (init as any).f ?? 0;
        }
      }
    }
    
    multiply(other: DOMMatrix): DOMMatrix {
      // Basic 2D matrix multiplication
      const result = new (DOMMatrix as any)();
      result.a = this.a * other.a + this.c * other.b;
      result.b = this.b * other.a + this.d * other.b;
      result.c = this.a * other.c + this.c * other.d;
      result.d = this.b * other.c + this.d * other.d;
      result.e = this.a * other.e + this.c * other.f + this.e;
      result.f = this.b * other.e + this.d * other.f + this.f;
      return result;
    }
    
    translate(tx: number, ty: number): DOMMatrix {
      const result = new (DOMMatrix as any)();
      result.a = this.a;
      result.b = this.b;
      result.c = this.c;
      result.d = this.d;
      result.e = this.e + tx;
      result.f = this.f + ty;
      return result;
    }
    
    scale(sx: number, sy?: number): DOMMatrix {
      if (sy === undefined) sy = sx;
      const result = new (DOMMatrix as any)();
      result.a = this.a * sx;
      result.b = this.b * sx;
      result.c = this.c * sy;
      result.d = this.d * sy;
      result.e = this.e;
      result.f = this.f;
      return result;
    }
    
    inverse(): DOMMatrix {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) {
        throw new Error('Matrix is not invertible');
      }
      const result = new (DOMMatrix as any)();
      result.a = this.d / det;
      result.b = -this.b / det;
      result.c = -this.c / det;
      result.d = this.a / det;
      result.e = (this.c * this.f - this.d * this.e) / det;
      result.f = (this.b * this.e - this.a * this.f) / det;
      return result;
    }
  };
  console.log('[KNOWLEDGE PLUGIN] DOMMatrix polyfill installed successfully');
}

// Export empty object to make this a module
export {};

// Add type for DOMMatrixInit if not defined
interface DOMMatrixInit {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
  m11?: number;
  m12?: number;
  m21?: number;
  m22?: number;
  m41?: number;
  m42?: number;
}