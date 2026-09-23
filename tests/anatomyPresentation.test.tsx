import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Bone, Scene, Skeleton, Vector3 } from 'three'
import FeedMuscleDiagram from '../src/components/anatomy/FeedMuscleDiagram'
import { muscleLoadFromDemand } from '../src/lib/muscleModel'
import { anatomyCameraFrame } from '../src/lib/anatomyTransition'
import { JOINTS, skinWeight } from '../src/lib/exerciseAnimation'
import { loadExerciseSkin } from '../src/lib/exerciseSkin'
import { musclePartIds, type AnatomyAtlas } from '../src/lib/anatomyAtlas'

const atlas: AnatomyAtlas = JSON.parse(readFileSync('public/models/exercise-atlas.json', 'utf8'))

describe('anatomy presentation', () => {
  it('draws original vector anatomy with workload-specific highlights, not raster overlays', () => {
    const markup = renderToStaticMarkup(createElement(FeedMuscleDiagram, { summary: muscleLoadFromDemand({ quads: 95, glutes: 80, brachialis: 40 }) }))
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('<image')
    expect(markup).toContain('data-muscle="quads" data-score="95"')
    expect(markup).toContain('data-muscle="glutes" data-score="80"')
    expect(markup).toContain('data-muscle="brachialis" data-score="40"')
    expect(markup).toContain('data-muscle="mid_chest" data-score="0"')
    expect(markup).toContain('ANTERIOR')
    expect(markup).toContain('POSTERIOR')
  })
  it('covers every supported muscle including deep-group projections', () => {
    const ids = ['upper_chest','mid_chest','lower_chest','anterior_delts','lateral_delts','rear_delts','triceps_long','triceps_lateral','biceps_long','biceps_short','brachialis','forearms','rectus_abdominis','obliques','transverse_abdominis','lats','traps','erector_spinae','glutes','hip_adductors','quads','hamstrings','calves']
    const markup = renderToStaticMarkup(createElement(FeedMuscleDiagram, { summary: muscleLoadFromDemand(Object.fromEntries(ids.map(id => [id, 80]))) }))
    ids.forEach(id => expect(markup).toContain(`data-muscle="${id}" data-score="80"`))
  })
  it('orbits continuously between front and back without crossing through the body', () => {
    const start = new Vector3(0, 1, 3), end = new Vector3(0, 1, -2), target = new Vector3(0, 1, 0)
    let previous = start
    for (let step = 0; step <= 100; step++) {
      const frame = anatomyCameraFrame(start, target, end, target, step / 100)
      expect(frame.position.distanceTo(target)).toBeGreaterThanOrEqual(1.99)
      expect(frame.position.distanceTo(previous)).toBeLessThan(.15)
      previous = frame.position
    }
    expect(previous.distanceTo(end)).toBeLessThan(1e-8)
    expect(anatomyCameraFrame(start, target, end, target, 0).position.distanceTo(start)).toBeLessThan(1e-8)
  })
  it('keeps pelvis skin on pelvis/legs, not on wrists', () => {
    const hip = [.19, .86, 0]
    expect(skinWeight('Skin', false, hip, hip).indices.every(i => i < 9)).toBe(true)
    const hand = [.26, .82, 0]
    expect(skinWeight('Skin', false, hand, hand).indices[0]).toBe(10)
  })
  it('loads a complete skin shell and cuts windows only over demanded muscles', async () => {
    const scene = new Scene()
    const bones = JOINTS.map(() => new Bone())
    JOINTS.forEach((joint, i) => {
      bones[i].position.fromArray(joint.at)
      if (joint.parent < 0) scene.add(bones[i])
      else { bones[i].position.sub(new Vector3().fromArray(JOINTS[joint.parent].at)); bones[joint.parent].add(bones[i]) }
    })
    scene.updateMatrixWorld(true)
    const skeleton = new Skeleton(bones)
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('.json')) return new Response(readFileSync(`public${url}`, 'utf8'))
      // Decoder also handles an already decompressed HTTP payload.
      return new Response(new Uint8Array(gunzipSync(readFileSync(`public${url}`))))
    })
    try {
      const skin = await loadExerciseSkin(skeleton, new AbortController().signal)
      expect(skin.geometry.getAttribute('position').count).toBeGreaterThan(20000)
      const demand = new Uint8Array(atlas.parts.length * 4)
      skin.update(atlas, demand)
      expect(Array.from(skin.geometry.getAttribute('cutaway').array).every(v => v === 2)).toBe(true)
      const quads = new Set(musclePartIds(atlas, 'quads'))
      atlas.parts.forEach((part, i) => { if (quads.has(part.id)) demand[i * 4] = 255 })
      skin.update(atlas, demand)
      const coverage = Array.from(skin.geometry.getAttribute('cutaway').array)
      expect(coverage.some(v => v < .88)).toBe(true)
      expect(coverage.filter(v => v >= .88).length / coverage.length).toBeGreaterThan(.7)
      skin.geometry.dispose(); skin.material.dispose()
    } finally { vi.unstubAllGlobals(); skeleton.dispose() }
  })
})
