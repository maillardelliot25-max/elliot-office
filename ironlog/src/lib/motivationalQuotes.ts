export const MOTIVATIONAL_QUOTES: string[] = [
  'One more rep than yesterday.',
  'The weight doesn’t care how you feel about it. Move it anyway.',
  'Form first, ego last.',
  'You don’t have to be fast. You have to be consistent.',
  'This rep is the only one that matters.',
  'Discomfort now, strength later.',
  'Nobody is coming to do this set for you.',
  'Control the descent. Own the rep.',
  'Tired is not the same as done.',
  'Small reps, stacked for months, become a different body.',
  'Breathe. Brace. Go.',
  'The last rep is where the set actually begins.',
  'You showed up. That’s the hard part, already done.',
  'Strong is built one uncomfortable rep at a time.',
  'Chase the rep, not the clock.',
]

export function pickQuote(previous?: string): string {
  if (MOTIVATIONAL_QUOTES.length <= 1) return MOTIVATIONAL_QUOTES[0]
  let next: string
  do {
    next = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
  } while (next === previous)
  return next
}
