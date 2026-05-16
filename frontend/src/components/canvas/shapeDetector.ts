/**
 * Shape detector — pure geometry, no external API.
 * Converts a freehand stroke (flat [x,y,x,y,...] point array) into a clean
 * geometric shape annotation plus measurement labels.
 *
 * Detected shapes: circle, triangle, rectangle, line.
 * Returns null if confidence is insufficient — caller keeps the freehand stroke.
 */
import type { Annotation } from '@/types';
import { makeAnnotationId } from './CanvasToolbar';

type Pt = [number, number];

// ── Geometry primitives ───────────────────────────────────────────────────────

function dist(a: Pt, b: Pt): number { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

function midPt(a: Pt, b: Pt): Pt { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

function perpDist(pt: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return dist(pt, a);
    const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return dist(pt, [a[0] + t * dx, a[1] + t * dy] as Pt);
}

/** Douglas-Peucker polyline simplification. */
function douglasPeucker(pts: Pt[], eps: number): Pt[] {
    if (pts.length <= 2) return pts;
    let maxD = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
        return [
            ...douglasPeucker(pts.slice(0, idx + 1), eps).slice(0, -1),
            ...douglasPeucker(pts.slice(idx), eps),
        ];
    }
    return [pts[0], pts[pts.length - 1]];
}

/** Interior angle at vertex v in degrees (rounded to integer). */
function angleDeg(a: Pt, v: Pt, c: Pt): number {
    const u: Pt = [a[0] - v[0], a[1] - v[1]];
    const w: Pt = [c[0] - v[0], c[1] - v[1]];
    const dot = u[0] * w[0] + u[1] * w[1];
    const mag = Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]);
    return mag < 0.001 ? 0 : Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI);
}

// ── Annotation factories ──────────────────────────────────────────────────────

function makeTxt(x: number, y: number, text: string, color: string, size = 14): Annotation {
    return { id: makeAnnotationId(), type: 'text', tool: { color, size }, x, y, text };
}

function makeShapeAnn(
    s: 'rect' | 'circle' | 'arrow' | 'line' | 'polygon',
    points: number[],
    color: string,
    width: number,
): Annotation {
    return { id: makeAnnotationId(), type: 'shape', tool: { color, width }, shape: s, points };
}

/** Side label: midpoint of edge, offset outward away from centroid. */
function sideLabel(a: Pt, b: Pt, centroid: Pt, text: string, color: string): Annotation {
    const m = midPt(a, b);
    const dx = m[0] - centroid[0], dy = m[1] - centroid[1];
    const len = Math.hypot(dx, dy) || 1;
    return makeTxt(m[0] + (dx / len) * 24 - 13, m[1] + (dy / len) * 24 - 10, text, color);
}

/** Angle label: near vertex, offset inward toward centroid. */
function angleLabel(v: Pt, centroid: Pt, text: string): Annotation {
    const dx = centroid[0] - v[0], dy = centroid[1] - v[1];
    const len = Math.hypot(dx, dy) || 1;
    return makeTxt(v[0] + (dx / len) * 30 - 13, v[1] + (dy / len) * 30 - 8, text, '#3b82f6', 13);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Try to snap a freehand stroke to a clean geometric shape with measurements.
 * @param flat  Flat [x,y,x,y,...] point array (world coordinates).
 * @param color Stroke color to carry over.
 * @param strokeWidth Stroke width to carry over.
 * @returns Array of replacement annotations, or null if shape not detected.
 */
export function tryConvertToShape(
    flat: number[],
    color: string,
    strokeWidth: number,
): Annotation[] | null {
    if (flat.length < 12) return null;  // need at least 6 points

    // Convert flat array → typed point array
    const raw: Pt[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) raw.push([flat[i], flat[i + 1]] as Pt);

    // ─── Circle ──────────────────────────────────────────────────────────────
    // Detect by radial variance: if all points are equidistant from centroid,
    // it's a circle. Also require path closure and 4-quadrant coverage.
    const cx = raw.reduce((s, p) => s + p[0], 0) / raw.length;
    const cy = raw.reduce((s, p) => s + p[1], 0) / raw.length;
    const radii = raw.map(p => dist(p, [cx, cy] as Pt));
    const avgR = radii.reduce((s, r) => s + r, 0) / radii.length;
    const stdR = Math.sqrt(radii.reduce((s, r) => s + (r - avgR) ** 2, 0) / radii.length);
    const circConf = avgR > 0 ? 1 - stdR / avgR : 0;
    const startEndDist = dist(raw[0], raw[raw.length - 1]);
    const allQuadrants = new Set(
        raw.map(p => `${p[0] >= cx ? 'R' : 'L'}${p[1] >= cy ? 'B' : 'T'}`)
    ).size === 4;

    if (circConf > 0.84 && startEndDist < avgR * 0.7 && allQuadrants) {
        return [
            makeShapeAnn('circle', [cx - avgR, cy - avgR, cx + avgR, cy + avgR], color, strokeWidth),
            makeTxt(cx + avgR * 0.1 - 22, cy - 16, `r = ${(avgR / 10).toFixed(1)}`, color),
        ];
    }

    // ─── Polygon / line ───────────────────────────────────────────────────────
    const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
    const bbDiag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (bbDiag < 30) return null;

    // Simplify to key corners (4% of bounding-box diagonal as epsilon)
    const simplified = douglasPeucker(raw, bbDiag * 0.04);
    const isClosed = dist(simplified[0], simplified[simplified.length - 1]) < bbDiag * 0.2;
    const corners = isClosed ? simplified.slice(0, -1) : simplified;

    // ─── Line ────────────────────────────────────────────────────────────────
    if (!isClosed && corners.length === 2) {
        const [A, B] = corners;
        const m = midPt(A, B);
        // Perpendicular offset direction for label placement
        const dx = -(B[1] - A[1]), dy = B[0] - A[0];
        const plen = Math.hypot(dx, dy) || 1;
        return [
            makeShapeAnn('line', [A[0], A[1], B[0], B[1]], color, strokeWidth),
            makeTxt(m[0] + (dx / plen) * 18 - 13, m[1] + (dy / plen) * 18 - 8,
                (dist(A, B) / 10).toFixed(1), color),
        ];
    }

    // ─── Triangle ────────────────────────────────────────────────────────────
    if (isClosed && corners.length === 3) {
        const [A, B, C] = corners as [Pt, Pt, Pt];
        const sides = [dist(A, B), dist(B, C), dist(C, A)];
        const scale = 10 / Math.max(...sides);  // normalise: longest side = 10.0
        const centroid: Pt = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
        return [
            makeShapeAnn('polygon', [A[0], A[1], B[0], B[1], C[0], C[1]], color, strokeWidth),
            // Side length labels (outside each edge)
            sideLabel(A, B, centroid, (sides[0] * scale).toFixed(1), color),
            sideLabel(B, C, centroid, (sides[1] * scale).toFixed(1), color),
            sideLabel(C, A, centroid, (sides[2] * scale).toFixed(1), color),
            // Interior angle labels (inside each vertex)
            angleLabel(A, centroid, `${angleDeg(C, A, B)}°`),
            angleLabel(B, centroid, `${angleDeg(A, B, C)}°`),
            angleLabel(C, centroid, `${angleDeg(B, C, A)}°`),
        ];
    }

    // ─── Rectangle ───────────────────────────────────────────────────────────
    if (isClosed && corners.length === 4) {
        const cxArr = corners.map(p => p[0]), cyArr = corners.map(p => p[1]);
        const minX = Math.min(...cxArr), maxX = Math.max(...cxArr);
        const minY = Math.min(...cyArr), maxY = Math.max(...cyArr);
        const w = maxX - minX, h = maxY - minY;
        const scale = 10 / Math.max(w, h);
        return [
            makeShapeAnn('rect', [minX, minY, maxX, maxY], color, strokeWidth),
            // Width label above top edge
            makeTxt(minX + w / 2 - 15, minY - 22, (w * scale).toFixed(1), color),
            // Height label right of right edge
            makeTxt(maxX + 8, minY + h / 2 - 8, (h * scale).toFixed(1), color),
        ];
    }

    return null;  // unrecognised shape — caller keeps the freehand stroke
}
