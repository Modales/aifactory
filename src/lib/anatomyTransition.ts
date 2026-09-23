import { MathUtils, Spherical, Vector3 } from 'three'

/** Orbit around the subject instead of cutting through it on front/back changes. */
export function anatomyCameraFrame(fromPosition: Vector3, fromTarget: Vector3, toPosition: Vector3, toTarget: Vector3, progress: number) {
  const t = MathUtils.clamp(progress, 0, 1)
  const eased = t * t * (3 - 2 * t)
  const from = new Spherical().setFromVector3(fromPosition.clone().sub(fromTarget))
  const to = new Spherical().setFromVector3(toPosition.clone().sub(toTarget))
  const angle = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta))
  const target = fromTarget.clone().lerp(toTarget, eased)
  const orbit = new Spherical(MathUtils.lerp(from.radius, to.radius, eased), MathUtils.lerp(from.phi, to.phi, eased), from.theta + angle * eased)
  return { target, position: new Vector3().setFromSpherical(orbit).add(target) }
}
