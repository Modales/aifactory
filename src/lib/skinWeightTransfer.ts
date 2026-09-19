import type { BufferGeometry } from 'three'

/** Transfer deformation from underlying anatomy rather than dividing skin by hard X/Y gates.
 * Four nearby surface samples soften armpit/hip seams and keep the skin with its actual limb.
 */
export function skinWeightSampler(geometries: BufferGeometry[]) {
  type Sample = { x: number; y: number; z: number; indices: number[]; weights: number[] }
  const cells = new Map<string, Sample[]>()
  const cellSize = .055
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  for (const geometry of geometries) {
    const p = geometry.getAttribute('position'), indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight')
    if (!indices || !weights) continue
    // The atlas is dense enough that every third vertex still gives millimeter-scale samples.
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const id = key(Math.floor(x / cellSize), Math.floor(y / cellSize), Math.floor(z / cellSize))
      const bucket = cells.get(id) ?? []
      bucket.push({ x, y, z, indices: [indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)], weights: [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)] })
      cells.set(id, bucket)
    }
  }
  return (point: number[]) => {
    const [x, y, z] = point, cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cz = Math.floor(z / cellSize)
    const nearest: { sample: Sample; distance: number }[] = []
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const sample of cells.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
        const distance = (x - sample.x) ** 2 + (y - sample.y) ** 2 + (z - sample.z) ** 2
        if (nearest.length === 4 && distance >= nearest[3].distance) continue
        nearest.push({ sample, distance }); nearest.sort((a, b) => a.distance - b.distance)
        if (nearest.length > 4) nearest.pop()
      }
    }
    if (!nearest.length) return null
    const influence = new Map<number, number>()
    for (const { sample, distance } of nearest) {
      const contribution = 1 / (distance + .00002)
      sample.indices.forEach((index, i) => influence.set(index, (influence.get(index) ?? 0) + sample.weights[i] * contribution))
    }
    const entries = [...influence].sort((a, b) => b[1] - a[1]).slice(0, 4)
    const total = entries.reduce((sum, entry) => sum + entry[1], 0)
    while (entries.length < 4) entries.push([0, 0])
    return { indices: entries.map(entry => entry[0]), weights: entries.map(entry => entry[1] / total) }
  }
}
