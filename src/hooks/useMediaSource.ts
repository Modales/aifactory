import { useCallback, useEffect, useRef, useState } from 'react'

export type MediaSourceKind = 'camera' | 'upload'

export type MediaStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'paused'
  | 'ended'
  | 'permission-denied'
  | 'unsupported-browser'
  | 'invalid-file'
  | 'playback-error'
  | 'stream-ended'
  | 'error'

export type MediaErrorCode = Exclude<
  MediaStatus,
  'idle' | 'loading' | 'ready' | 'paused' | 'ended'
>

export interface MediaSourceError {
  code: MediaErrorCode
  message: string
}

export interface VideoDimensions {
  width: number
  height: number
}

interface MediaSourceLifecycle {
  source: MediaSourceKind | null
  status: MediaStatus
  error: MediaSourceError | null
  lifecycleKey: string
  videoElement: HTMLVideoElement | null
  videoSize: VideoDimensions | null
  videoRef: (element: HTMLVideoElement | null) => void
  startCamera: () => Promise<void>
  startUpload: (file: File) => void
  resetMedia: () => void
}

function cameraFailure(error: unknown): MediaSourceError {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        code: 'permission-denied',
        message: 'Camera permission was denied. Allow access or choose another source.',
      }
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return {
        code: 'error',
        message: 'No compatible camera is available on this device.',
      }
    }
  }

  return { code: 'error', message: 'The camera could not be started. Try another source.' }
}

export function useMediaSource(): MediaSourceLifecycle {
  const [source, setSource] = useState<MediaSourceKind | null>(null)
  const [status, setStatus] = useState<MediaStatus>('idle')
  const [error, setError] = useState<MediaSourceError | null>(null)
  const [lifecycleId, setLifecycleId] = useState(0)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [videoSize, setVideoSize] = useState<VideoDimensions | null>(null)

  const mountedRef = useRef(false)
  const requestVersionRef = useRef(0)
  const activeSourceRef = useRef<MediaSourceKind | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const removeVideoListenersRef = useRef<(() => void) | null>(null)
  const removeTrackListenersRef = useRef<(() => void) | null>(null)

  const detachVideo = useCallback(() => {
    removeVideoListenersRef.current?.()
    removeVideoListenersRef.current = null

    const video = videoElementRef.current
    if (!video) return
    video.pause()
    video.srcObject = null
    video.removeAttribute('src')
    video.load()
  }, [])

  const releaseResources = useCallback(() => {
    detachVideo()
    removeTrackListenersRef.current?.()
    removeTrackListenersRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [detachVideo])

  const attachVideo = useCallback((video: HTMLVideoElement) => {
    removeVideoListenersRef.current?.()

    const markReady = () => {
      if (videoElementRef.current !== video || !activeSourceRef.current) return
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoSize({ width: video.videoWidth, height: video.videoHeight })
        setStatus('ready')
        setError(null)
      }
    }
    const attemptPlayback = () => {
      if (videoElementRef.current !== video || !activeSourceRef.current) return
      void video.play().catch((playError: unknown) => {
        if (playError instanceof DOMException && playError.name === 'AbortError') return
        if (!mountedRef.current || videoElementRef.current !== video) return
        setStatus('playback-error')
        setError({
          code: 'playback-error',
          message: 'The video is ready but playback could not start. Try playing it again.',
        })
      })
    }
    const handleMediaError = () => {
      if (videoElementRef.current !== video || !activeSourceRef.current) return
      setStatus('playback-error')
      setError({
        code: 'playback-error',
        message: 'This video could not be decoded or played by the browser.',
      })
    }
    const handlePause = () => {
      if (videoElementRef.current !== video || activeSourceRef.current !== 'upload') return
      if (!video.ended) setStatus('paused')
    }
    const handleEnded = () => {
      if (videoElementRef.current !== video || activeSourceRef.current !== 'upload') return
      setStatus('ended')
    }
    const handleSeeked = () => {
      if (videoElementRef.current !== video || activeSourceRef.current !== 'upload') return
      setVideoSize({ width: video.videoWidth, height: video.videoHeight })
      setStatus(video.paused ? 'paused' : 'ready')
    }
    const handleResize = () => {
      if (videoElementRef.current !== video || video.videoWidth === 0 || video.videoHeight === 0) return
      setVideoSize({ width: video.videoWidth, height: video.videoHeight })
    }

    video.addEventListener('loadeddata', markReady)
    video.addEventListener('canplay', attemptPlayback)
    video.addEventListener('playing', markReady)
    video.addEventListener('error', handleMediaError)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('resize', handleResize)
    removeVideoListenersRef.current = () => {
      video.removeEventListener('loadeddata', markReady)
      video.removeEventListener('canplay', attemptPlayback)
      video.removeEventListener('playing', markReady)
      video.removeEventListener('error', handleMediaError)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('resize', handleResize)
    }

    video.muted = true
    video.playsInline = true
    video.autoplay = true

    if (activeSourceRef.current === 'camera' && streamRef.current) {
      video.removeAttribute('src')
      video.srcObject = streamRef.current
    } else if (activeSourceRef.current === 'upload' && objectUrlRef.current) {
      video.srcObject = null
      video.src = objectUrlRef.current
      video.load()
    }

    if (video.readyState >= 2) {
      markReady()
      attemptPlayback()
    }
  }, [])

  const videoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      if (videoElementRef.current === element) return
      removeVideoListenersRef.current?.()
      removeVideoListenersRef.current = null
      videoElementRef.current = element
      setVideoElement(element)
      if (element) attachVideo(element)
    },
    [attachVideo],
  )

  const resetMedia = useCallback(() => {
    const requestVersion = ++requestVersionRef.current
    activeSourceRef.current = null
    releaseResources()
    setSource(null)
    setStatus('idle')
    setError(null)
    setLifecycleId(requestVersion)
    setVideoSize(null)
  }, [releaseResources])

  const startCamera = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current
    activeSourceRef.current = 'camera'
    releaseResources()
    setSource('camera')
    setStatus('loading')
    setError(null)
    setLifecycleId(requestVersion)
    setVideoSize(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      if (requestVersion !== requestVersionRef.current) return
      setStatus('unsupported-browser')
      setError({
        code: 'unsupported-browser',
        message: 'Camera access is not supported in this browser or context.',
      })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (!mountedRef.current || requestVersion !== requestVersionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      const handleTrackEnded = () => {
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return
        setStatus('stream-ended')
        setError({
          code: 'stream-ended',
          message: 'The camera stream ended. Choose the camera again to restart tracking.',
        })
      }
      const tracks = stream.getVideoTracks()
      tracks.forEach((track) => track.addEventListener('ended', handleTrackEnded))
      removeTrackListenersRef.current = () => {
        tracks.forEach((track) => track.removeEventListener('ended', handleTrackEnded))
      }
      const video = videoElementRef.current
      if (video) attachVideo(video)
    } catch (cameraError) {
      if (!mountedRef.current || requestVersion !== requestVersionRef.current) return
      const failure = cameraFailure(cameraError)
      setStatus(failure.code)
      setError(failure)
    }
  }, [attachVideo, releaseResources])

  const startUpload = useCallback(
    (file: File) => {
      const requestVersion = ++requestVersionRef.current
      activeSourceRef.current = null
      releaseResources()
      setLifecycleId(requestVersion)
      setVideoSize(null)

      if (!file.type.startsWith('video/') || file.size === 0) {
        setSource(null)
        setStatus('invalid-file')
        setError({
          code: 'invalid-file',
          message: 'Choose a non-empty video file supported by your browser.',
        })
        return
      }

      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      activeSourceRef.current = 'upload'
      setSource('upload')
      setStatus('loading')
      setError(null)

      const video = videoElementRef.current
      if (video) attachVideo(video)
    },
    [attachVideo, releaseResources],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestVersionRef.current += 1
      activeSourceRef.current = null
      releaseResources()
    }
  }, [releaseResources])

  return {
    source,
    status,
    error,
    lifecycleKey: `${source ?? 'none'}:${lifecycleId}`,
    videoElement,
    videoSize,
    videoRef,
    startCamera,
    startUpload,
    resetMedia,
  }
}
