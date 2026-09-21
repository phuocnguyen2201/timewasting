// Word banks for themed word search rounds. Kept as short, commonly-known
// words (unlike the general English dictionary used by Guess the Word) so a
// found word always reads as "obviously part of the theme" — see
// generatePuzzle() in grid.js for how a round picks a subset that fits the
// chosen grid size.
export const THEMES = {
  Animals: [
    'CAT', 'DOG', 'FOX', 'LION', 'BEAR', 'WOLF', 'DEER', 'GOAT',
    'ZEBRA', 'HORSE', 'SHEEP', 'MOUSE', 'TIGER', 'RABBIT', 'MONKEY',
    'PANDA', 'KOALA', 'CAMEL', 'OTTER', 'EAGLE', 'DOLPHIN',
  ],
  Fruits: [
    'FIG', 'KIWI', 'LIME', 'PLUM', 'DATE', 'PEAR', 'APPLE', 'MANGO',
    'GRAPE', 'LEMON', 'MELON', 'PEACH', 'BERRY', 'CHERRY', 'BANANA',
    'ORANGE', 'PAPAYA', 'GUAVA', 'COCONUT',
  ],
  Ocean: [
    'FISH', 'CRAB', 'WAVE', 'REEF', 'TIDE', 'WHALE', 'SHARK', 'CORAL',
    'SQUID', 'PEARL', 'ANCHOR', 'ISLAND', 'TURTLE', 'DOLPHIN', 'SEAWEED',
    'OCTOPUS', 'STARFISH',
  ],
  Space: [
    'SUN', 'STAR', 'MOON', 'MARS', 'VENUS', 'COMET', 'ORBIT', 'PLUTO',
    'SATURN', 'GALAXY', 'METEOR', 'ROCKET', 'PLANET', 'NEBULA', 'COSMOS',
    'ASTEROID',
  ],
  Sports: [
    'BALL', 'GOAL', 'TEAM', 'RACE', 'SWIM', 'GOLF', 'CHESS', 'SKATE',
    'ARENA', 'MEDAL', 'COACH', 'RUGBY', 'BOXING', 'HOCKEY', 'TENNIS',
    'SOCCER',
  ],
  Weather: [
    'RAIN', 'SNOW', 'WIND', 'STORM', 'CLOUD', 'SUNNY', 'FROST', 'HUMID',
    'FOGGY', 'BREEZE', 'DROUGHT', 'RAINBOW', 'THUNDER', 'LIGHTNING',
  ],
  Kitchen: [
    'CUP', 'PAN', 'FORK', 'OVEN', 'BOWL', 'PLATE', 'SPOON', 'KNIFE',
    'STOVE', 'LADLE', 'WHISK', 'KETTLE', 'PANTRY', 'BLENDER', 'SKILLET',
    'TOASTER',
  ],
  School: [
    'PEN', 'BOOK', 'DESK', 'CHALK', 'RULER', 'CRAYON', 'ERASER', 'PENCIL',
    'LOCKER', 'RECESS', 'TEACHER', 'STUDENT', 'LIBRARY', 'BACKPACK',
  ],
}

export function pickRandomTheme() {
  const names = Object.keys(THEMES)
  return names[Math.floor(Math.random() * names.length)]
}
