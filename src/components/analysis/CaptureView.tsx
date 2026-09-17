import { useEffect, useRef, useState } from 'react'
import { Camera, Video } from 'lucide-react'
import { MediaPipePoseEstimator } from '@/lib/pose/mediapipePoseEstimator'
import type { AnalysisFrame } from '@/lib/analysisApi'

import type { CaptureConfig } from './captureConfig'
export type { CaptureConfig }
const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]]
interface Props { config: CaptureConfig; recording: boolean; showHeading?: boolean; epoch: number; overlapStart: number; onFrame: (id: string, frame: AnalysisFrame, aspect: number) => void; onReady: (id: string, ready: boolean, problem?: string) => void; onEnded: (id: string) => void }

export default function CaptureView({ config, recording, showHeading = true, epoch, overlapStart, onFrame, onReady, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const estimatorRef = useRef<MediaPipePoseEstimator | null>(null)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('Preparing source and pose model…')
  const [count, setCount] = useState(0)
  const lastMedia = useRef(-1)
  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let url: string | null = null
    const video = videoRef.current
    const model = new MediaPipePoseEstimator()
    estimatorRef.current = model
    async function prepare() {
      try {
        if (!video) return
        if (config.kind === 'camera') {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs a secure browser connection.')
          stream = await navigator.mediaDevices.getUserMedia({ video: config.deviceId ? {deviceId: {exact:config.deviceId}, width:{ideal:1280}, height:{ideal:720}} : {facingMode:'environment', width:{ideal:1280}, height:{ideal:720}}, audio:false })
          if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return }
          video.srcObject = stream
          await video.play()
        } else {
          if (!config.file) throw new Error('Choose a workout clip first.')
          url = URL.createObjectURL(config.file); video.src = url
          await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('This video format could not be played. Try MP4 or WebM.')); video.load() })
        }
        await model.initialize()
        if (cancelled) return
        setReady(true); onReady(config.id,true); setMessage('Camera ready · keep your whole body in frame')
      } catch (e) { if (!cancelled) { setMessage((e as Error).message); onReady(config.id,false,(e as Error).message) } }
    }
    void prepare()
    return () => { cancelled = true; model.dispose(); stream?.getTracks().forEach(t=>t.stop()); if(video) {video.pause(); video.srcObject=null;video.removeAttribute('src');video.load()} if(url) URL.revokeObjectURL(url); onReady(config.id,false) }
  }, [config.id,config.kind,config.file,config.deviceId,onReady])
  useEffect(() => {
    const video = videoRef.current
    if (!video || !ready) return
    if (!recording) { if (config.kind==='upload') video.pause(); return }
    let cancelled = false, pending = false, lastAt = 0
    lastMedia.current = -1
    if (config.kind==='upload') {
      const seekTo = Math.max(0,(overlapStart-config.offsetMs)/1000)
      if(seekTo>=video.duration) { setMessage('This offset is beyond the clip duration. Adjust synchronization.'); onEnded(config.id); return }
      video.currentTime=seekTo
      void video.play().catch(e => setMessage(`Playback failed: ${e.message}`))
    }
    const timer = window.setInterval(async () => {
      if(cancelled || pending || video.paused || video.ended || video.readyState<2 || !estimatorRef.current) return
      if(video.currentTime===lastMedia.current) return
      const now=performance.now()
      if(now-lastAt<180) return
      pending=true; lastAt=now; lastMedia.current=video.currentTime
      const timestampMs = config.kind==='upload' ? video.currentTime*1000 : now-epoch
      try {
        const result=await estimatorRef.current.estimate(video,now)
        if(cancelled) return
        const canvas=canvasRef.current, context=canvas?.getContext('2d')
        if(canvas && context) {canvas.width=video.videoWidth;canvas.height=video.videoHeight;context.clearRect(0,0,canvas.width,canvas.height)}
        if(result.poses.length!==1) {setMessage(result.poses.length ? 'Multiple people visible · scoring paused' : 'No athlete visible · scoring paused');return}
        const landmarks=result.poses[0].landmarks
        onFrame(config.id,{timestampMs,landmarks:landmarks.map(p=>({x:p.x,y:p.y,visibility:p.visibility??0}))},video.videoWidth/video.videoHeight)
        setCount(c=>c+1);setMessage('Capturing landmarks · video stays on this device')
        if(canvas && context) {context.strokeStyle='#fc4c02';context.lineWidth=3; for(const [a,b] of BONES) {if((landmarks[a].visibility??0)<.65 || (landmarks[b].visibility??0)<.65) continue; context.beginPath();context.moveTo(landmarks[a].x*canvas.width,landmarks[a].y*canvas.height);context.lineTo(landmarks[b].x*canvas.width,landmarks[b].y*canvas.height);context.stroke()}}
      } catch(e) { if(!cancelled) setMessage((e as Error).message) } finally {pending=false}
    },100)
    return ()=>{cancelled=true;window.clearInterval(timer);if(config.kind==='upload')video.pause()}
  },[recording,ready,epoch,overlapStart,config.id,config.kind,config.offsetMs,onFrame,onEnded])
  return <div className="capture-view">{showHeading && <div className="capture-view-heading">{config.kind==='camera'?<Camera size={15}/>:<Video size={15}/>}<strong>{config.id}</strong><span>{config.view==='auto'?'Estimate view':`${config.view} view`}</span></div>}<div className="capture-video"><video ref={videoRef} muted playsInline onEnded={()=>onEnded(config.id)} /><canvas ref={canvasRef}/><span className="capture-frame-count">{count} frames</span></div><p role="status">{message}</p></div>
}
