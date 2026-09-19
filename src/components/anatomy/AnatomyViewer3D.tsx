import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { decodeAnatomyChunk, isDeepMuscle, type AnatomyAtlas, type AnatomyLayer } from '@/lib/anatomyAtlas'

interface Props {
  atlas: AnatomyAtlas
  scores: Map<string, number>
  layer: AnatomyLayer
  showSkeleton: boolean
  selectedId: string | null
  focusIds: string[]
  view: 'front' | 'back' | 'side' | 'three-quarter'
  onSelect: (id: string) => void
  onProgress: (progress: number) => void
  onError: (message: string) => void
}

type LiveState = Pick<Props, 'scores' | 'layer' | 'showSkeleton' | 'selectedId' | 'focusIds' | 'view'>
const visibleMuscle = (name: string, layer: AnatomyLayer) => layer === 'all' || (layer === 'deep' ? isDeepMuscle(name) : !isDeepMuscle(name))

/** Batched WebGL renderer: 2,234 source meshes stay individually pickable without 2,234 draw calls. */
export default function AnatomyViewer3D({ atlas, onSelect, onProgress, onError, ...state }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef<LiveState>(state)
  const select = useRef(onSelect)
  latest.current = state
  select.current = onSelect

  useEffect(() => {
    const element = host.current!
    const abort = new AbortController()
    let disposed = false
    let frame = 0
    let dirty = true
    let lastState = ''
    let lastFocus = ''
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      onError('This browser could not start the 3D anatomy viewer. Enable WebGL or try another browser.')
      return
    }
    renderer.setClearColor('#171512')
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional human muscle system. Drag to rotate, scroll to zoom, and click a muscle to inspect it.')
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, .85, 0)
    controls.enableDamping = true
    controls.dampingFactor = .08
    controls.minDistance = .18
    controls.maxDistance = 12
    controls.addEventListener('change', () => { dirty = true })

    const environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04)
    scene.environment = environment.texture
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x271a15, 1.25))
    const key = new THREE.DirectionalLight(0xffead4, 3.2); key.position.set(-2, 4, 3); scene.add(key)
    const rim = new THREE.DirectionalLight(0x8baecb, 2.2); rim.position.set(3, 2, -3); scene.add(rim)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 96), new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 1 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.015; scene.add(floor)

    const textureWidth = THREE.MathUtils.ceilPowerOfTwo(atlas.parts.length)
    const stateData = new Uint8Array(textureWidth * 4)
    const stateTexture = new THREE.DataTexture(stateData, textureWidth, 1)
    stateTexture.needsUpdate = true
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const pickers: (THREE.Mesh | undefined)[] = []
    const bounds = atlas.parts.map(part => new THREE.Box3(new THREE.Vector3().fromArray(part.bounds[0]), new THREE.Vector3().fromArray(part.bounds[1])))

    const materialFor = (system: string) => {
      const material = new THREE.MeshStandardMaterial({ color: system === 'skeletal' ? '#d8d0b8' : '#8f3f36', metalness: .02, roughness: .67, side: THREE.DoubleSide })
      material.onBeforeCompile = shader => {
        shader.uniforms.partState = { value: stateTexture }
        shader.uniforms.stateWidth = { value: textureWidth }
        shader.vertexShader = `attribute float partIndex; uniform sampler2D partState; uniform float stateWidth; varying vec3 partStatus;\n${shader.vertexShader}`
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npartStatus = texture2D(partState, vec2((partIndex + 0.5) / stateWidth, 0.5)).rgb;')
        shader.fragmentShader = `varying vec3 partStatus;\n${shader.fragmentShader}`
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (partStatus.r < 0.5 / 255.0) discard;')
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float demand = partStatus.g;
          vec3 warm = mix(vec3(0.95, 0.48, 0.12), vec3(0.61, 0.08, 0.06), demand);
          diffuseColor.rgb = mix(diffuseColor.rgb, warm, step(0.01, demand) * (0.58 + demand * 0.38));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.84, 0.28), partStatus.b * 0.72);`)
      }
      materials.push(material)
      return material
    }
    const muscleMaterial = materialFor('muscular')
    const skeletonMaterial = materialFor('skeletal')

    let loaded = 0
    const loadChunk = async (chunkIndex: number) => {
      const chunk = atlas.chunks[chunkIndex]
      const compressed = Boolean(chunk.gzip) && typeof DecompressionStream !== 'undefined'
      const response = await fetch(compressed ? chunk.gzip! : chunk.url, { signal: abort.signal })
      const buffer = await decodeAnatomyChunk(response, chunk.bytes, compressed)
      if (disposed) return
      const groups = new Map<string, THREE.BufferGeometry[]>()
      atlas.parts.forEach((part, index) => {
        if (part.chunk !== chunkIndex || (part.system !== 'muscular' && part.system !== 'skeletal')) return
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3))
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true))
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1))
        geometry.setAttribute('partIndex', new THREE.BufferAttribute(new Float32Array(part.vertexCount).fill(index), 1))
        geometry.boundingBox = bounds[index].clone(); geometry.computeBoundingSphere()
        const picker = new THREE.Mesh(geometry); picker.matrixAutoUpdate = false; pickers[index] = picker
        geometries.push(geometry)
        const group = groups.get(part.system) ?? []; group.push(geometry); groups.set(part.system, group)
      })
      groups.forEach((items, system) => {
        const merged = mergeGeometries(items, false)
        if (!merged) return
        geometries.push(merged)
        const mesh = new THREE.Mesh(merged, system === 'skeletal' ? skeletonMaterial : muscleMaterial)
        mesh.frustumCulled = false
        scene.add(mesh)
      })
      loaded += 1
      onProgress(Math.round(loaded / atlas.chunks.length * 100))
      dirty = true
    }
    void (async () => {
      try {
        let cursor = 0
        await Promise.all(Array.from({ length: 3 }, async () => {
          while (cursor < atlas.chunks.length) await loadChunk(cursor++)
        }))
      } catch (error) {
        if (!disposed) onError(error instanceof Error ? error.message : 'The anatomy model could not be loaded.')
      }
    })()

    const fitBody = (view: LiveState['view']) => {
      const direction = view === 'front' ? new THREE.Vector3(0, .02, 1) : view === 'back' ? new THREE.Vector3(0, .02, -1) : view === 'side' ? new THREE.Vector3(1, .02, 0) : new THREE.Vector3(.45, .08, 1).normalize()
      controls.target.set(0, .84, 0)
      camera.position.copy(controls.target).addScaledVector(direction, element.clientWidth < 700 ? 4.6 : 3.8)
      controls.update(); dirty = true
    }
    const fitParts = (ids: string[]) => {
      const wanted = new Set(ids)
      const box = new THREE.Box3()
      atlas.parts.forEach((part, index) => { if (wanted.has(part.id)) box.union(bounds[index]) })
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
      const distance = Math.max(.18, Math.max(size.y, size.x / camera.aspect, size.z) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.7)
      controls.target.copy(center)
      camera.position.copy(center).add(new THREE.Vector3(.35, .12, 1).normalize().multiplyScalar(distance))
      controls.update(); dirty = true
    }
    const resize = () => {
      camera.aspect = element.clientWidth / Math.max(element.clientHeight, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(element.clientWidth, element.clientHeight)
      fitBody(latest.current.view)
    }
    const observer = new ResizeObserver(resize); observer.observe(element)

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), hitBox = new THREE.Box3(), hitPoint = new THREE.Vector3()
    let downPoint = { x: 0, y: 0 }
    renderer.domElement.addEventListener('pointerdown', event => { downPoint = { x: event.clientX, y: event.clientY } })
    renderer.domElement.addEventListener('pointerup', event => {
      if (Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      let nearest = Infinity, found = -1
      pickers.forEach((mesh, index) => {
        if (!mesh || stateData[index * 4] === 0 || !raycaster.ray.intersectBox(hitBox.copy(bounds[index]), hitPoint)) return
        const hit = raycaster.intersectObject(mesh, false)[0]
        if (hit && hit.distance < nearest) { nearest = hit.distance; found = index }
      })
      if (found >= 0) select.current(atlas.parts[found].id)
    })

    const animate = () => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const current = latest.current
      const signature = `${current.layer}|${current.showSkeleton}|${current.selectedId}|${[...current.scores].map(([id, score]) => `${id}:${score}`).join(',')}`
      if (signature !== lastState) {
        atlas.parts.forEach((part, index) => {
          const muscle = part.system === 'muscular'
          const visible = muscle ? visibleMuscle(part.name, current.layer) : current.showSkeleton && part.system === 'skeletal'
          stateData[index * 4] = visible ? 255 : 0
          stateData[index * 4 + 1] = Math.round((current.scores.get(part.id) ?? 0) * 2.55)
          stateData[index * 4 + 2] = part.id === current.selectedId ? 255 : 0
        })
        stateTexture.needsUpdate = true
        lastState = signature
        dirty = true
      }
      const focusKey = current.selectedId || current.focusIds.join(',') || current.view
      if (focusKey !== lastFocus) {
        const ids = current.selectedId ? [current.selectedId] : current.focusIds
        if (ids.length) fitParts(ids); else fitBody(current.view)
        lastFocus = focusKey
      }
      controls.update()
      if (dirty) { renderer.render(scene, camera); dirty = false }
    }
    fitBody(state.view)
    animate()

    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); observer.disconnect(); controls.dispose()
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
      stateTexture.dispose(); environment.dispose(); renderer.dispose(); renderer.domElement.remove(); floor.geometry.dispose()
    }
  }, [atlas, onError, onProgress])

  return <div ref={host} className="anatomy-canvas" />
}
