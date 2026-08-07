import { kgToLb, lbToKg } from './calculations'
import type { WeightUnit } from '../types'

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  const value = unit === 'kg' ? weightKg : kgToLb(weightKg)
  const rounded = Math.round(value * 10) / 10
  return `${rounded} ${unit}`
}

export function displayWeight(weightKg: number, unit: WeightUnit): number {
  const value = unit === 'kg' ? weightKg : kgToLb(weightKg)
  return Math.round(value * 10) / 10
}

/** Converts a value typed in the user's preferred unit back to kg for storage. */
export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const minutes = Math.max(0, Math.round((end - start) / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return `${hours}h ${rem}m`
}

export function formatVolume(volumeKg: number, unit: WeightUnit): string {
  const value = unit === 'kg' ? volumeKg : kgToLb(volumeKg)
  return `${Math.round(value).toLocaleString()} ${unit}`
}
