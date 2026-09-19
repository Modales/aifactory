import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { decodeAnatomyChunk, musclePartIds, type AnatomyAtlas } from '@/lib/anatomyAtlas'
import { JOINTS, exercisePose, skinWeight } from '@/lib/exerciseAnimation'
import { cameraShot } from '@/lib/exerciseCamera'
import type { LibraryExercise } from '@/lib/exerciseLibrary'
import type { MuscleId } from '@/lib/muscleModel'

interface Props {
  exercise: LibraryExercise
  cycle: number
  onReady: () => void
  onError: (message: string) => void
}

/** Choreographed-camera, skinned BodyParts3D demonstration with equipment locked to the hand bones. */
export default function ExerciseScene({ exercise, cycle, onReady, onError }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef({ exercise, cycle })
  latest.current = { exercise, cycle }
  useEffect(() => {
    const el = host.current!
    const abort = new AbortController()
    let disposed = false, frame = 0, ready = false, notified = false, previous = '', lastRender = 0
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }) }
    catch { onError('3D playback needs WebGL. Please enable hardware acceleration or try another browser.'); return }
    renderer.setClearColor('#1a1c1b')
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.domElement.setAttribute('aria-label', 'Animated skeleton with the working muscles highlighted')
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, .01, 30)
    const cameraTarget = new THREE.Vector3(0, .85, 0)
    scene.add(new THREE.HemisphereLight('#fff6e6', '#444b48', 2.4))
    const key = new THREE.DirectionalLight('#fff0da', 3.4); key.position.set(2, 4, 3); scene.add(key)
    const rim = new THREE.DirectionalLight('#b3c6c4', 2.8); rim.position.set(-3, 2, -2); scene.add(rim)
    const fill = new THREE.DirectionalLight('#f5e9d4', 1.5); fill.position.set(-2, 1, 3); scene.add(fill)
    const grid = new THREE.GridHelper(8, 40, '#414641', '#2d322f'); grid.position.y = -.025; scene.add(grid)
    const circle = new THREE.Mesh(new THREE.CircleGeometry(.75, 64), new THREE.MeshBasicMaterial({ color: '#101311', transparent: true, opacity: .7, depthWrite: false }))
    circle.rotation.x = -Math.PI / 2; circle.position.y = -.015; circle.scale.y = .62; scene.add(circle)
    const bones = JOINTS.map(joint => { const bone = new THREE.Bone(); bone.name = joint.name; return bone })
    JOINTS.forEach((joint, i) => {
      bones[i].position.fromArray(joint.at)
      if (joint.parent >= 0) { bones[i].position.sub(new THREE.Vector3().fromArray(JOINTS.at(joint.parent)!.at)); bones[joint.parent].add(bones[i]) }
      else scene.add(bones[i])
    })
    scene.updateMatrixWorld(true)
    const skeleton = new THREE.Skeleton(bones)
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
    let texture: THREE.DataTexture | undefined, atlas: AnatomyAtlas | undefined, stateData: Uint8Array<ArrayBuffer> | undefined
    const boneMaterial = new THREE.MeshStandardMaterial({ color: '#d9d8cc', roughness: .62, metalness: .04 })
    const muscleMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .65, side: THREE.DoubleSide })
    materials.push(boneMaterial, muscleMaterial)
    const weights = new THREE.Group()
    const dumbbellMaterial = new THREE.MeshStandardMaterial({ color: '#69736e', metalness: .7, roughness: .3 })
    materials.push(dumbbellMaterial)
    for (const hand of [11, 14]) {
      const dumbbell = new THREE.Group()
      const barGeometry = new THREE.CylinderGeometry(.014, .014, .24, 12)
      geometries.push(barGeometry)
      const bar = new THREE.Mesh(barGeometry, dumbbellMaterial); bar.rotation.z = Math.PI / 2; dumbbell.add(bar)
      for (const side of [-1, 1]) {
        const plateGeometry = new THREE.CylinderGeometry(.053, .053, .04, 12); geometries.push(plateGeometry)
        const plate = new THREE.Mesh(plateGeometry, dumbbellMaterial); plate.rotation.z = Math.PI / 2; plate.position.x = side * .09; dumbbell.add(plate)
      }
      dumbbell.position.y = -.065
      bones[hand].add(dumbbell)
      // Group is only a visibility registry; the dumbbells stay attached to the hands.
      weights.userData[hand] = dumbbell
    }
    const fit = () => {
      const current = latest.current
      const shot = cameraShot(current.exercise.cameraFocus, current.cycle, camera.aspect)
      cameraTarget.fromArray(shot.target)
      camera.position.fromArray(shot.position)
      camera.zoom = shot.zoom
      camera.updateProjectionMatrix()
      camera.lookAt(cameraTarget)
      el.dataset.cameraShot = shot.label
    }
    const resize = () => { camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); renderer.setSize(el.clientWidth, el.clientHeight); fit(); if (ready) renderer.render(scene, camera) }
    const observer = new ResizeObserver(resize); observer.observe(el); resize()
    void (async () => {
      try {
        const response = await fetch('/models/exercise-atlas.json', { signal: abort.signal })
        if (!response.ok) throw new Error('The exercise anatomy index could not be loaded.')
        atlas = await response.json() as AnatomyAtlas
        if (disposed) return
        const width = THREE.MathUtils.ceilPowerOfTwo(atlas.parts.length)
        stateData = new Uint8Array(width * 4)
        texture = new THREE.DataTexture(stateData, width, 1); texture.needsUpdate = true
        muscleMaterial.onBeforeCompile = shader => {
          shader.uniforms.demandMap = { value: texture }
          shader.uniforms.demandWidth = { value: width }
          shader.vertexShader = `attribute float partIndex; uniform sampler2D demandMap; uniform float demandWidth; varying float demand;\n${shader.vertexShader}`
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ndemand = texture2D(demandMap, vec2((partIndex + 0.5) / demandWidth, 0.5)).r;')
          shader.fragmentShader = `varying float demand;\n${shader.fragmentShader}`
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = demand < 0.01 ? vec3(0.18, 0.20, 0.18) : demand > 0.69 ? vec3(0.95, 0.19, 0.055) : vec3(0.72, 0.48, 0.19);')
        }
        const chunk = atlas.chunks[0]
        const data = await decodeAnatomyChunk(await fetch(chunk.gzip!, { signal: abort.signal }), chunk.bytes, true)
        if (disposed) return
        const groups: Record<string, THREE.BufferGeometry[]> = { skeletal: [], muscular: [] }
        atlas.parts.forEach((part, index) => {
          const geometry = new THREE.BufferGeometry()
          const positions = new Float32Array(data, part.positions, part.vertexCount * 3)
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(data, part.normals, part.vertexCount * 3), 3, true))
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data, part.indices, part.indexCount), 1))
          geometry.setAttribute('partIndex', new THREE.Float32BufferAttribute(new Float32Array(part.vertexCount).fill(index), 1))
          const indices = new Uint16Array(part.vertexCount * 4), skinWeights = new Float32Array(part.vertexCount * 4)
          const center = part.bounds[0].map((v, i) => (v + part.bounds[1][i]) / 2)
          for (let i = 0; i < part.vertexCount; i++) {
            const weight = skinWeight(part.name, part.system === 'skeletal', center, [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]])
            indices.set(weight.indices, i * 4); skinWeights.set(weight.weights, i * 4)
          }
          geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
          geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))
          groups[part.system].push(geometry)
        })
        for (const [system, parts] of Object.entries(groups)) {
          const geometry = mergeGeometries(parts, false)
          parts.forEach(part => part.dispose())
          if (!geometry) throw new Error('The exercise model could not be assembled.')
          geometries.push(geometry)
          const mesh = new THREE.SkinnedMesh(geometry, system === 'skeletal' ? boneMaterial : muscleMaterial)
          // Keep the simplified internal rig out of the rendered muscle silhouette.
          mesh.visible = system !== 'skeletal'
          mesh.bind(skeleton); mesh.frustumCulled = false; scene.add(mesh)
        }
        ready = true
      } catch (error) { if (!disposed) onError(error instanceof Error ? error.message : 'Unable to load the exercise model.') }
    })()
    const animate = (now: number) => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      if (!ready || now - lastRender < 32 || document.hidden) return
      lastRender = now
      const current = latest.current
      if (previous !== current.exercise.id && atlas && stateData && texture) {
        stateData.fill(0)
        for (const [id, demand] of Object.entries(current.exercise.demand)) {
          const ids = new Set(musclePartIds(atlas, id as MuscleId))
          atlas.parts.forEach((part, index) => { if (ids.has(part.id)) stateData![index * 4] = Math.round(demand * 2.55) })
        }
        texture.needsUpdate = true
        for (const hand of [11, 14]) (weights.userData[hand] as THREE.Group).visible = current.exercise.equipment === 'Dumbbells'
        previous = current.exercise.id; fit()
      }
      const pose = exercisePose(current.exercise.id, current.cycle)
      bones[0].position.fromArray(JOINTS[0].at).add(new THREE.Vector3().fromArray(pose.offset))
      pose.rotations.forEach((rotation, i) => bones[i].rotation.set(...rotation))
      for (const hand of [11, 14]) {
        const dumbbell = weights.userData[hand] as THREE.Group
        dumbbell.rotation.set(...pose.gripRotation)
      }
      fit()
      renderer.render(scene, camera)
      if (!notified) { notified = true; el.dataset.ready = 'true'; onReady() }
      el.dataset.movement = current.exercise.id
      el.dataset.pose = pose.rotations.map(r => r.map(v => v.toFixed(3)).join(',')).join('|')
      el.dataset.cycle = current.cycle.toFixed(3)
    }
    frame = requestAnimationFrame(animate)
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); observer.disconnect()
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); skeleton.dispose(); texture?.dispose()
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); circle.geometry.dispose(); (circle.material as THREE.Material).dispose()
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [onReady, onError])
  return <div className="exercise-scene" data-testid="exercise-scene" ref={host} />
}
