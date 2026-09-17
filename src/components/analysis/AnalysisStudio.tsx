import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Camera, Check, CircleStop, Layers, Play, Plus, Save, ShieldCheck, Upload, X } from 'lucide-react'
import AnalysisShell from './AnalysisShell'
import CaptureView, { type CaptureConfig } from './CaptureView'
import AnalysisResults from './AnalysisResults'
import { evaluate, exerciseNames, type AnalysisFrame, type AnalysisReport, type CameraStream, type ExerciseId } from '@/lib/analysisApi'
import { api } from '@/lib/api'
import { emptyMuscleLoad } from '@/lib/muscleModel'
import { useAuth } from '@/lib/authContext'
import './analysis.css'

type Mode = 'camera' | 'upload' | 'multi'
const makeConfig = (n: number, kind: 'camera' | 'upload' = 'camera'): CaptureConfig => ({id:`Camera ${n}`,kind,deviceId:'',file:null,view:n===1?'side':'frontal',offsetMs:0})
export default function AnalysisStudio() {
  const { status }=useAuth()
  const [mode,setMode]=useState<Mode>('camera')
  const [configs,setConfigs]=useState<CaptureConfig[]>([makeConfig(1)])
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([])
  const [exercise,setExercise]=useState<ExerciseId|''>('')
  const [stage,setStage]=useState<'setup'|'ready'|'recording'|'review'>('setup')
  const [ready,setReady]=useState<Record<string,boolean>>({})
  const [synchronized,setSynchronized]=useState(false)
  const [epoch,setEpoch]=useState(0)
  const [report,setReport]=useState<AnalysisReport|null>(null)
  const [working,setWorking]=useState(false)
  const [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState(false)
  const [error,setError]=useState('')
  const [elapsed,setElapsed]=useState(0)
  const workoutId=useRef(crypto.randomUUID())
  const streams=useRef<Record<string,CameraStream>>({})
  const ended=useRef(new Set<string>())
  const generation=useRef(0)
  const finishRef=useRef<()=>void>(()=>{})
  const activeRef=useRef(false)
  const configRef=useRef(configs)
  const overlapStart=Math.max(...configs.map(c=>c.offsetMs))
  useEffect(()=>{configRef.current=configs},[configs])
  useEffect(()=>()=>{activeRef.current=false;generation.current++},[])
  const onReady=useCallback((id:string,value:boolean)=>setReady(r=>({...r,[id]:value})),[])
  const onFrame=useCallback((id:string,frame:AnalysisFrame,aspectRatio:number)=>{
    if(!activeRef.current)return
    const config=configRef.current.find(c=>c.id===id);if(!config)return
    const stream=streams.current[id]??{cameraId:id,aspectRatio,offsetMs:config.kind==='camera'?0:config.offsetMs,view:config.view,frames:[]}
    if(stream.frames.length>=1800){finishRef.current();return}
    if(stream.frames.length && frame.timestampMs<=stream.frames[stream.frames.length-1].timestampMs)return
    stream.frames.push(frame);streams.current[id]=stream
  },[])
  const onEnded=useCallback((id:string)=>{ended.current.add(id);if(ended.current.size===configRef.current.length&&activeRef.current)finishRef.current()},[])
  const selectMode=(value:Mode)=>{setMode(value);setConfigs(value==='multi'?[makeConfig(1),makeConfig(2)]:[makeConfig(1,value)]);setReady({});setSynchronized(false);setError('')}
  const updateConfig=(id:string,patch:Partial<CaptureConfig>)=>setConfigs(items=>items.map(c=>c.id===id?{...c,...patch}:c))
  async function detectCameras(){setError('');try{const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});stream.getTracks().forEach(t=>t.stop());setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'))}catch(e){setError((e as Error).message)}}
  function prepare(){
    setError('')
    if(configs.some(c=>c.kind==='upload'&&!c.file)){setError('Choose a clip for every uploaded view.');return}
    if(configs.some(c=>c.file&&c.file.size>500*1024*1024)){setError('Use clips smaller than 500 MB and no longer than six minutes.');return}
    const cameras=configs.filter(c=>c.kind==='camera')
    if(cameras.length>1 && (cameras.some(c=>!c.deviceId)||new Set(cameras.map(c=>c.deviceId)).size!==cameras.length)){setError('Detect cameras and select a different physical device for each live view.');return}
    if(configs.length>1&&!synchronized){setError('Confirm that all views show the same athlete and are synchronized.');return}
    setStage('ready')
  }
  function start(){streams.current={};ended.current=new Set();setReport(null);setError('');setElapsed(0);setSaved(false);generation.current++;activeRef.current=true;setEpoch(performance.now());setStage('recording')}
  const payloadStreams=()=>Object.values(streams.current).map(s=>({...s,frames:[...s.frames]}))
  async function finish(){
    if(!activeRef.current)return
    activeRef.current=false;generation.current++;setStage('review');setWorking(true)
    try{const input=payloadStreams();if(!input.length)throw new Error('No athlete landmarks were captured. Check the framing and try again.');if(input.length!==configs.length)throw new Error('A camera did not capture an athlete. Retry with visible, synchronized views.');setReport(await evaluate(input,exercise||null,configs.length>1&&synchronized,true));setError('')}catch(e){setError((e as Error).message)}finally{setWorking(false)}
  }
  useEffect(()=>{finishRef.current=()=>void finish()})
  useEffect(()=>{
    if(stage!=='recording')return
    const current=generation.current;let pending=false
    const timer=window.setInterval(()=>{
      const seconds=Math.floor((performance.now()-epoch)/1000);setElapsed(seconds)
      if(seconds>=360){finishRef.current();return}
      const input=Object.values(streams.current)
      if(pending||input.length!==configs.length||input.some(s=>s.frames.length<12))return
      pending=true;setWorking(true)
      void evaluate(input,exercise||null,configs.length>1&&synchronized).then(r=>{if(generation.current===current){setReport(r);setError('')}}).catch(e=>{if(generation.current===current)setError(e.message)}).finally(()=>{pending=false;if(generation.current===current)setWorking(false)})
    },2500)
    return()=>window.clearInterval(timer)
  },[stage,epoch,exercise,configs.length,synchronized])
  async function save(){
    if(!report?.analysisId||report.score===null)return
    setSaving(true);setError('')
    try{await api.saveSession({analysisId:report.analysisId,workoutId:workoutId.current,exerciseId:report.exercise??'',exerciseName:report.exerciseName,cameraAngle:report.views.map(v=>v.view).join(', '),durationSeconds:report.durationSeconds,totalReps:report.repCount,avgFormScore:report.score,peakEffort:0,muscleLoad:emptyMuscleLoad(),reps:[]});setSaved(true)}catch(e){setError((e as Error).message)}finally{setSaving(false)}
  }
  function reset(){generation.current++;activeRef.current=false;streams.current={};setStage('setup');setReport(null);setError('');setReady({});setSaved(false);setWorking(false)}
  const allReady=configs.every(c=>ready[c.id])
  return <AnalysisShell><main className="analysis-layout"><Link to="/dashboard" className="text-link"><ArrowLeft size={15}/>Back to dashboard</Link><div className="analysis-heading"><div><span className="eyebrow">TRAIN WITH INTENTION</span><h1>Your movement.<br/><span>A clearer picture.</span></h1></div><span className="analysis-private"><ShieldCheck size={16}/>Video stays on your device</span></div>
    {status!=='authenticated'&&<div className="social-card analysis-signin"><p>Sign in to analyze and save your workouts securely.</p><Link to="/login" state={{from:'/session'}} className="social-button primary">Sign in to analyze</Link><Link to="/signup" className="social-button">Create account</Link></div>}
    <div className="analysis-columns"><div className="analysis-capture-column">
      {stage==='setup'&&<section className="social-card analysis-setup"><div className="section-heading"><h2>Choose your perspective</h2><span className="social-muted">01 / CAPTURE</span></div><div className="capture-modes">{([{id:'camera',icon:Camera,title:'Live camera',text:'Real-time feedback'},{id:'upload',icon:Upload,title:'Upload a clip',text:'Review your recorded set'},{id:'multi',icon:Layers,title:'Multiple views',text:'Synchronized perspectives'}] as const).map(m=><button key={m.id} aria-pressed={mode===m.id} onClick={()=>selectMode(m.id)}><m.icon size={22}/><strong>{m.title}</strong><span>{m.text}</span></button>)}</div>
        <label className="exercise-confirm">Movement selection<select aria-label="Movement selection" value={exercise} onChange={e=>setExercise(e.target.value as ExerciseId|'')}><option value="">Automatically detect movement</option>{Object.entries(exerciseNames).map(([id,name])=><option value={id} key={id}>Confirm: {name}</option>)}</select></label><p className="social-muted">Six movement patterns supported. Bench press needs manual confirmation because landmarks alone cannot identify the equipment. Detection is experimental, not a calibrated probability.</p>
        {mode==='multi'&&<div className="multi-guidance"><h3>More angles. Not more guesswork.</h3><p>Use up to three cameras connected to this device, or synchronized clips of the same set. Start with a side view and add a frontal view. Separate phones must record clips first.</p><div className="source-kind"><button className="social-button" aria-pressed={configs[0].kind==='camera'} onClick={()=>setConfigs(items=>items.map(c=>({...c,kind:'camera',offsetMs:0,file:null})))}>Connected cameras</button><button className="social-button" aria-pressed={configs[0].kind==='upload'} onClick={()=>setConfigs(items=>items.map(c=>({...c,kind:'upload'})))}>Recorded clips</button></div></div>}
        {configs.some(c=>c.kind==='camera')&&<button className="social-button camera-detect" onClick={detectCameras}><Camera size={15}/>Detect connected cameras</button>}
        <div className="capture-configs">{configs.map((c,index)=><div key={c.id} className="capture-config"><div className="section-heading"><h3>{c.id}{index===0?' · Primary':''}</h3>{configs.length>2&&index>1&&<button aria-label={`Remove ${c.id}`} onClick={()=>setConfigs(items=>items.filter(v=>v.id!==c.id))}><X size={16}/></button>}</div>
          {c.kind==='camera'?<label>Camera device<select aria-label={`${c.id} device`} value={c.deviceId} onChange={e=>updateConfig(c.id,{deviceId:e.target.value})}><option value="">Default camera</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Device ${i+1}`}</option>)}</select></label>:<label>Workout clip<input aria-label={`${c.id} clip`} type="file" accept="video/*" onChange={e=>updateConfig(c.id,{file:e.target.files?.[0]??null})}/></label>}
          <div className="capture-config-details"><label>Camera perspective<select aria-label={`${c.id} perspective`} value={c.view} onChange={e=>updateConfig(c.id,{view:e.target.value as CaptureConfig['view']})}><option value="auto">Estimate from landmarks</option><option value="side">Side · range of motion</option><option value="frontal">Frontal · knee tracking</option><option value="oblique">Oblique · limited scoring</option></select></label>{c.kind==='upload'&&configs.length>1&&<label>Timeline offset (seconds)<input aria-label={`${c.id} offset`} type="number" step="0.1" min={-3600} max={3600} value={c.offsetMs/1000} onChange={e=>updateConfig(c.id,{offsetMs:Number(e.target.value)*1000})}/></label>}</div>
        </div>)}</div>
        {mode==='multi'&&configs.length<3&&<button className="social-button" onClick={()=>setConfigs(items=>[...items,makeConfig(items.length+1,items[0].kind)])}><Plus size={15}/>Add third view</button>}
        {mode==='multi'&&<div className="sync-confirm"><p>For clips, align a visible event (such as a clap): common time = clip time + offset. If the clap is at 2s in Camera 1 and 5s in Camera 2, set Camera 2 to −3s. No automatic synchronization is claimed.</p><label><input type="checkbox" checked={synchronized} onChange={e=>setSynchronized(e.target.checked)}/>All views show the same athlete and set; clip offsets align the same event.</label></div>}
        <div className="capture-prep-note"><ShieldCheck size={16}/><p>Keep the full body visible. Record one person, avoid obstructions, and use a stable camera. Maximum six minutes per set. Only landmarks are sent for analysis.</p></div><button className="social-button primary prepare-button" disabled={status!=='authenticated'} onClick={prepare}><Camera size={16}/>{configs[0].kind==='upload'?'Load workout clips':'Prepare cameras'}</button>
      </section>}
      {(stage==='ready'||stage==='recording')&&<section className="social-card capture-live"><div className="section-heading"><h2>{stage==='recording'?'Recording your movement':'Check your framing'}</h2><span className="recording-timer">{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}</span></div><div className={`capture-grid ${configs.length>1?'multi':''}`}>{configs.map(c=><CaptureView key={c.id} config={c} recording={stage==='recording'} epoch={epoch} overlapStart={overlapStart} onFrame={onFrame} onReady={onReady} onEnded={onEnded}/>)}</div><div className="capture-actions">{stage==='ready'?<><button className="social-button" onClick={reset}>Change setup</button><button className="social-button primary" disabled={!allReady} onClick={start}><Play size={16}/>{allReady?'Start analysis':'Preparing views…'}</button></>:<button className="social-button primary" onClick={()=>void finish()}><CircleStop size={17}/>Finish analysis</button>}</div><p className="social-muted">Start extended, complete each repetition, and return to your starting position. Missing landmarks pause scoring.</p></section>}
      {stage==='review'&&<section className="social-card analysis-review"><span className="eyebrow">YOUR SET, IN PERSPECTIVE</span><h2>{saved?'Workout saved. Nice work.':'Let’s look at the evidence.'}</h2><p>{saved?'Head to your dashboard to review this session.':'Review the visible checks before saving. No score means there was not enough evidence—not that your form was bad.'}</p><div className="capture-actions"><button className="social-button" disabled={working||saving} onClick={reset}>Analyze another set</button>{saved?<Link className="social-button primary" to="/dashboard"><Check size={16}/>Back to activity feed</Link>:<button className="social-button primary" disabled={working||saving||report?.score==null||!report.analysisId} onClick={save}><Save size={16}/>{saving?'Saving…':'Save workout'}</button>}</div></section>}
      {error&&<p className="social-error" role="alert">{error}</p>}
      <div className="analysis-method"><h3>How your form is assessed</h3><p>Browser pose tracking → timestamped landmarks → server-side movement detection → view-specific checks → per-rep evidence. Multi-camera repetitions are counted once, with additional views contributing only synchronized, visible checks.</p><p>Visible-check scores are experimental rules, not an overall safety rating. We do not infer injury risk, load, facial strain or effort.</p><Link to="/session?demo=1" className="text-link">Explore the separately labeled simulated demo</Link></div>
    </div><AnalysisResults report={report} working={working}/></div>
  </main></AnalysisShell>
}
