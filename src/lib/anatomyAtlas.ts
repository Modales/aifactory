import type { MuscleId, MuscleLoadSummary } from './muscleModel'

export type AnatomySystem = 'skeletal' | 'muscular' | string
export interface AnatomyPart {
  id: string
  name: string
  conceptId: string
  system: AnatomySystem
  chunk: number
  positions: number
  normals: number
  indices: number
  vertexCount: number
  indexCount: number
  bounds: [number[], number[]]
}
export interface AnatomyAtlas {
  version: string
  source?: string
  parts: AnatomyPart[]
  chunks: { url: string; bytes: number; gzip?: string; gzipBytes?: number }[]
}

export type AnatomyLayer = 'surface' | 'deep' | 'all'

export const DEEP_MUSCLE_TERMS = [
  'intercostal', 'interspinalis', 'intertransvers', 'rotator', 'semispinalis', 'spinalis',
  'iliocostalis', 'longissimus', 'subscapularis', 'supraspinatus', 'infraspinatus',
  'teres minor', 'gluteus minimus', 'soleus', 'transversus', 'quadratus', 'piriformis',
  'obturator', 'gemellus', 'popliteus', 'pectineus', 'adductor brevis', 'adductor minimus',
]

export const isDeepMuscle = (name: string) => DEEP_MUSCLE_TERMS.some(term => name.toLowerCase().includes(term))

const terms = (...values: string[]) => values
export const MUSCLE_MESH_TERMS: Record<MuscleId, string[]> = {
  upper_chest: terms('clavicular part of right pectoralis major', 'clavicular part of left pectoralis major'),
  mid_chest: terms('sternocostal part of right pectoralis major', 'sternocostal part of left pectoralis major'),
  lower_chest: terms('abdominal part of right pectoralis major', 'abdominal part of left pectoralis major'),
  anterior_delts: terms('clavicular part of right deltoid', 'clavicular part of left deltoid'),
  lateral_delts: terms('acromial part of right deltoid', 'acromial part of left deltoid'),
  rear_delts: terms('spinal part of right deltoid', 'spinal part of left deltoid'),
  triceps_long: terms('long head of right triceps brachii', 'long head of left triceps brachii'),
  triceps_lateral: terms('lateral head of right triceps brachii', 'lateral head of left triceps brachii', 'medial head of right triceps brachii', 'medial head of left triceps brachii'),
  biceps_long: terms('long head of right biceps brachii', 'long head of left biceps brachii'),
  biceps_short: terms('short head of right biceps brachii', 'short head of left biceps brachii'),
  brachialis: terms('right brachialis', 'left brachialis'),
  forearms: terms('flexor carpi', 'extensor carpi', 'flexor digitorum', 'extensor digitorum', 'pronator teres', 'supinator', 'palmaris longus'),
  rectus_abdominis: terms('rectus abdominis'),
  obliques: terms('external oblique', 'internal oblique'),
  transverse_abdominis: terms('transversus abdominis'),
  lats: terms('latissimus dorsi'),
  traps: terms('part of right trapezius', 'part of left trapezius'),
  erector_spinae: terms('iliocostalis', 'longissimus thoracis', 'spinalis thoracis'),
  glutes: terms('gluteus maximus', 'gluteus medius', 'gluteus minimus'),
  hip_adductors: terms('adductor brevis', 'adductor longus', 'adductor magnus', 'adductor minimus', 'pectineus', 'gracilis'),
  quads: terms('rectus femoris', 'vastus intermedius', 'vastus lateralis', 'vastus medialis'),
  hamstrings: terms('biceps femoris', 'semitendinosus', 'semimembranosus'),
  calves: terms('gastrocnemius', 'soleus'),
}

export const musclePartIds = (atlas: AnatomyAtlas, muscleId: MuscleId): string[] => {
  const patterns = MUSCLE_MESH_TERMS[muscleId]
  return atlas.parts.filter(part => patterns.some(pattern => part.name.toLowerCase().includes(pattern))).map(part => part.id)
}

export function anatomyScores(atlas: AnatomyAtlas, summary: MuscleLoadSummary): Map<string, number> {
  const scores = new Map<string, number>()
  summary.entries.forEach(entry => musclePartIds(atlas, entry.id).forEach(id => scores.set(id, Math.max(scores.get(id) ?? 0, entry.score))))
  return scores
}

export async function loadAnatomyAtlas(signal?: AbortSignal): Promise<AnatomyAtlas> {
  const response = await fetch('/models/atlas.json', { signal })
  if (!response.ok) throw new Error('The anatomy index could not be loaded.')
  return response.json() as Promise<AnatomyAtlas>
}

export async function decodeAnatomyChunk(response: Response, expectedBytes: number, compressed: boolean): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error('An anatomy file could not be loaded.')
  const payload = await response.arrayBuffer()
  const signature = new Uint8Array(payload, 0, Math.min(2, payload.byteLength))
  const isGzip = compressed && signature[0] === 0x1f && signature[1] === 0x8b
  const buffer = isGzip
    ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : payload
  if (buffer.byteLength !== expectedBytes) throw new Error('An anatomy file was incomplete. Reload and try again.')
  return buffer
}
