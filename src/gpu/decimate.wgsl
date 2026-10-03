// M4 decimation: one invocation per pixel column (ADR 0002).
// The column formula must stay identical to columnOf() in src/core/decimate.ts.

struct View {
  t0: f32,
  scale: f32,
  width: u32,
  oldest: u32,
  capacity: u32,
  start: u32,
  end: u32,
  _pad: u32,
};

struct Bucket {
  minY: f32,
  maxY: f32,
  firstY: f32,
  lastY: f32,
  n: u32,
  _p0: u32,
  _p1: u32,
  _p2: u32,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> ring: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> buckets: array<Bucket>;

fn sampleAt(k: u32) -> vec2<f32> {
  return ring[(view.oldest + k) % view.capacity];
}

fn columnOf(t: f32) -> u32 {
  let c = floor((t - view.t0) * view.scale);
  return u32(clamp(c, 0.0, f32(view.width - 1u)));
}

// First logical index in [start, end) whose column is >= c.
fn firstIndexOf(c: u32) -> u32 {
  var lo = view.start;
  var hi = view.end;
  loop {
    if (lo >= hi) { break; }
    let mid = lo + (hi - lo) / 2u;
    if (columnOf(sampleAt(mid).x) < c) { lo = mid + 1u; } else { hi = mid; }
  }
  return lo;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let c = gid.x;
  if (c >= view.width) { return; }
  var b: Bucket;
  var k = firstIndexOf(c);
  loop {
    if (k >= view.end) { break; }
    let s = sampleAt(k);
    if (columnOf(s.x) != c) { break; }
    if (b.n == 0u) {
      b.minY = s.y;
      b.maxY = s.y;
      b.firstY = s.y;
    } else {
      b.minY = min(b.minY, s.y);
      b.maxY = max(b.maxY, s.y);
    }
    b.lastY = s.y;
    b.n = b.n + 1u;
    k = k + 1u;
  }
  buckets[c] = b;
}
