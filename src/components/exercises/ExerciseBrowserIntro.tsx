import { ArrowRight, Dumbbell, HeartPulse, ShieldCheck } from 'lucide-react'
import { EXERCISES, EXERCISE_CATEGORIES, type ExerciseCategory, type Movement } from '@/lib/exerciseLibrary'

interface Props {
  category: 'All' | ExerciseCategory
  onCategory: (category: 'All' | ExerciseCategory) => void
  onSelect: (movement: Movement) => void
}

const icons = { 'Strength foundations': ShieldCheck, 'Bodybuilding accessories': Dumbbell, 'Mobility & rehab': HeartPulse }

export default function ExerciseBrowserIntro({ category, onCategory, onSelect }: Props) {
  const visibleCategories = EXERCISE_CATEGORIES.slice(1).filter(item => category === 'All' || item === category) as ExerciseCategory[]
  return <section className="library-catalog" aria-label="Exercise categories">
    <div className="catalog-intro"><p className="studio-eyebrow">CHOOSE A TRAINING PATH</p><h2>Browse first.<br /><em>Then enter the studio.</em></h2><p>Select a category and movement. The guided 3D demonstration opens only when you are ready.</p></div>
    <div className="catalog-category-tabs">{EXERCISE_CATEGORIES.map(item => <button key={item} aria-pressed={category === item} onClick={() => onCategory(item)}>{item}</button>)}</div>
    {visibleCategories.map(section => {
      const Icon = icons[section]
      return <div className="catalog-section" key={section}><header><span><Icon size={17} /></span><div><h3>{section}</h3><p>{EXERCISES.filter(item => item.category === section).length} guided movements</p></div></header><div className="catalog-grid">{EXERCISES.filter(item => item.category === section).map(item => <button key={item.id} onClick={() => onSelect(item.id)}><span>{item.family}</span><strong>{item.name}</strong><small>{item.equipment}</small><ArrowRight size={15} /></button>)}</div></div>
    })}
  </section>
}
