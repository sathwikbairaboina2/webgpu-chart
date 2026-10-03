// Draws decimated columns as thick segments. Same rule as segmentsInto() in src/core/segments.ts:
// instance i < width: band of column i; instance i >= width: connector into column i - width.

struct Draw {
  size: vec2f,
  yRange: vec2f,
  lineWidth: f32,
  maxGap: u32,
  _pad: vec2u,
  color: vec4f,
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

@group(0) @binding(0) var<uniform> draw: Draw;
@group(0) @binding(1) var<storage, read> buckets: array<Bucket>;

struct VOut {
  @builtin(position) pos: vec4f,
};

fn yPx(y: f32) -> f32 {
  let span = draw.yRange.y - draw.yRange.x;
  return (draw.yRange.y - y) / select(span, 1.0, span == 0.0) * draw.size.y;
}

fn offscreen() -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
  return o;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let width = u32(draw.size.x);
  let isConnector = ii >= width;
  let c = select(ii, ii - width, isConnector);
  let b = buckets[c];
  if (b.n == 0u) { return offscreen(); }
  let x = f32(c) + 0.5;
  var a: vec2f;
  var e: vec2f;
  if (isConnector) {
    var p = i32(c) - 1;
    let lo = i32(c) - i32(draw.maxGap);
    loop {
      if (p < 0 || p < lo) { break; }
      if (buckets[u32(p)].n > 0u) { break; }
      p = p - 1;
    }
    if (p < 0 || p < lo) { return offscreen(); }
    a = vec2f(f32(p) + 0.5, yPx(buckets[u32(p)].lastY));
    e = vec2f(x, yPx(b.firstY));
  } else {
    a = vec2f(x, yPx(b.maxY) - 0.5);
    e = vec2f(x, yPx(b.minY) + 0.5);
  }
  let d = e - a;
  let len = length(d);
  let dir = select(vec2f(0.0, 1.0), d / len, len > 0.0);
  let nrm = vec2f(-dir.y, dir.x) * (draw.lineWidth * 0.5);
  var corners = array<vec2f, 6>(a - nrm, a + nrm, e - nrm, e - nrm, a + nrm, e + nrm);
  let px = corners[vi];
  var o: VOut;
  o.pos = vec4f(px.x / draw.size.x * 2.0 - 1.0, 1.0 - px.y / draw.size.y * 2.0, 0.0, 1.0);
  return o;
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(draw.color.rgb * draw.color.a, draw.color.a);
}
