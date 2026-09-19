import * as THREE from 'three'
import { decodeAnatomyChunk, type AnatomyAtlas } from './anatomyAtlas'
import { skinWeight } from './exerciseAnimation'
import { skinWeightSampler } from './skinWeightTransfer'

/** Actual BodyParts3D outer skin, deformed by the same joints as the muscles. */
export async function loadExerciseSkin(skeleton: THREE.Skeleton, signal: AbortSignal, references: THREE.BufferGeometry[] = []) {
  const response = await fetch('/models/exercise-skin.json', { signal })
  if (!response.ok) throw new Error('The skin model could not be loaded.')
  const atlas: AnatomyAtlas = await response.json()
  const part = atlas.parts[0], chunk = atlas.chunks[0]
  const data = await decodeAnatomyChunk(await fetch(chunk.gzip!, { signal }), chunk.bytes, true)
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(data, part.positions, part.vertexCount * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data, part.indices, part.indexCount), 1))
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(data, part.normals, part.vertexCount * 3), 3, true))
  const indices = new Uint16Array(part.vertexCount * 4), weights = new Float32Array(part.vertexCount * 4)
  const sample = skinWeightSampler(references)
  for (let i = 0; i < part.vertexCount; i++) {
    const point = Array.from(positions.subarray(i * 3, i * 3 + 3))
    const weight = sample(point) ?? skinWeight('Skin', false, point, point)
    indices.set(weight.indices, i * 4); weights.set(weight.weights, i * 4)
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
  const cutaway = new THREE.Float32BufferAttribute(new Float32Array(part.vertexCount).fill(2), 1)
  geometry.setAttribute('cutaway', cutaway)
  const material = new THREE.MeshStandardMaterial({ color: '#ba8e73', roughness: .72, side: THREE.DoubleSide })
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float cutaway; varying float skinCoverage;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nskinCoverage = cutaway;')
    shader.fragmentShader = `varying float skinCoverage;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (skinCoverage < 0.88) discard;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.65, 0.36, 0.28), vec3(1.0), smoothstep(0.88, 1.04, skinCoverage));')
  }
  const mesh = new THREE.SkinnedMesh(geometry, material)
  // Do not recalculate the shared inverse bind matrices when loading asynchronously.
  mesh.bind(skeleton, new THREE.Matrix4()); mesh.frustumCulled = false
  return {
    mesh, geometry, material,
    update(atlas: AnatomyAtlas, demand: Uint8Array) {
      const regions = atlas.parts.filter((p, index) => p.system === 'muscular' && demand[index * 4] >= 102).map(p => ({
        center: p.bounds[0].map((v, axis) => (v + p.bounds[1][axis]) / 2),
        radius: p.bounds[0].map((v, axis) => (p.bounds[1][axis] - v) / 2 + .025),
      }))
      for (let i = 0; i < positions.length / 3; i++) {
        let distance = 2
        for (const region of regions) {
          let squared = 0
          for (let axis = 0; axis < 3; axis++) squared += ((positions[i * 3 + axis] - region.center[axis]) / region.radius[axis]) ** 2
          distance = Math.min(distance, Math.sqrt(squared))
        }
        cutaway.setX(i, distance)
      }
      cutaway.needsUpdate = true
    },
  }
}
