/**
 * GPU time per rendered frame via EXT_disjoint_timer_query_webgl2, where the browser
 * exposes it (desktop Chrome usually does; some mobile/XR browsers don't - then
 * `supported` is false and the overlay says "n/a").
 *
 * Queries complete a few frames late, so results are polled from a small queue and
 * `lastMs` is the most recent finished frame. In XR one render() draws both eyes, so the
 * figure covers the whole stereo frame. On tiled mobile GPUs (Quest) treat it as a guide,
 * not an exact number.
 */
export class GpuTimer {
  lastMs: number | null = null;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: WebGLQuery[] = [];
  private readonly free: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get supported(): boolean {
    return this.ext !== null;
  }

  begin(): void {
    // Skip a frame rather than pile up queries if results are slow to come back.
    if (!this.ext || this.active || this.pending.length > 4) return;
    const q = this.free.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.poll();
  }

  private poll(): void {
    const { gl, ext } = this;
    if (!ext) return;
    // A "disjoint" event (GPU clock change, context switch) invalidates results in flight.
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length > 0) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) this.lastMs = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
      this.free.push(q);
    }
  }
}
